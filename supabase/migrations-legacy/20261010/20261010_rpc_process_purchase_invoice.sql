-- ==============================================================================
-- Migration: 20261010_rpc_process_purchase_invoice.sql
-- Description: Production-grade atomic RPC for vendor purchase invoices,
--              inventory receiving, weighted average cost (WAC) recalculation,
--              and input VAT double-entry journal posting.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_process_purchase_invoice(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    -- Header parameters
    v_invoice_number            TEXT;
    v_date                      DATE;
    v_supplier_id               UUID;
    v_supplier_name             TEXT;
    v_supplier_acc_id           UUID;
    
    v_warehouse_id              UUID;
    v_warehouse_name            TEXT;
    v_delegate_id               UUID;
    v_safe_bank_acc_id          UUID;
    
    v_payment_method            TEXT;
    v_payment_mode              TEXT; -- 'credit', 'cash', 'bank'
    v_notes                     TEXT;
    v_lines                     JSONB;
    
    -- Line loop variables
    v_line                      JSONB;
    v_idx                       INT := 0;
    v_item_id                   UUID;
    v_item_name                 TEXT;
    v_item_unit                 TEXT;
    v_old_cost                  NUMERIC(15, 4);
    v_old_qty                   NUMERIC(15, 4);
    v_qty                       NUMERIC(15, 4);
    v_unit_cost                 NUMERIC(15, 4);
    v_tax_rate                  NUMERIC(15, 4);
    v_discount                  NUMERIC(15, 4);
    v_line_subtotal             NUMERIC(15, 4);
    v_line_tax                  NUMERIC(15, 4);
    v_line_total                NUMERIC(15, 4);
    v_new_wac_cost              NUMERIC(15, 4);
    v_new_total_qty             NUMERIC(15, 4);
    
    -- Totals
    v_taxable_amount            NUMERIC(15, 4) := 0;
    v_tax_amount                NUMERIC(15, 4) := 0;
    v_total_amount              NUMERIC(15, 4) := 0;
    
    -- Transaction & Output
    v_first_txn_id              UUID := NULL;
    v_txn_id                    UUID;
    v_txn_number                TEXT;
    v_created_items             JSONB := '[]'::jsonb;
    
    -- Accounting
    v_journal_id                UUID := NULL;
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid; -- 126 مخزون البضائع
    v_acc_vat_input             UUID := '990c949c-5f32-40d7-8d36-5fe45a6c892c'::uuid; -- 215 ضريبة القيمة المضافة
    v_acc_suppliers_ap          UUID := '2ca6f54c-5f37-49a0-8c41-e37f94b09752'::uuid; -- 211 الموردين
    v_acc_cash_box              UUID := '21b8a1db-bc9f-4cf8-b741-1efeded0963c'::uuid; -- 122 الخزينة الرئيسية
    v_acc_banks                 UUID := 'da7ee249-ee43-47da-9e8c-3d623c3f1b50'::uuid; -- 129 البنوك
    v_credit_acc                UUID;
    v_credit_notes              TEXT;
BEGIN
    -- 1. Input Extraction & Validation
    v_invoice_number := TRIM(COALESCE(p_data->>'invoice_number', p_data->>'invoice_no', ''));
    IF v_invoice_number = '' THEN
        v_invoice_number := 'PUR-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), NULLIF(p_data->>'invoice_date', ''), CURRENT_DATE::text)::date;

    BEGIN
        v_supplier_id := (COALESCE(p_data->>'supplier_id', p_data->>'partner_id', p_data->>'vendor_id'))::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف المورد (supplier_id) غير صالح';
    END;

    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'المورد مطلوب لإثبات فاتورة المشتريات';
    END IF;

    -- Look up supplier details
    SELECT name, account_id
    INTO v_supplier_name, v_supplier_acc_id
    FROM public.partners
    WHERE id = v_supplier_id;

    IF v_supplier_name IS NULL THEN
        RAISE EXCEPTION 'بيانات المورد غير مسجلة في النظام';
    END IF;

    v_warehouse_id := (p_data->>'warehouse_id')::uuid;
    IF v_warehouse_id IS NULL THEN
        -- Default to Main Warehouse
        v_warehouse_id := '11111111-1111-1111-1111-111111111111'::uuid;
    END IF;

    SELECT name INTO v_warehouse_name
    FROM public.warehouses
    WHERE id = v_warehouse_id;

    IF v_warehouse_name IS NULL THEN
        RAISE EXCEPTION 'المستودع المستلم غير موجود أو غير نشط';
    END IF;

    IF p_data->>'delegate_id' IS NOT NULL AND TRIM(p_data->>'delegate_id') <> '' THEN
        BEGIN
            v_delegate_id := (p_data->>'delegate_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_delegate_id := NULL;
        END;
    END IF;

    IF p_data->>'safe_bank_acc_id' IS NOT NULL AND TRIM(p_data->>'safe_bank_acc_id') <> '' THEN
        BEGIN
            v_safe_bank_acc_id := (p_data->>'safe_bank_acc_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_safe_bank_acc_id := NULL;
        END;
    END IF;

    v_payment_method := COALESCE(p_data->>'payment_method', 'آجل');
    v_notes := COALESCE(p_data->>'notes', p_data->>'description', '');
    v_lines := COALESCE(p_data->'lines', p_data->'items');

    IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
        RAISE EXCEPTION 'يجب أن تحتوي فاتورة المشتريات على صنف واحد على الأقل';
    END IF;

    -- 2. Idempotency Guard (Anti-Duplicate Check)
    IF EXISTS (
        SELECT 1 FROM public.inventory_transactions 
        WHERE transaction_number = 'PUR-' || v_invoice_number || '-1'
           OR transaction_number = 'PUR-' || v_invoice_number
           OR transaction_number = v_invoice_number
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'invoice_number', v_invoice_number,
            'message', 'تم تسجيل فاتورة المشتريات مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    -- Classify Payment Mode
    IF v_payment_method ILIKE '%نقدي%' OR v_payment_method ILIKE '%كاش%' OR v_payment_method = 'cash' THEN
        v_payment_mode := 'cash';
        v_credit_acc := COALESCE(v_safe_bank_acc_id, v_acc_cash_box);
        v_credit_notes := 'سداد نقدي مباشر لفاتورة مشتريات #' || v_invoice_number || ' من الخزينة';
    ELSIF v_payment_method ILIKE '%بنك%' OR v_payment_method ILIKE '%تحويل%' OR v_payment_method ILIKE '%شبكة%' OR v_payment_method = 'bank' THEN
        v_payment_mode := 'bank';
        v_credit_acc := COALESCE(v_safe_bank_acc_id, v_acc_banks);
        v_credit_notes := 'سداد بنكي مباشر لفاتورة مشتريات #' || v_invoice_number || ' عبر البنك';
    ELSE
        v_payment_mode := 'credit';
        v_credit_acc := COALESCE(v_supplier_acc_id, v_acc_suppliers_ap);
        v_credit_notes := 'استحقاق آجل لفاتورة مشتريات #' || v_invoice_number || ' ذمة المورد: ' || v_supplier_name;
    END IF;

    -- 3. Inventory Receiving, Stock Inflow & WAC Recalculation Loop
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
        v_unit_cost := COALESCE((v_line->>'unit_cost')::numeric, (v_line->>'cost_price')::numeric, (v_line->>'unit_price')::numeric, 0);
        v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, 15);
        v_discount := COALESCE((v_line->>'discount_amount')::numeric, 0);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'معرّف الصنف غير صالح في السطر رقم %', v_idx;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'كمية التوريد يجب أن تكون أكبر من الصفر في السطر رقم %', v_idx;
        END IF;

        IF v_unit_cost < 0 THEN
            RAISE EXCEPTION 'سعر شراء الصنف لا يمكن أن يكون سالباً في السطر رقم %', v_idx;
        END IF;

        -- Lock item master for atomic WAC calculation
        SELECT name, unit, COALESCE(cost_price, 0), COALESCE(current_quantity, 0)
        INTO v_item_name, v_item_unit, v_old_cost, v_old_qty
        FROM public.inventory_items
        WHERE id = v_item_id
        FOR UPDATE;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'الصنف برقم % غير مسجل في النظام', v_item_id;
        END IF;

        -- Math
        v_line_subtotal := GREATEST(0, (v_qty * v_unit_cost) - v_discount);
        v_line_tax := ROUND((v_line_subtotal * (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_subtotal + v_line_tax;

        v_taxable_amount := v_taxable_amount + v_line_subtotal;
        v_tax_amount := v_tax_amount + v_line_tax;
        v_total_amount := v_total_amount + v_line_total;

        -- Weighted Average Cost (WAC) formula:
        -- WAC = ((Old_Qty * Old_Cost) + (New_Qty * New_Cost)) / (Old_Qty + New_Qty)
        v_new_total_qty := v_old_qty + v_qty;
        IF v_new_total_qty > 0 THEN
            IF v_old_qty <= 0 THEN
                v_new_wac_cost := v_unit_cost;
            ELSE
                v_new_wac_cost := ROUND(((v_old_qty * v_old_cost) + (v_qty * v_unit_cost)) / v_new_total_qty, 4);
            END IF;
        ELSE
            v_new_wac_cost := v_unit_cost;
        END IF;

        -- 3.1 Update inventory_items: update cost_price and current_quantity
        UPDATE public.inventory_items
        SET 
            cost_price = v_new_wac_cost,
            current_quantity = current_quantity + v_qty
        WHERE id = v_item_id;

        -- 3.2 Upsert warehouse_inventory: increase warehouse stock
        INSERT INTO public.warehouse_inventory (
            warehouse_id, item_id, quantity, updated_at
        ) VALUES (
            v_warehouse_id, v_item_id, v_qty, NOW()
        )
        ON CONFLICT (warehouse_id, item_id)
        DO UPDATE SET
            quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 3.3 Insert inventory receiving audit transaction (type = 'in')
        v_txn_number := 'PUR-' || v_invoice_number || '-' || v_idx;
        v_txn_id := gen_random_uuid();
        IF v_first_txn_id IS NULL THEN
            v_first_txn_id := v_txn_id;
        END IF;

        INSERT INTO public.inventory_transactions (
            id,
            transaction_number,
            transaction_date,
            type,
            quantity,
            item_id,
            partner_id,
            delegate_id,
            warehouse_id,
            unit_price,
            total_price,
            tax_amount,
            include_tax,
            notes,
            status,
            created_at
        ) VALUES (
            v_txn_id,
            v_txn_number,
            v_date,
            'in',
            v_qty,
            v_item_id,
            v_supplier_id,
            v_delegate_id,
            v_warehouse_id,
            v_unit_cost,
            v_line_subtotal,
            v_line_tax,
            true,
            'توريد مشتريات فاتورة مورد #' || v_invoice_number || ' - ' || v_item_name,
            'approved',
            NOW()
        );

        -- Append to result array
        v_created_items := v_created_items || jsonb_build_object(
            'item_id', v_item_id,
            'item_name', v_item_name,
            'quantity', v_qty,
            'unit_cost', v_unit_cost,
            'old_cost', v_old_cost,
            'new_wac_cost', v_new_wac_cost,
            'subtotal', v_line_subtotal,
            'tax_amount', v_line_tax,
            'total', v_line_total,
            'transaction_id', v_txn_id
        );
    END LOOP;

    -- 4. Balanced Double-Entry General Ledger Journal Entry
    IF v_total_amount > 0 THEN
        INSERT INTO public.journal_headers (
            entry_date,
            description,
            status,
            v_type,
            reference_id
        ) VALUES (
            v_date,
            'فاتورة مشتريات وتوريد مخزني #' || v_invoice_number || ' - المورد: ' || v_supplier_name,
            'posted',
            'purchase',
            v_first_txn_id
        ) RETURNING id INTO v_journal_id;

        -- 4.1 Debit Line: Inventory Asset (126) -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_inventory, NULL, v_delegate_id,
            v_taxable_amount, 0,
            'إثبات توريد بضاعة للمخزون فاتورة مشتريات #' || v_invoice_number
        );

        -- 4.2 Debit Line: Input VAT Recoverable (215) -> partner_id = NULL
        IF v_tax_amount > 0 THEN
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, debit, credit, notes
            ) VALUES (
                v_journal_id, v_acc_vat_input, NULL, v_delegate_id,
                v_tax_amount, 0,
                'ضريبة القيمة المضافة مدخلات مشتريات فاتورة #' || v_invoice_number
            );
        END IF;

        -- 4.3 Credit Line: Accounts Payable (211) -> partner_id = v_supplier_id; Cash/Bank -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_credit_acc, CASE WHEN v_payment_mode = 'credit' THEN v_supplier_id ELSE NULL END, v_delegate_id,
            0, v_total_amount,
            v_credit_notes
        );

        -- Link journal_id to the created inventory transactions
        UPDATE public.inventory_transactions
        SET journal_id = v_journal_id
        WHERE transaction_number LIKE 'PUR-' || v_invoice_number || '-%';
    END IF;

    -- 5. Return Detailed Summary Response
    RETURN jsonb_build_object(
        'success', true,
        'invoice_number', v_invoice_number,
        'date', v_date,
        'journal_id', v_journal_id,
        'supplier_id', v_supplier_id,
        'supplier_name', v_supplier_name,
        'payment_method', v_payment_method,
        'payment_mode', v_payment_mode,
        'warehouse_id', v_warehouse_id,
        'warehouse_name', v_warehouse_name,
        'taxable_amount', v_taxable_amount,
        'tax_amount', v_tax_amount,
        'total_amount', v_total_amount,
        'lines_count', v_idx,
        'items', v_created_items,
        'message', 'تم إثبات فاتورة المشتريات والتوريد المخزني واحتساب متوسط التكلفة وترحيل القيد بنجاح'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_process_purchase_invoice(JSONB) TO anon, authenticated, service_role;
