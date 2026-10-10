-- ==============================================================================
-- Migration: 20261010_rpc_process_sales_invoice.sql
-- Description: Atomic B2B Sales Invoicing, Credit Limit Enforcement & Revenue Recognition
-- Author: Principal Database Architect
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_process_sales_invoice(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    -- Header parameters
    v_invoice_id                UUID;
    v_invoice_number            TEXT;
    v_date                      DATE;
    v_partner_id                UUID;
    v_partner_name              TEXT;
    v_partner_acc_id            UUID;
    v_credit_limit              NUMERIC(15, 4);
    v_current_balance           NUMERIC(15, 4) := 0;
    
    v_warehouse_id              UUID;
    v_warehouse_name            TEXT;
    v_delegate_id               UUID;
    v_fleet_operation_id        UUID;
    v_safe_bank_acc_id          UUID;
    
    v_payment_method            TEXT;
    v_payment_mode              TEXT; -- 'cash', 'bank', 'credit'
    v_status                    TEXT;
    v_payment_status            TEXT;
    v_due_date                  DATE;
    v_due_in_days               INT;
    v_notes                     TEXT;
    v_lines                     JSONB;
    
    -- Line iteration variables
    v_line                      JSONB;
    v_idx                       INT := 0;
    v_item_id                   UUID;
    v_item_name                 TEXT;
    v_item_unit                 TEXT;
    v_item_cost                 NUMERIC(15, 4);
    v_qty                       NUMERIC(15, 4);
    v_unit_price                NUMERIC(15, 4);
    v_tax_rate                  NUMERIC(15, 4);
    v_discount                  NUMERIC(15, 4);
    v_line_subtotal             NUMERIC(15, 4);
    v_line_tax                  NUMERIC(15, 4);
    v_line_total                NUMERIC(15, 4);
    v_stock_qty                 NUMERIC(15, 4);
    
    -- Totals
    v_taxable_amount            NUMERIC(15, 4) := 0;
    v_tax_amount                NUMERIC(15, 4) := 0;
    v_total_amount              NUMERIC(15, 4) := 0;
    v_paid_amount               NUMERIC(15, 4) := 0;
    v_total_cogs                NUMERIC(15, 4) := 0;
    
    -- Formatted lines array for JSON storage
    v_enriched_lines            JSONB := '[]'::jsonb;
    
    -- Journal
    v_journal_id                UUID := NULL;
    v_acc_customers_ar          UUID := '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid; -- 123 العملاء
    v_acc_cash_box              UUID := '21b8a1db-bc9f-4cf8-b741-1efeded0963c'::uuid; -- 122 الخزينة الرئيسية
    v_acc_banks                 UUID := 'da7ee249-ee43-47da-9e8c-3d623c3f1b50'::uuid; -- 129 البنوك
    v_acc_sales_revenue         UUID := '6667f91a-9478-49ab-9721-521ee09381fa'::uuid; -- 41 إيرادات المبيعات
    v_acc_vat_payable           UUID := '990c949c-5f32-40d7-8d36-5fe45a6c892c'::uuid; -- 215 ضريبة القيمة المضافة
    v_acc_cogs                  UUID := 'e03c1430-0275-424f-8a93-eae8bc8990bf'::uuid; -- 511 تكلفة المبيعات
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid; -- 126 مخزون البضائع
    v_debit_acc                 UUID;
BEGIN
    -- 1. Input Extraction
    v_invoice_number := TRIM(COALESCE(p_data->>'invoice_number', p_data->>'invoice_no', ''));
    IF v_invoice_number = '' THEN
        v_invoice_number := 'INV-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), NULLIF(p_data->>'invoice_date', ''), CURRENT_DATE::text)::date;

    BEGIN
        v_partner_id := (p_data->>'partner_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف العميل (partner_id) غير صالح';
    END;

    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'العميل مطلوب لإصدار الفاتورة';
    END IF;

    -- Look up customer details
    SELECT name, account_id, credit_limit
    INTO v_partner_name, v_partner_acc_id, v_credit_limit
    FROM public.partners
    WHERE id = v_partner_id;

    IF v_partner_name IS NULL THEN
        RAISE EXCEPTION 'بيانات العميل غير موجودة في النظام';
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
        RAISE EXCEPTION 'المستودع المحدد غير موجود أو غير نشط';
    END IF;

    IF p_data->>'delegate_id' IS NOT NULL AND TRIM(p_data->>'delegate_id') <> '' THEN
        BEGIN
            v_delegate_id := (p_data->>'delegate_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_delegate_id := NULL;
        END;
    END IF;

    IF p_data->>'fleet_operation_id' IS NOT NULL AND TRIM(p_data->>'fleet_operation_id') <> '' THEN
        BEGIN
            v_fleet_operation_id := (p_data->>'fleet_operation_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_fleet_operation_id := NULL;
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
        RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
    END IF;

    -- 2. Idempotency Guard (Anti-Duplicate Check)
    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = v_invoice_number) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'invoice_number', v_invoice_number,
            'message', 'تم إصدار الفاتورة مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    -- Classify Payment Mode
    IF v_payment_method ILIKE '%نقدي%' OR v_payment_method ILIKE '%كاش%' OR v_payment_method = 'cash' THEN
        v_payment_mode := 'cash';
        v_debit_acc := COALESCE(v_safe_bank_acc_id, v_acc_cash_box);
    ELSIF v_payment_method ILIKE '%بنك%' OR v_payment_method ILIKE '%تحويل%' OR v_payment_method ILIKE '%شبكة%' OR v_payment_method = 'bank' THEN
        v_payment_mode := 'bank';
        v_debit_acc := COALESCE(v_safe_bank_acc_id, v_acc_banks);
    ELSE
        v_payment_mode := 'credit';
        v_debit_acc := COALESCE(v_partner_acc_id, v_acc_customers_ar);
    END IF;

    -- 3. Calculate Totals & Stock Verification Loop
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
        v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
        v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, 15);
        v_discount := COALESCE((v_line->>'discount_amount')::numeric, 0);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'معرّف الصنف غير صالح في السطر رقم %', v_idx;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'كمية الصنف يجب أن تكون أكبر من صفر في السطر رقم %', v_idx;
        END IF;

        IF v_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الصنف لا يمكن أن يكون سالباً في السطر رقم %', v_idx;
        END IF;

        -- Fetch item master
        SELECT name, unit, COALESCE(cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'الصنف برقم % غير مسجل في النظام', v_item_id;
        END IF;

        -- Line math
        v_line_subtotal := GREATEST(0, (v_qty * v_unit_price) - v_discount);
        v_line_tax := ROUND((v_line_subtotal * (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_subtotal + v_line_tax;

        v_taxable_amount := v_taxable_amount + v_line_subtotal;
        v_tax_amount := v_tax_amount + v_line_tax;
        v_total_amount := v_total_amount + v_line_total;
        v_total_cogs := v_total_cogs + (v_qty * v_item_cost);

        -- Pessimistic Lock on warehouse inventory
        SELECT COALESCE(quantity, 0) INTO v_stock_qty
        FROM public.warehouse_inventory
        WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id
        FOR UPDATE;

        IF NOT FOUND OR v_stock_qty < v_qty THEN
            RAISE EXCEPTION 'رصيد الصنف "%" غير كافٍ في مستودع البيع (%). المتاح: % %، المطلوب: % %',
                v_item_name, v_warehouse_name, COALESCE(v_stock_qty, 0), COALESCE(v_item_unit, 'وحدة'), v_qty, COALESCE(v_item_unit, 'وحدة');
        END IF;

        -- Append enriched line
        v_enriched_lines := v_enriched_lines || jsonb_build_object(
            'item_id', v_item_id,
            'item_name', v_item_name,
            'unit', v_item_unit,
            'quantity', v_qty,
            'unit_price', v_unit_price,
            'discount_amount', v_discount,
            'subtotal', v_line_subtotal,
            'tax_rate', v_tax_rate,
            'tax_amount', v_line_tax,
            'total', v_line_total,
            'unit_cost', v_item_cost
        );
    END LOOP;

    -- 4. Customer Credit Limit Check
    IF v_payment_mode = 'credit' AND v_credit_limit IS NOT NULL AND v_credit_limit > 0 THEN
        SELECT COALESCE(SUM(total_amount - paid_amount), 0)
        INTO v_current_balance
        FROM public.invoices
        WHERE partner_id = v_partner_id
          AND status NOT IN ('paid', 'cancelled', 'ملغاة');

        IF (v_current_balance + v_total_amount) > v_credit_limit THEN
            RAISE EXCEPTION 'تم تجاوز السقف الائتماني للعميل "%". الرصيد القائم: % ر.س، قيمة الفاتورة: % ر.س (الإجمالي: % ر.س)، السقف الائتماني المسموح به: % ر.س',
                v_partner_name, v_current_balance, v_total_amount, (v_current_balance + v_total_amount), v_credit_limit;
        END IF;
    END IF;

    -- Determine Invoice Payment Status
    IF v_payment_mode IN ('cash', 'bank') THEN
        v_paid_amount := v_total_amount;
        v_status := 'paid';
        v_payment_status := 'paid';
    ELSE
        v_paid_amount := COALESCE((p_data->>'paid_amount')::numeric, 0);
        IF v_paid_amount >= v_total_amount THEN
            v_status := 'paid';
            v_payment_status := 'paid';
        ELSIF v_paid_amount > 0 THEN
            v_status := 'partial';
            v_payment_status := 'partial';
        ELSE
            v_status := 'unpaid';
            v_payment_status := 'unpaid';
        END IF;
    END IF;

    v_due_in_days := COALESCE((p_data->>'due_in_days')::int, 30);
    v_due_date := COALESCE(NULLIF(p_data->>'due_date', '')::date, (v_date + (v_due_in_days || ' days')::interval)::date);

    -- 5. Insert Invoice Header
    v_invoice_id := gen_random_uuid();

    INSERT INTO public.invoices (
        id,
        invoice_number,
        date,
        partner_id,
        client_name,
        description,
        taxable_amount,
        tax_amount,
        total_amount,
        paid_amount,
        status,
        payment_status,
        payment_method,
        warehouse_id,
        delegate_id,
        fleet_operation_id,
        lines_data,
        debit_account_id,
        credit_account_id,
        tax_acc_id,
        due_date,
        due_in_days,
        skip_zatca,
        created_at
    ) VALUES (
        v_invoice_id,
        v_invoice_number,
        v_date,
        v_partner_id,
        v_partner_name,
        v_notes,
        v_taxable_amount,
        v_tax_amount,
        v_total_amount,
        v_paid_amount,
        v_status,
        v_payment_status,
        v_payment_method,
        v_warehouse_id,
        v_delegate_id,
        v_fleet_operation_id,
        v_enriched_lines,
        v_debit_acc,
        v_acc_sales_revenue,
        v_acc_vat_payable,
        v_due_date,
        v_due_in_days,
        COALESCE((p_data->>'skip_zatca')::boolean, false),
        NOW()
    );

    -- 6. Deduct Inventory & Record Audit Logs
    v_idx := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := (v_line->>'quantity')::numeric;

        SELECT name, unit, COALESCE(cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        -- Deduct from warehouse_inventory
        UPDATE public.warehouse_inventory
        SET quantity = quantity - v_qty,
            updated_at = NOW()
        WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id;

        -- Deduct from global item current_quantity
        UPDATE public.inventory_items
        SET current_quantity = GREATEST(0, COALESCE(current_quantity, 0) - v_qty)
        WHERE id = v_item_id;

        -- Audit transaction
        INSERT INTO public.inventory_transactions (
            id,
            transaction_number,
            transaction_date,
            type,
            quantity,
            item_id,
            partner_id,
            delegate_id,
            fleet_operation_id,
            warehouse_id,
            invoice_id,
            unit_price,
            total_price,
            notes,
            status,
            created_at
        ) VALUES (
            gen_random_uuid(),
            'SAL-' || v_invoice_number || '-' || v_idx,
            v_date,
            'sales_deduction',
            v_qty,
            v_item_id,
            v_partner_id,
            v_delegate_id,
            v_fleet_operation_id,
            v_warehouse_id,
            v_invoice_id,
            v_item_cost,
            v_qty * v_item_cost,
            'صرف بضاعة مباعة بفاتورة #' || v_invoice_number || ' - صنف: ' || v_item_name,
            'approved',
            NOW()
        );
    END LOOP;

    -- 7. Balanced Double-Entry General Ledger Journal Entry
    INSERT INTO public.journal_headers (
        entry_date,
        description,
        status,
        v_type,
        reference_id,
        fleet_operation_id
    ) VALUES (
        v_date,
        'فاتورة مبيعات #' || v_invoice_number || ' - العميل: ' || v_partner_name,
        'posted',
        'invoice',
        v_invoice_id,
        v_fleet_operation_id
    ) RETURNING id INTO v_journal_id;

    -- 7.1 Debit Line (Receivable or Cash/Bank)
    IF v_payment_mode = 'credit' AND v_paid_amount > 0 AND v_paid_amount < v_total_amount THEN
        -- Cash part (company asset) -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, COALESCE(v_safe_bank_acc_id, v_acc_cash_box), NULL, v_delegate_id, v_fleet_operation_id,
            v_paid_amount, 0, 'دفعة نقدية مع الفاتورة #' || v_invoice_number
        );

        -- Receivable part (partner liability) -> partner_id = v_partner_id
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_customers_ar, v_partner_id, v_delegate_id, v_fleet_operation_id,
            (v_total_amount - v_paid_amount), 0, 'المتبقي الآجل فاتورة #' || v_invoice_number || ' ذمة: ' || v_partner_name
        );
    ELSIF v_payment_mode = 'credit' THEN
        -- Full Credit -> partner_id = v_partner_id
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_customers_ar, v_partner_id, v_delegate_id, v_fleet_operation_id,
            v_total_amount, 0, 'استحقاق آجل فاتورة مبيعات #' || v_invoice_number || ' ذمة: ' || v_partner_name
        );
    ELSE
        -- Cash or Bank -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_debit_acc, NULL, v_delegate_id, v_fleet_operation_id,
            v_total_amount, 0, 'تحصيل نقدي/بنكي لفاتورة مبيعات #' || v_invoice_number
        );
    END IF;

    -- 7.2 Credit Line (Sales Revenue - 41) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
    ) VALUES (
        v_journal_id, v_acc_sales_revenue, NULL, v_delegate_id, v_fleet_operation_id,
        0, v_taxable_amount, 'إيراد مبيعات فاتورة #' || v_invoice_number
    );

    -- 7.3 Credit Line (VAT Payable - 215) -> partner_id = NULL
    IF v_tax_amount > 0 THEN
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_vat_payable, NULL, v_delegate_id, v_fleet_operation_id,
            0, v_tax_amount, 'ضريبة القيمة المضافة 15% فاتورة #' || v_invoice_number
        );
    END IF;

    -- 7.4 Perpetual Inventory & COGS Entry (Debit 511, Credit 126) -> partner_id = NULL
    IF v_total_cogs > 0 THEN
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_cogs, NULL, v_delegate_id, v_fleet_operation_id,
            v_total_cogs, 0, 'تكلفة البضاعة المباعة (COGS) فاتورة #' || v_invoice_number
        );

        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_inventory, NULL, v_delegate_id, v_fleet_operation_id,
            0, v_total_cogs, 'صرف مخزون البضائع المباعة فاتورة #' || v_invoice_number
        );
    END IF;

    -- Link journal_id to inventory_transactions
    UPDATE public.inventory_transactions
    SET journal_id = v_journal_id
    WHERE invoice_id = v_invoice_id;

    -- 8. Return Comprehensive JSON Result
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'date', v_date,
        'journal_id', v_journal_id,
        'partner_id', v_partner_id,
        'client_name', v_partner_name,
        'payment_method', v_payment_method,
        'status', v_status,
        'payment_status', v_payment_status,
        'taxable_amount', v_taxable_amount,
        'tax_amount', v_tax_amount,
        'total_amount', v_total_amount,
        'paid_amount', v_paid_amount,
        'cogs_total', v_total_cogs,
        'lines_count', v_idx,
        'warehouse_id', v_warehouse_id,
        'warehouse_name', v_warehouse_name,
        'message', 'تم إصدار فاتورة المبيعات وترحيل القيود وتحديث المخزون بنجاح'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_process_sales_invoice(JSONB) TO anon, authenticated, service_role;
