-- ============================================================================
-- 🚀 RPC PHASE 3: rpc_process_receipt_voucher(p_data JSONB)
-- Atomic Customer Collection, Debt Settlement, Invoice Allocation & Balanced Journal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_process_receipt_voucher(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_custom_id             UUID;
    v_voucher_id            UUID;
    v_receipt_number        TEXT;
    v_date                  TIMESTAMPTZ;
    v_amount                NUMERIC(14, 2);
    v_payment_method        TEXT;
    v_partner_id            UUID;
    v_partner_name          TEXT;
    v_partner_custom_acc    UUID;
    v_safe_bank_acc_id      UUID;
    v_partner_acc_id        UUID;
    v_shift_id              UUID;
    v_shift_status          TEXT;
    v_delegate_id           UUID;
    v_fleet_operation_id    UUID;
    v_job_order_id          UUID;
    v_reference_number      TEXT;
    v_attachment_url        TEXT;
    v_notes                 TEXT;
    v_status                TEXT;
    
    v_primary_invoice_id    UUID := NULL;
    v_allocated_records     JSONB := '[]'::JSONB;
    v_total_allocated       NUMERIC(14, 2) := 0.00;
    v_unallocated           NUMERIC(14, 2);
    v_item                  JSONB;
    v_alloc_inv_id          UUID;
    v_alloc_amount          NUMERIC(14, 2);
    v_inv_id                UUID;
    v_inv_number            TEXT;
    v_inv_total             NUMERIC(14, 2);
    v_inv_paid              NUMERIC(14, 2);
    v_new_paid              NUMERIC(14, 2);
    v_due                   NUMERIC(14, 2);
    v_inv_new_status        TEXT;
    
    v_journal_id            UUID;
BEGIN
    -- 1. فحص درع الحماية ومنع التكرار (Idempotency Guard & Anti-Duplicate)
    v_custom_id      := (p_data->>'id')::UUID;
    v_voucher_id     := COALESCE(v_custom_id, gen_random_uuid());
    v_receipt_number := COALESCE(p_data->>'voucher_number', p_data->>'receipt_number', 'RV-' || TO_CHAR(NOW(), 'YYYYMMDD-HH24MISS'));
    
    IF EXISTS (
        SELECT 1 FROM public.receipt_vouchers 
        WHERE (v_custom_id IS NOT NULL AND id = v_custom_id) 
           OR (v_receipt_number IS NOT NULL AND receipt_number = v_receipt_number)
    ) THEN
        SELECT id, receipt_number, amount, partner_id, status, invoice_id
        INTO v_voucher_id, v_receipt_number, v_amount, v_partner_id, v_status, v_primary_invoice_id
        FROM public.receipt_vouchers 
        WHERE (v_custom_id IS NOT NULL AND id = v_custom_id) 
           OR (v_receipt_number IS NOT NULL AND receipt_number = v_receipt_number)
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'voucher_id', v_voucher_id,
            'receipt_number', v_receipt_number,
            'amount', v_amount,
            'partner_id', v_partner_id,
            'invoice_id', v_primary_invoice_id,
            'status', v_status,
            'message', 'سند القبض مسجل ومرحل بالفعل مسبقاً 🟢'
        );
    END IF;

    -- 2. التحقق من المدخلات الأساسية
    v_amount := ROUND(COALESCE((p_data->>'amount')::NUMERIC, 0), 2);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ سند القبض يجب أن يكون أكبر من الصفر (Amount must be greater than zero)';
    END IF;

    v_date               := COALESCE((p_data->>'date')::TIMESTAMPTZ, NOW());
    v_payment_method     := LOWER(COALESCE(p_data->>'payment_method', 'cash'));
    v_partner_id         := (p_data->>'partner_id')::UUID;
    v_safe_bank_acc_id   := (p_data->>'safe_bank_acc_id')::UUID;
    v_partner_acc_id     := (p_data->>'partner_acc_id')::UUID;
    v_shift_id           := (p_data->>'shift_id')::UUID;
    v_delegate_id        := (p_data->>'delegate_id')::UUID;
    v_fleet_operation_id := (p_data->>'fleet_operation_id')::UUID;
    v_job_order_id       := (p_data->>'job_order_id')::UUID;
    v_reference_number   := p_data->>'reference_number';
    v_attachment_url     := p_data->>'attachment_url';
    v_notes              := p_data->>'notes';
    v_status             := COALESCE(p_data->>'status', 'معتمد');

    -- التحقق من وجود العميل إذا تم تمريره
    IF v_partner_id IS NOT NULL THEN
        SELECT name, account_id 
        INTO v_partner_name, v_partner_custom_acc
        FROM public.partners 
        WHERE id = v_partner_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'العميل المحدد (%) غير موجود في قاعدة البيانات', v_partner_id;
        END IF;
    END IF;

    -- التحقق من حالة الوردية إذا كانت مرتبطة بنقطة بيع
    IF v_shift_id IS NOT NULL THEN
        SELECT status INTO v_shift_status FROM public.pos_shifts WHERE id = v_shift_id;
        IF v_shift_status IS NULL OR v_shift_status != 'open' THEN
            RAISE EXCEPTION 'وردية الكاشير المرتبطة بالسند مغلقة أو غير صالحة';
        END IF;
    END IF;

    -- 3. تسوية وتوزيع السداد على الفواتير المحددة (Invoice Settlement / Allocation)
    IF p_data->'invoices_settled' IS NOT NULL AND jsonb_array_length(p_data->'invoices_settled') > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_data->'invoices_settled')
        LOOP
            v_alloc_inv_id := (v_item->>'invoice_id')::UUID;
            v_alloc_amount := ROUND(COALESCE((v_item->>'allocated_amount')::NUMERIC, (v_item->>'amount')::NUMERIC, 0), 2);

            IF v_alloc_inv_id IS NOT NULL AND v_alloc_amount > 0 THEN
                SELECT id, invoice_number, total_amount, COALESCE(paid_amount, 0)
                INTO v_inv_id, v_inv_number, v_inv_total, v_inv_paid
                FROM public.invoices
                WHERE id = v_alloc_inv_id
                FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'الفاتورة المحددة للسداد (%) غير موجودة في النظام', v_alloc_inv_id;
                END IF;

                v_new_paid := v_inv_paid + v_alloc_amount;
                v_inv_new_status := CASE WHEN v_new_paid >= v_inv_total THEN 'paid' ELSE 'partial' END;

                UPDATE public.invoices
                SET paid_amount = v_new_paid,
                    status = v_inv_new_status,
                    payment_status = v_inv_new_status
                WHERE id = v_alloc_inv_id;

                IF v_primary_invoice_id IS NULL THEN
                    v_primary_invoice_id := v_alloc_inv_id;
                END IF;

                v_total_allocated := v_total_allocated + v_alloc_amount;

                v_allocated_records := v_allocated_records || jsonb_build_object(
                    'invoice_id', v_alloc_inv_id,
                    'invoice_number', v_inv_number,
                    'allocated_amount', v_alloc_amount,
                    'total_amount', v_inv_total,
                    'new_paid_amount', v_new_paid,
                    'status', v_inv_new_status
                );
            END IF;
        END LOOP;

    ELSIF p_data->>'invoice_id' IS NOT NULL THEN
        -- سداد مرتبط بفاتورة رئيسية واحدة صريحة
        v_alloc_inv_id := (p_data->>'invoice_id')::UUID;
        SELECT id, invoice_number, total_amount, COALESCE(paid_amount, 0)
        INTO v_inv_id, v_inv_number, v_inv_total, v_inv_paid
        FROM public.invoices
        WHERE id = v_alloc_inv_id
        FOR UPDATE;

        IF FOUND THEN
            v_new_paid := v_inv_paid + v_amount;
            v_inv_new_status := CASE WHEN v_new_paid >= v_inv_total THEN 'paid' ELSE 'partial' END;

            UPDATE public.invoices
            SET paid_amount = v_new_paid,
                status = v_inv_new_status,
                payment_status = v_inv_new_status
            WHERE id = v_alloc_inv_id;

            v_primary_invoice_id := v_alloc_inv_id;
            v_total_allocated := v_amount;

            v_allocated_records := v_allocated_records || jsonb_build_object(
                'invoice_id', v_alloc_inv_id,
                'invoice_number', v_inv_number,
                'allocated_amount', v_amount,
                'total_amount', v_inv_total,
                'new_paid_amount', v_new_paid,
                'status', v_inv_new_status
            );
        END IF;

    ELSIF COALESCE((p_data->>'auto_allocate')::BOOLEAN, false) = true AND v_partner_id IS NOT NULL THEN
        -- التوزيع التلقائي بنظام الأقدم فالأحدث (FIFO Auto-Allocation)
        v_unallocated := v_amount;
        FOR v_inv_id, v_inv_number, v_inv_total, v_inv_paid IN
            SELECT id, invoice_number, total_amount, COALESCE(paid_amount, 0)
            FROM public.invoices
            WHERE partner_id = v_partner_id 
              AND status NOT IN ('paid', 'ملغي', 'cancelled')
              AND total_amount > COALESCE(paid_amount, 0)
            ORDER BY date ASC, created_at ASC
            FOR UPDATE
        LOOP
            EXIT WHEN v_unallocated <= 0;
            v_due := v_inv_total - v_inv_paid;
            v_alloc_amount := LEAST(v_unallocated, v_due);
            v_new_paid := v_inv_paid + v_alloc_amount;
            v_inv_new_status := CASE WHEN v_new_paid >= v_inv_total THEN 'paid' ELSE 'partial' END;

            UPDATE public.invoices
            SET paid_amount = v_new_paid,
                status = v_inv_new_status,
                payment_status = v_inv_new_status
            WHERE id = v_inv_id;

            IF v_primary_invoice_id IS NULL THEN
                v_primary_invoice_id := v_inv_id;
            END IF;

            v_total_allocated := v_total_allocated + v_alloc_amount;
            v_unallocated := v_unallocated - v_alloc_amount;

            v_allocated_records := v_allocated_records || jsonb_build_object(
                'invoice_id', v_inv_id,
                'invoice_number', v_inv_number,
                'allocated_amount', v_alloc_amount,
                'total_amount', v_inv_total,
                'new_paid_amount', v_new_paid,
                'status', v_inv_new_status
            );
        END LOOP;
    END IF;

    -- 4. إدراج سجل سند القبض في جدول receipt_vouchers
    INSERT INTO public.receipt_vouchers (
        id,
        receipt_number,
        date,
        amount,
        payment_method,
        notes,
        partner_id,
        invoice_id,
        status,
        safe_bank_acc_id,
        partner_acc_id,
        reference_number,
        attachment_url,
        job_order_id,
        delegate_id,
        shift_id,
        fleet_operation_id,
        created_at,
        updated_at
    ) VALUES (
        v_voucher_id,
        v_receipt_number,
        v_date::DATE,
        v_amount,
        v_payment_method,
        v_notes,
        v_partner_id,
        v_primary_invoice_id,
        v_status,
        v_safe_bank_acc_id,
        v_partner_acc_id,
        v_reference_number,
        v_attachment_url,
        v_job_order_id,
        v_delegate_id,
        v_shift_id,
        v_fleet_operation_id,
        NOW(),
        NOW()
    );

    -- 5. التحديد الدقيق للحسابات وتوليد القيد المحاسبي المزدوج المتزن
    -- تحديد حساب الاستلام (خزينة أو بنك)
    IF v_safe_bank_acc_id IS NULL THEN
        IF v_payment_method IN ('cash', 'كاش', 'نقدي', 'نقدي (كاش)') THEN
            SELECT id INTO v_safe_bank_acc_id 
            FROM public.accounts 
            WHERE code = '122' OR name ILIKE '%الخزينة%' 
            ORDER BY CASE WHEN code = '122' THEN 1 ELSE 2 END 
            LIMIT 1;
        ELSE
            SELECT id INTO v_safe_bank_acc_id 
            FROM public.accounts 
            WHERE code IN ('1291', '129') OR name ILIKE '%الراجحي%' OR name ILIKE '%البنوك%' 
            ORDER BY CASE WHEN code = '1291' THEN 1 WHEN code = '129' THEN 2 ELSE 3 END 
            LIMIT 1;
        END IF;
    END IF;

    -- تحديد حساب الطرف الآخر (ذمم العملاء أو عهدة المندوب)
    IF v_partner_acc_id IS NULL THEN
        IF v_partner_custom_acc IS NOT NULL THEN
            v_partner_acc_id := v_partner_custom_acc;
        ELSIF v_partner_id IS NULL AND v_delegate_id IS NOT NULL THEN
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code = '125' OR name ILIKE '%عهدة%' 
            ORDER BY CASE WHEN code = '125' THEN 1 ELSE 2 END 
            LIMIT 1;
        ELSE
            SELECT id INTO v_partner_acc_id 
            FROM public.accounts 
            WHERE code = '123' OR name ILIKE '%العملاء%' 
            ORDER BY CASE WHEN code = '123' THEN 1 ELSE 2 END 
            LIMIT 1;
        END IF;
    END IF;

    IF v_safe_bank_acc_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد حساب الخزينة أو البنك للاستلام (122 أو 129 غير معرف)';
    END IF;

    IF v_partner_acc_id IS NULL THEN
        RAISE EXCEPTION 'تعذر تحديد حساب العملاء والذمم المدينة (123 غير معرف)';
    END IF;

    -- إنشاء رأس القيد المحاسبي
    v_journal_id := gen_random_uuid();
    INSERT INTO public.journal_headers (
        id, entry_date, description, status, v_type, reference_id, fleet_operation_id, created_at
    ) VALUES (
        v_journal_id,
        v_date::DATE,
        'سند قبض رقم: ' || v_receipt_number || ' - ' || COALESCE(v_partner_name, 'تحصيل نقدي') || COALESCE(' - ' || v_notes, ''),
        'posted',
        'receipt',
        v_voucher_id,
        v_fleet_operation_id,
        NOW()
    );

    -- الطرف المدين: الخزينة أو البنك (استلام النقد) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, delegate_id, fleet_operation_id
    ) VALUES (
        v_journal_id, v_safe_bank_acc_id, NULL, v_amount, 0.00, 'توريد خزانة/بنك لسند قبض #' || v_receipt_number, v_delegate_id, v_fleet_operation_id
    );

    -- الطرف الدائن: ذمم العملاء (تخفيض مديونية العميل في دفتر الأستاذ)
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, delegate_id, fleet_operation_id
    ) VALUES (
        v_journal_id, v_partner_acc_id, v_partner_id, 0.00, v_amount, 
        CASE WHEN v_delegate_id IS NOT NULL AND v_partner_id IS NULL 
             THEN 'توريد عهدة مندوب لسند قبض #' || v_receipt_number 
             ELSE 'سداد ذمم عميل لسند قبض #' || v_receipt_number 
        END, 
        v_delegate_id, v_fleet_operation_id
    );

    -- 6. الاستجابة وإرجاع بيانات السند والمطابقة
    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'receipt_number', v_receipt_number,
        'date', v_date::DATE,
        'amount', v_amount,
        'partner_id', v_partner_id,
        'partner_name', v_partner_name,
        'journal_id', v_journal_id,
        'safe_bank_acc_id', v_safe_bank_acc_id,
        'partner_acc_id', v_partner_acc_id,
        'invoices_settled', v_allocated_records,
        'total_allocated', v_total_allocated,
        'message', 'تم تسجيل وترحيل سند القبض وتسوية حساب العميل والفواتير بنجاح 💰'
    );
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.rpc_process_receipt_voucher(JSONB) TO authenticated, service_role, anon;
