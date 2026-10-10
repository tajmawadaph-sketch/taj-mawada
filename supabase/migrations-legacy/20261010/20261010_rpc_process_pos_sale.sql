-- ==============================================================================
-- Migration: 20261010_rpc_process_pos_sale.sql
-- Description: Standardized POS Sale RPC enforcing strict Sub-Ledger accounting:
--              partner_id is ONLY set on customer receivable lines (123).
--              General company accounts (122, 129, 41, 215, 511, 126) have partner_id = NULL.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_process_pos_sale(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_invoice_id          UUID := gen_random_uuid();
    v_invoice_number      TEXT;
    v_date                TIMESTAMP WITH TIME ZONE;
    v_partner_id          UUID;
    v_warehouse_id        UUID;
    v_delegate_id         UUID;
    v_shift_id            UUID;
    v_payment_method      TEXT;
    v_client_name         TEXT;
    v_materials_discount  NUMERIC(15, 2) := 0.00;
    v_paid_amount         NUMERIC(15, 2) := 0.00;
    v_notes               TEXT;
    v_subtotal            NUMERIC(15, 2) := 0.00;
    v_taxable_amount      NUMERIC(15, 2) := 0.00;
    v_vat_amount          NUMERIC(15, 2) := 0.00;
    v_total_amount        NUMERIC(15, 2) := 0.00;
    v_total_cogs          NUMERIC(15, 2) := 0.00;
    v_shift_status        TEXT;
    v_line                JSONB;
    v_item_id             UUID;
    v_qty                 NUMERIC(15, 2);
    v_unit_price          NUMERIC(15, 2);
    v_cost_price          NUMERIC(15, 2);
    v_line_discount       NUMERIC(15, 2);
    v_current_stock       NUMERIC(15, 2);
    v_item_name           TEXT;
    v_journal_id          UUID := gen_random_uuid();
    v_acc_cash_id         UUID;
    v_acc_bank_id         UUID;
    v_acc_receivable_id   UUID;
    v_acc_cogs_id         UUID;
    v_acc_revenue_id      UUID;
    v_acc_vat_payable_id  UUID;
    v_acc_inventory_id    UUID;
    v_total_debit         NUMERIC(15, 2) := 0.00;
    v_total_credit        NUMERIC(15, 2) := 0.00;
BEGIN
    v_invoice_number     := TRIM(p_data->>'invoice_number');
    IF v_invoice_number IS NULL OR v_invoice_number = '' THEN
        RAISE EXCEPTION 'رقم الفاتورة مطلوب (invoice_number is required)';
    END IF;

    -- Idempotency Guard
    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = v_invoice_number) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'invoice_number', v_invoice_number,
            'message', 'تم تسجيل هذه الفاتورة مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    v_date               := COALESCE((p_data->>'date')::TIMESTAMPTZ, NOW());
    v_partner_id         := (p_data->>'partner_id')::UUID;
    v_warehouse_id       := (p_data->>'warehouse_id')::UUID;
    v_delegate_id        := (p_data->>'delegate_id')::UUID;
    v_shift_id           := (p_data->>'shift_id')::UUID;
    v_payment_method     := COALESCE(p_data->>'payment_method', 'cash');
    v_materials_discount := COALESCE((p_data->>'materials_discount')::NUMERIC, 0.00);
    v_paid_amount        := COALESCE((p_data->>'paid_amount')::NUMERIC, 0.00);
    v_notes              := p_data->>'notes';

    IF v_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'المستودع مطلوب لإتمام الفاتورة (warehouse_id is required)';
    END IF;

    IF v_shift_id IS NOT NULL THEN
        SELECT status INTO v_shift_status FROM public.pos_shifts WHERE id = v_shift_id;
        IF v_shift_status IS NULL OR v_shift_status != 'open' THEN
            RAISE EXCEPTION 'وردية الكاشير غير موجودة أو مغلقة بالفعل (Shift is not open)';
        END IF;
    END IF;

    IF p_data->'lines' IS NULL OR jsonb_array_length(p_data->'lines') = 0 THEN
        RAISE EXCEPTION 'لا يمكن إصدار فاتورة بدون أصناف (Invoice must contain at least one line)';
    END IF;

    IF v_partner_id IS NOT NULL THEN
        SELECT name INTO v_client_name FROM public.partners WHERE id = v_partner_id;
    END IF;
    v_client_name := COALESCE(v_client_name, p_data->>'client_name', 'عميل نقدي');

    -- Stock check & COGS calculation
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'lines')
    LOOP
        v_item_id        := (v_line->>'item_id')::UUID;
        v_qty            := COALESCE((v_line->>'quantity')::NUMERIC, 0);
        v_unit_price     := COALESCE((v_line->>'unit_price')::NUMERIC, 0);
        v_cost_price     := COALESCE((v_line->>'cost_price')::NUMERIC, 0);
        v_line_discount  := COALESCE((v_line->>'discount')::NUMERIC, 0);

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من الصفر للصنف %', v_item_id;
        END IF;

        SELECT wi.quantity, ii.name, COALESCE(ii.cost_price, 0)
        INTO v_current_stock, v_item_name, v_cost_price
        FROM public.warehouse_inventory wi
        JOIN public.inventory_items ii ON ii.id = wi.item_id
        WHERE wi.warehouse_id = v_warehouse_id AND wi.item_id = v_item_id
        FOR UPDATE OF wi;

        IF NOT FOUND THEN
            SELECT name INTO v_item_name FROM public.inventory_items WHERE id = v_item_id;
            RAISE EXCEPTION 'الصنف [%] غير مدرج في هذا المستودع ولا يوجد منه رصيد', COALESCE(v_item_name, v_item_id::TEXT);
        END IF;

        IF v_current_stock < v_qty THEN
            RAISE EXCEPTION 'رصيد الصنف [%] غير كافٍ! المتوفر: %، والمطلوب: %', v_item_name, v_current_stock, v_qty;
        END IF;

        v_subtotal   := v_subtotal + ((v_qty * v_unit_price) - v_line_discount);
        v_total_cogs := v_total_cogs + (v_qty * v_cost_price);
    END LOOP;

    v_taxable_amount := ROUND(v_subtotal - v_materials_discount, 2);
    v_vat_amount     := ROUND(v_taxable_amount * 0.15, 2);
    v_total_amount   := v_taxable_amount + v_vat_amount;

    IF v_payment_method IN ('cash', 'card', 'multi') AND v_paid_amount = 0 THEN
        v_paid_amount := v_total_amount;
    END IF;

    -- Insert Invoice
    INSERT INTO public.invoices (
        id, invoice_number, date, partner_id, client_name, total_amount, taxable_amount, tax_amount, materials_discount, payment_method, paid_amount, status, warehouse_id, delegate_id, shift_id, lines_data, created_at
    ) VALUES (
        v_invoice_id, v_invoice_number, v_date, v_partner_id, v_client_name, v_total_amount, v_taxable_amount, v_vat_amount, v_materials_discount, v_payment_method, v_paid_amount, CASE WHEN v_paid_amount >= v_total_amount THEN 'paid' ELSE 'partial' END, v_warehouse_id, v_delegate_id, v_shift_id, p_data->'lines', NOW()
    );

    -- Stock deductions
    FOR v_line IN SELECT * FROM jsonb_array_elements(p_data->'lines')
    LOOP
        v_item_id    := (v_line->>'item_id')::UUID;
        v_qty        := (v_line->>'quantity')::NUMERIC;
        v_unit_price := (v_line->>'unit_price')::NUMERIC;

        UPDATE public.warehouse_inventory
        SET quantity = quantity - v_qty, updated_at = NOW()
        WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id;

        UPDATE public.inventory_items
        SET current_quantity = current_quantity - v_qty
        WHERE id = v_item_id;

        INSERT INTO public.inventory_transactions (
            id, transaction_number, transaction_date, type, quantity, item_id, warehouse_id, unit_price, total_price, status, invoice_id, shift_id, created_at
        ) VALUES (
            gen_random_uuid(), 'TX-' || v_invoice_number, v_date, 'sales_deduction', v_qty, v_item_id, v_warehouse_id, v_unit_price, ROUND(v_qty * v_unit_price, 2), 'completed', v_invoice_id, v_shift_id, NOW()
        );
    END LOOP;

    -- Lookup accounts
    SELECT id INTO v_acc_cash_id        FROM public.accounts WHERE code = '122' LIMIT 1;
    SELECT id INTO v_acc_bank_id        FROM public.accounts WHERE code = '129' LIMIT 1;
    SELECT id INTO v_acc_receivable_id  FROM public.accounts WHERE code = '123' LIMIT 1;
    SELECT id INTO v_acc_cogs_id        FROM public.accounts WHERE code = '511' LIMIT 1;
    SELECT id INTO v_acc_revenue_id     FROM public.accounts WHERE code = '41'  LIMIT 1;
    SELECT id INTO v_acc_vat_payable_id FROM public.accounts WHERE code = '215' LIMIT 1;
    SELECT id INTO v_acc_inventory_id   FROM public.accounts WHERE code = '126' LIMIT 1;

    INSERT INTO public.journal_headers (
        id, entry_date, description, status, v_type, reference_id, created_at
    ) VALUES (
        v_journal_id, v_date::DATE, 'إثبات مبيعات نقطة البيع فاتورة رقم: ' || v_invoice_number || ' - ' || v_client_name, 'posted', 'pos_sale', v_invoice_id, NOW()
    );

    -- Debit side:
    -- If cash or card -> partner_id = NULL (Company asset)
    -- If credit -> partner_id = v_partner_id (Customer debt)
    IF v_payment_method = 'cash' THEN
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_cash_id, NULL, v_total_amount, 0.00, 'تحصيل نقدي بالصندوق');
        v_total_debit := v_total_debit + v_total_amount;
    ELSIF v_payment_method = 'card' THEN
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_bank_id, NULL, v_total_amount, 0.00, 'تحصيل عبر أجهزة مدى/الشبكة');
        v_total_debit := v_total_debit + v_total_amount;
    ELSE
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_receivable_id, v_partner_id, v_total_amount, 0.00, 'ذمم مدينة - مبيعات آجلة');
        v_total_debit := v_total_debit + v_total_amount;
    END IF;

    -- Revenue (Credit) -> partner_id = NULL
    INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
    VALUES (v_journal_id, v_acc_revenue_id, NULL, 0.00, v_taxable_amount, 'إيرادات مبيعات بضاعة');
    v_total_credit := v_total_credit + v_taxable_amount;

    -- VAT (Credit) -> partner_id = NULL
    IF v_vat_amount > 0 THEN
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_vat_payable_id, NULL, 0.00, v_vat_amount, 'ضريبة القيمة المضافة المستحقة 15%');
        v_total_credit := v_total_credit + v_vat_amount;
    END IF;

    -- Perpetual COGS entry -> partner_id = NULL on both sides
    IF v_total_cogs > 0 THEN
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_cogs_id, NULL, v_total_cogs, 0.00, 'تكلفة البضاعة المباعة');
        v_total_debit := v_total_debit + v_total_cogs;

        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_acc_inventory_id, NULL, 0.00, v_total_cogs, 'صرف بضاعة من المخزون');
        v_total_credit := v_total_credit + v_total_cogs;
    END IF;

    IF v_total_debit != v_total_credit THEN
        RAISE EXCEPTION 'القيد المحاسبي غير متزن! المدين: %، الدائن: %', v_total_debit, v_total_credit;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'journal_id', v_journal_id,
        'total_amount', v_total_amount,
        'taxable_amount', v_taxable_amount,
        'vat_amount', v_vat_amount,
        'cogs', v_total_cogs,
        'message', 'تم تسجيل الفاتورة وترحيل القيد والخصم المخزني بنجاح'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_process_pos_sale(JSONB) TO anon, authenticated, service_role;
