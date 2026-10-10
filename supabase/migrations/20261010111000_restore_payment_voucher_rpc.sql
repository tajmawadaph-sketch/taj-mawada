CREATE OR REPLACE FUNCTION public.rpc_process_payment_voucher(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_custom_id             UUID;
    v_voucher_id            UUID;
    v_voucher_number        TEXT;
    v_date                  TIMESTAMPTZ;
    v_amount                NUMERIC(14, 2);
    v_payment_method        TEXT;
    v_partner_id            UUID;
    v_partner_name          TEXT;
    v_partner_type          TEXT;
    v_partner_custom_acc    UUID;
    v_credit_account_id     UUID;
    v_debit_account_id      UUID;
    v_shift_id              UUID;
    v_shift_status          TEXT;
    v_related_expense_id    UUID;
    v_sub_claim_id          UUID;
    v_fleet_operation_id    UUID;
    v_reference_no          TEXT;
    v_site_ref              TEXT;
    v_description           TEXT;
    v_notes                 TEXT;
    v_status                TEXT;
    v_is_posted             BOOLEAN;
    v_created_by            UUID;
    
    v_journal_id            UUID;
BEGIN
    -- 1. فحص درع الحماية ومنع التكرار (Idempotency Guard & Anti-Duplicate)
    v_custom_id      := (p_data->>'id')::UUID;
    v_voucher_id     := COALESCE(v_custom_id, gen_random_uuid());
    v_voucher_number := COALESCE(p_data->>'voucher_number', 'PV-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'));
    
    IF EXISTS (
        SELECT 1 FROM public.payment_vouchers 
        WHERE (v_custom_id IS NOT NULL AND id = v_custom_id) 
           OR (v_voucher_number IS NOT NULL AND voucher_number = v_voucher_number)
    ) THEN
        SELECT id, voucher_number, amount, partner_id, status, is_posted
        INTO v_voucher_id, v_voucher_number, v_amount, v_partner_id, v_status, v_is_posted
        FROM public.payment_vouchers 
        WHERE (v_custom_id IS NOT NULL AND id = v_custom_id) 
           OR (v_voucher_number IS NOT NULL AND voucher_number = v_voucher_number)
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'voucher_id', v_voucher_id,
            'voucher_number', v_voucher_number,
            'amount', v_amount,
            'partner_id', v_partner_id,
            'status', v_status,
            'is_posted', v_is_posted,
            'message', 'سند الصرف مسجل ومرحل بالفعل مسبقاً 🟢'
        );
    END IF;

    -- 2. التحقق من المدخلات الأساسية
    v_amount := ROUND(COALESCE((p_data->>'amount')::NUMERIC, 0), 2);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ سند الصرف يجب أن يكون أكبر من الصفر (Amount must be greater than zero)';
    END IF;

    v_date               := COALESCE((p_data->>'date')::TIMESTAMPTZ, NOW());
    v_payment_method     := LOWER(COALESCE(p_data->>'payment_method', 'cash'));
    v_partner_id         := (p_data->>'partner_id')::UUID;
    v_credit_account_id  := COALESCE((p_data->>'credit_account_id')::UUID, (p_data->>'safe_bank_acc_id')::UUID);
    v_debit_account_id   := (p_data->>'debit_account_id')::UUID;
    v_shift_id           := (p_data->>'shift_id')::UUID;
    v_related_expense_id := (p_data->>'related_expense_id')::UUID;
    v_sub_claim_id       := (p_data->>'sub_claim_id')::UUID;
    v_fleet_operation_id := (p_data->>'fleet_operation_id')::UUID;
    v_reference_no       := COALESCE(p_data->>'reference_no', p_data->>'reference_number');
    v_site_ref           := p_data->>'site_ref';
    v_notes              := p_data->>'notes';
    v_description        := COALESCE(p_data->>'description', v_notes, 'سند صرف نقدي / بنكي');
    v_status             := COALESCE(p_data->>'status', 'معتمد');
    v_created_by         := (p_data->>'created_by')::UUID;

    -- التحقق من المستفيد إن وُجد
    IF v_partner_id IS NOT NULL THEN
        SELECT name, partner_type, account_id 
        INTO v_partner_name, v_partner_type, v_partner_custom_acc
        FROM public.partners 
        WHERE id = v_partner_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'المستفيد المحدد (%) غير موجود في قاعدة البيانات', v_partner_id;
        END IF;
    END IF;

    -- التحقق من الوردية إن كانت مرتبطة بنقطة بيع
    IF v_shift_id IS NOT NULL THEN
        SELECT status INTO v_shift_status FROM public.pos_shifts WHERE id = v_shift_id;
        IF v_shift_status IS NULL OR v_shift_status != 'open' THEN
            RAISE EXCEPTION 'وردية الكاشير المرتبطة بالسند مغلقة أو غير صالحة';
        END IF;
    END IF;

    -- 3. التحديد الذكي للحسابات الدائنة والمدينة
    -- الطرف الدائن (خروج النقدية من الخزينة أو البنك):
    IF v_credit_account_id IS NULL THEN
        IF v_payment_method IN ('cash', 'كاش', 'نقدي', 'نقدي (كاش)') THEN
            SELECT id INTO v_credit_account_id 
            FROM public.accounts 
            WHERE code = '122' OR name ILIKE '%الخزينة%' 
            ORDER BY CASE WHEN code = '122' THEN 1 ELSE 2 END 
            LIMIT 1;
        ELSE
            SELECT id INTO v_credit_account_id 
            FROM public.accounts 
            WHERE code IN ('1291', '129') OR name ILIKE '%الراجحي%' OR name ILIKE '%البنوك%' 
            ORDER BY CASE WHEN code = '1291' THEN 1 WHEN code = '129' THEN 2 ELSE 3 END 
            LIMIT 1;
        END IF;
    END IF;

    -- الطرف المدين (أين صُرف المال: ذمم موردين أو مصروفات عمومية أو عهدة):
    IF v_debit_account_id IS NULL THEN
        IF v_partner_custom_acc IS NOT NULL THEN
            v_debit_account_id := v_partner_custom_acc;
        ELSIF v_partner_id IS NOT NULL THEN
            IF v_partner_type IN ('مورد', 'موردين', 'supplier', 'vendor') THEN
                SELECT id INTO v_debit_account_id 
                FROM public.accounts 
                WHERE code = '211' OR name ILIKE '%مورد%' 
                ORDER BY CASE WHEN code = '211' THEN 1 ELSE 2 END 
                LIMIT 1;
            ELSIF v_partner_type IN ('موظف', 'مندوب', 'employee', 'delegate') THEN
                SELECT id INTO v_debit_account_id 
                FROM public.accounts 
                WHERE code = '125' OR name ILIKE '%عهدة%' 
                ORDER BY CASE WHEN code = '125' THEN 1 ELSE 2 END 
                LIMIT 1;
            ELSE
                SELECT id INTO v_debit_account_id 
                FROM public.accounts 
                WHERE code = '211' OR code = '52' 
                ORDER BY CASE WHEN code = '211' THEN 1 ELSE 2 END 
                LIMIT 1;
            END IF;
        ELSE
            -- مصروفات إدارية وعمومية افتراضية
            SELECT id INTO v_debit_account_id 
            FROM public.accounts 
            WHERE code = '52' OR name ILIKE '%مصروفات إدارية%' 
            ORDER BY CASE WHEN code = '52' THEN 1 ELSE 2 END 
            LIMIT 1;
        END IF;
    END IF;

    IF v_credit_account_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد حساب الخزينة أو البنك الدائن (122 أو 129 غير معرف)';
    END IF;

    IF v_debit_account_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد حساب الصرف أو ذمم الموردين المدين (211 أو 52 غير معرف)';
    END IF;

    -- 4. إدراج سجل سند الصرف في payment_vouchers
    INSERT INTO public.payment_vouchers (
        id,
        voucher_number,
        date,
        amount,
        partner_id,
        credit_account_id,
        debit_account_id,
        payment_method,
        reference_no,
        description,
        notes,
        status,
        is_posted,
        created_by,
        site_ref,
        related_expense_id,
        sub_claim_id,
        fleet_operation_id,
        shift_id,
        created_at,
        updated_at
    ) VALUES (
        v_voucher_id,
        v_voucher_number,
        v_date::DATE,
        v_amount,
        v_partner_id,
        v_credit_account_id,
        v_debit_account_id,
        v_payment_method,
        v_reference_no,
        v_description,
        v_notes,
        v_status,
        TRUE,
        v_created_by,
        v_site_ref,
        v_related_expense_id,
        v_sub_claim_id,
        v_fleet_operation_id,
        v_shift_id,
        NOW(),
        NOW()
    );

    -- 5. تحديث المصروف المرتبط إن وجد (Related Expense Update)
    IF v_related_expense_id IS NOT NULL THEN
        UPDATE public.expenses
        SET paid_amount = COALESCE(paid_amount, 0) + v_amount
        WHERE id = v_related_expense_id;
    END IF;

    -- 6. تحديث مصروفات الوردية إن تم الصرف نقداً من صندوق الكاشير
    IF v_shift_id IS NOT NULL AND v_payment_method IN ('cash', 'كاش', 'نقدي', 'نقدي (كاش)') THEN
        UPDATE public.pos_shifts
        SET total_expenses = COALESCE(total_expenses, 0) + v_amount
        WHERE id = v_shift_id;
    END IF;

    -- 7. توليد القيد المحاسبي المزدوج المتزن
    v_journal_id := gen_random_uuid();
    INSERT INTO public.journal_headers (
        id, entry_date, description, status, v_type, reference_id, fleet_operation_id, created_at
    ) VALUES (
        v_journal_id,
        v_date::DATE,
        'سند صرف رقم: ' || v_voucher_number || ' - ' || COALESCE(v_partner_name, 'صرف نقدي') || ' - ' || v_description,
        'posted',
        'payment',
        v_voucher_id,
        v_fleet_operation_id,
        NOW()
    );

    -- الطرف المدين: ذمم الموردين أو المصروفات (تخفيض التزام المورد أو إثبات المصروف)
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, fleet_operation_id
    ) VALUES (
        v_journal_id, v_debit_account_id, CASE WHEN v_debit_account_id IN ('2ca6f54c-5f37-49a0-8c41-e37f94b09752'::uuid, 'f9c7ba68-6998-48e6-99b3-3a4526d820a1'::uuid, '31c9923a-3629-4f3f-b661-b86df51c8e09'::uuid, '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid) THEN v_partner_id ELSE NULL END, v_amount, 0.00, 'إثبات سداد/صرف لسند صرف #' || v_voucher_number, v_fleet_operation_id
    );

    -- الطرف الدائن: الخزينة أو البنك (خروج النقدية) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, fleet_operation_id
    ) VALUES (
        v_journal_id, v_credit_account_id, NULL, 0.00, v_amount, 'خروج نقدية من خزانة/بنك لسند صرف #' || v_voucher_number, v_fleet_operation_id
    );

    -- 8. الاستجابة وإرجاع تقرير السند
    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_number', v_voucher_number,
        'date', v_date::DATE,
        'amount', v_amount,
        'partner_id', v_partner_id,
        'partner_name', v_partner_name,
        'debit_account_id', v_debit_account_id,
        'credit_account_id', v_credit_account_id,
        'journal_id', v_journal_id,
        'related_expense_id', v_related_expense_id,
        'shift_id', v_shift_id,
        'message', 'تم تسجيل وترحيل سند الصرف وتوليد القيد المحاسبي بنجاح 💸'
    );
END;
$$;
