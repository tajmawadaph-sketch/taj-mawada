-- ============================================================================
-- 🚀 RPC PHASE 5: rpc_process_inventory_adjustment(p_data JSONB)
-- Atomic Inventory Reconciliation, Damage Write-offs, Stock Delta & Balanced Journal
-- ============================================================================

-- تحديث وتوسيع قيد فحص أنواع الحركات في inventory_transactions
ALTER TABLE public.inventory_transactions 
DROP CONSTRAINT IF EXISTS inventory_transactions_type_check;

ALTER TABLE public.inventory_transactions 
ADD CONSTRAINT inventory_transactions_type_check 
CHECK (type IN (
  'in', 'out', 'transfer_out', 'transfer_in', 
  'sales_deduction', 'waste', 'empty_return', 
  'adjustment_in', 'adjustment_out', 'damage', 'reconciliation'
));

-- إنشاء الفهرس الفريد لمنع تكرار سجلات المخزون للمستودع الواحد
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_inventory_wh_item 
ON public.warehouse_inventory (warehouse_id, item_id);

CREATE OR REPLACE FUNCTION public.rpc_process_inventory_adjustment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_custom_id             UUID;
    v_adjustment_id         UUID;
    v_adjustment_number     TEXT;
    v_date                  TIMESTAMPTZ;
    v_warehouse_id          UUID;
    v_warehouse_name        TEXT;
    v_adj_type              TEXT;
    v_notes                 TEXT;
    
    v_line                  JSONB;
    v_item_id               UUID;
    v_item_name             TEXT;
    v_system_qty            NUMERIC(14, 4);
    v_actual_qty            NUMERIC(14, 4);
    v_qty_diff              NUMERIC(14, 4);
    v_unit_cost             NUMERIC(14, 4);
    v_cost_diff             NUMERIC(14, 2);
    v_reason                TEXT;
    v_tx_type               TEXT;
    
    v_total_deficit_cost    NUMERIC(14, 2) := 0.00;
    v_total_surplus_cost    NUMERIC(14, 2) := 0.00;
    v_net_cost_diff         NUMERIC(14, 2) := 0.00;
    
    v_acc_inventory_id      UUID;
    v_acc_loss_id           UUID;
    v_acc_surplus_id        UUID;
    v_journal_id            UUID := NULL;
    
    v_adjusted_lines        JSONB := '[]'::JSONB;
    v_total_items_adjusted  INT := 0;
BEGIN
    -- 1. فحص درع الحماية ومنع التكرار (Idempotency Guard & Anti-Duplicate)
    v_custom_id         := (p_data->>'id')::UUID;
    v_adjustment_id     := COALESCE(v_custom_id, gen_random_uuid());
    v_adjustment_number := COALESCE(p_data->>'adjustment_number', 'ADJ-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'));
    v_date              := COALESCE((p_data->>'date')::TIMESTAMPTZ, NOW());
    v_warehouse_id      := (p_data->>'warehouse_id')::UUID;
    v_adj_type          := LOWER(COALESCE(p_data->>'type', 'count_reconciliation'));
    v_notes             := p_data->>'notes';

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'المستودع مطلوب لإتمام التسوية (warehouse_id is required)';
    END IF;

    SELECT name INTO v_warehouse_name FROM public.warehouses WHERE id = v_warehouse_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'المستودع المحدد (%) غير موجود في النظام', v_warehouse_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.journal_headers 
        WHERE (v_custom_id IS NOT NULL AND reference_id = v_custom_id)
           OR (description LIKE '%' || v_adjustment_number || '%')
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'adjustment_number', v_adjustment_number,
            'warehouse_id', v_warehouse_id,
            'message', 'محضر التسوية والجرد مرحل ومسجل بالفعل مسبقاً 🟢'
        );
    END IF;

    -- التحقق من وجود سطور الجرد
    IF p_data->'lines' IS NULL OR jsonb_array_length(p_data->'lines') = 0 THEN
        RAISE EXCEPTION 'يجب تمرير أصناف للتسوية (lines array is empty)';
    END IF;

    -- 2. جلب الحسابات المحاسبية المطلوبة
    SELECT id INTO v_acc_inventory_id FROM public.accounts WHERE code = '126' OR name ILIKE '%مخزون البضائع%' ORDER BY CASE WHEN code = '126' THEN 1 ELSE 2 END LIMIT 1;
    SELECT id INTO v_acc_loss_id      FROM public.accounts WHERE code = '528' OR name ILIKE '%خسائر توالف%' OR name ILIKE '%هدر مخزني%' ORDER BY CASE WHEN code = '528' THEN 1 ELSE 2 END LIMIT 1;
    SELECT id INTO v_acc_surplus_id   FROM public.accounts WHERE code = '44'  OR name ILIKE '%إيرادات أخرى متنوعة%' ORDER BY CASE WHEN code = '44' THEN 1 ELSE 2 END LIMIT 1;

    IF v_acc_inventory_id IS NULL THEN
        RAISE EXCEPTION 'حساب مخزون البضائع (126) غير موجود في دليل الحسابات';
    END IF;

    -- 3. معالجة بنود التسوية وقفل السجلات (Row-Level Locking) وحساب الفروقات
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'lines')
    LOOP
        v_item_id    := (v_line->>'item_id')::UUID;
        v_actual_qty := ROUND(COALESCE((v_line->>'actual_qty')::NUMERIC, 0), 4);
        v_reason     := COALESCE(v_line->>'reason', v_notes);

        -- قفل سجل المخزون لهذا الصنف في هذا المستودع
        SELECT wi.quantity, ii.name, COALESCE((v_line->>'unit_cost')::NUMERIC, ii.cost_price, 0)
        INTO v_system_qty, v_item_name, v_unit_cost
        FROM public.inventory_items ii
        LEFT JOIN public.warehouse_inventory wi ON (wi.warehouse_id = v_warehouse_id AND wi.item_id = ii.id)
        WHERE ii.id = v_item_id
        FOR UPDATE OF ii;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'الصنف المحدد (%) غير موجود في النظام', v_item_id;
        END IF;

        -- إذا لم يكن هناك سجل في المستودع بعد، نعتبر الرصيد الدفتري 0
        v_system_qty := COALESCE(v_system_qty, (v_line->>'system_qty')::NUMERIC, 0);
        v_qty_diff   := v_actual_qty - v_system_qty;
        v_cost_diff  := ROUND(v_qty_diff * v_unit_cost, 2);

        -- إذا كان هناك فرق في الكمية، نقوم بالتسوية
        IF v_qty_diff != 0 THEN
            v_total_items_adjusted := v_total_items_adjusted + 1;

            -- تحديد نوع الحركة المخزنية
            IF v_adj_type = 'damage_writeoff' THEN
                v_tx_type := 'waste';
                v_total_deficit_cost := v_total_deficit_cost + ABS(v_cost_diff);
            ELSIF v_qty_diff < 0 THEN
                v_tx_type := 'waste'; -- عجز / توالف
                v_total_deficit_cost := v_total_deficit_cost + ABS(v_cost_diff);
            ELSE
                v_tx_type := 'adjustment_in'; -- فائض جردي
                v_total_surplus_cost := v_total_surplus_cost + v_cost_diff;
            END IF;

            -- تحديث رصيد المستودع (warehouse_inventory) ليطابق الرصيد الفعلي بدقة
            UPDATE public.warehouse_inventory
            SET quantity = v_actual_qty, updated_at = NOW()
            WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id;

            IF NOT FOUND THEN
                INSERT INTO public.warehouse_inventory (id, warehouse_id, item_id, quantity, updated_at)
                VALUES (gen_random_uuid(), v_warehouse_id, v_item_id, v_actual_qty, NOW());
            END IF;

            -- تحديث إجمالي رصيد الصنف في الكتالوج (inventory_items)
            UPDATE public.inventory_items
            SET current_quantity = COALESCE(current_quantity, 0) + v_qty_diff
            WHERE id = v_item_id;

            -- تسجيل حركة في كارت الصنف وسجل الحركات المخزنية (inventory_transactions)
            INSERT INTO public.inventory_transactions (
                id,
                transaction_number,
                transaction_date,
                type,
                quantity,
                item_id,
                warehouse_id,
                unit_price,
                total_price,
                status,
                notes,
                created_at
            ) VALUES (
                gen_random_uuid(),
                v_adjustment_number || '-' || SUBSTRING(v_item_id::TEXT, 1, 6),
                v_date::DATE,
                v_tx_type,
                ABS(v_qty_diff),
                v_item_id,
                v_warehouse_id,
                v_unit_cost,
                ABS(v_cost_diff),
                'completed',
                COALESCE(v_reason, 'تسوية جردية - ' || v_adjustment_number),
                NOW()
            );

            v_adjusted_lines := v_adjusted_lines || jsonb_build_object(
                'item_id', v_item_id,
                'item_name', v_item_name,
                'system_qty', v_system_qty,
                'actual_qty', v_actual_qty,
                'qty_diff', v_qty_diff,
                'unit_cost', v_unit_cost,
                'cost_diff', v_cost_diff,
                'type', v_tx_type
            );
        END IF;
    END LOOP;

    -- 4. توليد القيود المحاسبية المزدوجة المتزنة للفروقات المالية
    IF (v_total_deficit_cost > 0 OR v_total_surplus_cost > 0) THEN
        v_journal_id := gen_random_uuid();
        
        INSERT INTO public.journal_headers (
            id, entry_date, description, status, v_type, reference_id, created_at
        ) VALUES (
            v_journal_id,
            v_date::DATE,
            'تسوية جرد مخزني رقم: ' || v_adjustment_number || ' - مستودع: ' || v_warehouse_name,
            'posted',
            'inventory_adjustment',
            v_adjustment_id,
            NOW()
        );

        -- أ. في حالة وجود عجز أو توالف (Deficit / Shrinkage / Waste):
        -- من حـ/ خسائر توالف وهدر مخزني (528) [مدين]
        -- إلى حـ/ مخزون البضائع (126) [دائن]
        IF v_total_deficit_cost > 0 THEN
            IF v_acc_loss_id IS NULL THEN
                RAISE EXCEPTION 'حساب خسائر توالف وهدر مخزني (528) غير معرف';
            END IF;

            INSERT INTO public.journal_lines (header_id, account_id, debit, credit, notes)
            VALUES (v_journal_id, v_acc_loss_id, v_total_deficit_cost, 0.00, 'إثبات خسائر عجز وتوالف الجرد #' || v_adjustment_number);

            INSERT INTO public.journal_lines (header_id, account_id, debit, credit, notes)
            VALUES (v_journal_id, v_acc_inventory_id, 0.00, v_total_deficit_cost, 'تخفيض قيمة المخزون بالعجز الفعلي #' || v_adjustment_number);
        END IF;

        -- ب. في حالة وجود فائض جردي (Surplus):
        -- من حـ/ مخزون البضائع (126) [مدين]
        -- إلى حـ/ إيرادات أخرى متنوعة - تسويات جردية (44) [دائن]
        IF v_total_surplus_cost > 0 THEN
            IF v_acc_surplus_id IS NULL THEN
                RAISE EXCEPTION 'حساب إيرادات تسويات جردية (44) غير معرف';
            END IF;

            INSERT INTO public.journal_lines (header_id, account_id, debit, credit, notes)
            VALUES (v_journal_id, v_acc_inventory_id, v_total_surplus_cost, 0.00, 'زيادة قيمة المخزون بالفائض الفعلي #' || v_adjustment_number);

            INSERT INTO public.journal_lines (header_id, account_id, debit, credit, notes)
            VALUES (v_journal_id, v_acc_surplus_id, 0.00, v_total_surplus_cost, 'إثبات أرباح فائض تسويات الجرد #' || v_adjustment_number);
        END IF;
    END IF;

    v_net_cost_diff := v_total_surplus_cost - v_total_deficit_cost;

    -- 5. الاستجابة
    RETURN jsonb_build_object(
        'success', true,
        'adjustment_id', v_adjustment_id,
        'adjustment_number', v_adjustment_number,
        'warehouse_id', v_warehouse_id,
        'warehouse_name', v_warehouse_name,
        'date', v_date::DATE,
        'type', v_adj_type,
        'items_adjusted_count', v_total_items_adjusted,
        'total_deficit_cost', v_total_deficit_cost,
        'total_surplus_cost', v_total_surplus_cost,
        'net_cost_diff', v_net_cost_diff,
        'journal_id', v_journal_id,
        'adjusted_lines', v_adjusted_lines,
        'message', 'تم اعتماد محضر التسوية المخزنية وتحديث كروت الأصناف وترحيل القيود بنجاح 📋📦'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_process_inventory_adjustment(JSONB) TO authenticated, service_role, anon;
