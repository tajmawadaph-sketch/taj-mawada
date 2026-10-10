-- ============================================================================
-- 🚀 RPC PHASE 2: rpc_close_pos_shift(p_data JSONB)
-- Atomic POS Shift Closing, Reconciliation & Double-Entry Variance Journal
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rpc_close_pos_shift(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_shift_id            UUID;
    v_shift               RECORD;
    v_actual_cash         NUMERIC(14, 2);
    v_notes               TEXT;
    
    -- حسابات من قاعدة البيانات
    v_db_total_sales      NUMERIC(14, 2) := 0.00;
    v_db_cash_sales       NUMERIC(14, 2) := 0.00;
    v_db_card_sales       NUMERIC(14, 2) := 0.00;
    v_db_credit_sales     NUMERIC(14, 2) := 0.00;
    v_db_cash_receipts    NUMERIC(14, 2) := 0.00;
    v_db_total_expenses   NUMERIC(14, 2) := 0.00;
    v_db_cash_expenses    NUMERIC(14, 2) := 0.00;
    v_db_bottles_sold     NUMERIC(14, 2) := 0.00;

    -- الإجماليات النهائية بعد دمج قيم الأوفلاين إن وجدت
    v_total_sales         NUMERIC(14, 2) := 0.00;
    v_cash_sales          NUMERIC(14, 2) := 0.00;
    v_card_sales          NUMERIC(14, 2) := 0.00;
    v_credit_sales        NUMERIC(14, 2) := 0.00;
    v_cash_receipts       NUMERIC(14, 2) := 0.00;
    v_total_expenses      NUMERIC(14, 2) := 0.00;
    v_cash_expenses       NUMERIC(14, 2) := 0.00;
    
    v_expected_cash       NUMERIC(14, 2) := 0.00;
    v_shortage_overage    NUMERIC(14, 2) := 0.00;
    v_diff_abs            NUMERIC(14, 2) := 0.00;
    
    v_bottles_sold        NUMERIC(14, 2) := 0.00;
    v_bottles_returned    NUMERIC(14, 2) := 0.00;
    v_bottles_shortage    NUMERIC(14, 2) := 0.00;
    
    -- الحسابات المالية
    v_acc_cash_id         UUID;
    v_acc_custody_id      UUID;
    v_acc_overage_id      UUID;
    v_journal_id          UUID := NULL;
    v_variance_type       TEXT := 'balanced';
    
    v_total_debit         NUMERIC(14, 2) := 0.00;
    v_total_credit        NUMERIC(14, 2) := 0.00;
BEGIN
    -- 1. استخراج وقفل سجل الوردية مع التحقق من المعرف
    v_shift_id := COALESCE((p_data->>'shift_id')::UUID, (p_data->>'id')::UUID);
    IF v_shift_id IS NULL THEN
        RAISE EXCEPTION 'معرف الوردية مطلوب (shift_id is required)';
    END IF;

    SELECT * INTO v_shift 
    FROM public.pos_shifts 
    WHERE id = v_shift_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'الوردية رقم (%) غير موجودة في النظام', v_shift_id;
    END IF;

    -- 2. حماية ضد الإغلاق المكرر (Idempotency Guard / Anti-Duplicate)
    IF v_shift.status = 'closed' THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'shift_id', v_shift_id,
            'status', 'closed',
            'closed_at', v_shift.closed_at,
            'expected_cash', v_shift.expected_cash,
            'actual_cash', v_shift.actual_cash,
            'shortage_overage', v_shift.shortage_overage,
            'message', 'الوردية مغلقة ومسواة بالفعل مسبقاً 🟢'
        );
    END IF;

    -- استخراج النقد الفعلي والملاحظات
    IF p_data->>'actual_cash' IS NULL THEN
        RAISE EXCEPTION 'يجب إدخال النقدية الفعلية الموجودة في الصندوق (actual_cash is required)';
    END IF;
    v_actual_cash := ROUND((p_data->>'actual_cash')::NUMERIC, 2);
    v_notes := COALESCE(p_data->>'closing_notes', p_data->>'notes');

    -- 3. تجميع المبيعات من الفواتير المرتبطة بهذه الوردية
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('cash', 'نقدي', 'كاش', 'نقدي (كاش)') THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('card', 'شبكة', 'مدى', 'شبكة (مدى)', 'بطاقة') THEN total_amount ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('credit', 'آجل', 'اجل') THEN total_amount ELSE 0 END), 0)
    INTO 
        v_db_total_sales,
        v_db_cash_sales,
        v_db_card_sales,
        v_db_credit_sales
    FROM public.invoices
    WHERE shift_id = v_shift_id AND status NOT IN ('ملغي', 'cancelled');

    -- سندات القبض النقدية المستقلة المحصلة أثناء الوردية
    SELECT COALESCE(SUM(amount), 0)
    INTO v_db_cash_receipts
    FROM public.receipt_vouchers
    WHERE shift_id = v_shift_id 
      AND (status IS NULL OR status NOT IN ('ملغي', 'cancelled'))
      AND LOWER(payment_method) IN ('cash', 'نقدي', 'كاش')
      AND (invoice_id IS NULL OR invoice_id NOT IN (SELECT id FROM public.invoices WHERE shift_id = v_shift_id));

    -- المصروفات النقدية المنصرفة من الصندوق أثناء الوردية
    SELECT 
        COALESCE(SUM(paid_amount), 0),
        COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('cash', 'نقدي', 'كاش') THEN paid_amount ELSE 0 END), 0)
    INTO 
        v_db_total_expenses,
        v_db_cash_expenses
    FROM public.expenses
    WHERE shift_id = v_shift_id AND (is_deleted IS NOT TRUE);

    -- مبيعات القوارير المرتجعة المسجلة بالفواتير
    SELECT COALESCE(SUM((line->>'quantity')::NUMERIC), 0)
    INTO v_db_bottles_sold
    FROM public.invoices inv,
         jsonb_array_elements(inv.lines_data) line
    JOIN public.inventory_items itm ON itm.id = (line->>'item_id')::UUID
    WHERE inv.shift_id = v_shift_id
      AND inv.status NOT IN ('ملغي', 'cancelled')
      AND itm.is_returnable_bottle = TRUE;

    -- دمج قيم قاعدة البيانات مع قيم الكلاينت (لدعم وضع الأوفلاين والمزامنة بدقة)
    v_total_sales    := GREATEST(v_db_total_sales, COALESCE((p_data->>'total_sales')::NUMERIC, 0));
    v_cash_sales     := GREATEST(v_db_cash_sales, COALESCE((p_data->>'total_cash_sales')::NUMERIC, 0));
    v_card_sales     := GREATEST(v_db_card_sales, COALESCE((p_data->>'total_card_sales')::NUMERIC, 0));
    v_credit_sales   := GREATEST(v_db_credit_sales, COALESCE((p_data->>'total_credit_sales')::NUMERIC, 0));
    v_cash_receipts  := GREATEST(v_db_cash_receipts, COALESCE((p_data->>'cash_receipts')::NUMERIC, 0));
    v_total_expenses := GREATEST(v_db_total_expenses, COALESCE((p_data->>'total_expenses')::NUMERIC, 0));
    v_cash_expenses  := GREATEST(v_db_cash_expenses, COALESCE((p_data->>'cash_expenses')::NUMERIC, 0));

    -- حسابات القوارير
    v_bottles_sold     := GREATEST(v_db_bottles_sold, COALESCE((p_data->>'bottles_sold')::NUMERIC, 0));
    v_bottles_returned := COALESCE((p_data->>'bottles_returned')::NUMERIC, (p_data->>'actual_bottles')::NUMERIC, (p_data->>'actual_bottles_returned')::NUMERIC, 0);
    v_bottles_shortage := GREATEST(0, v_bottles_sold - v_bottles_returned);

    -- 4. الحساب المالي الدقيق للنقد المتوقع والفارق
    -- النقد المتوقع = العهدة الافتتاحية + المبيعات النقدية + المقبوضات النقدية - المصروفات النقدية
    v_expected_cash    := ROUND(COALESCE(v_shift.starting_cash, 0) + v_cash_sales + v_cash_receipts - v_cash_expenses, 2);
    v_shortage_overage := ROUND(v_actual_cash - v_expected_cash, 2);

    -- 5. التوليد الآلي للقيود المحاسبية عند وجود عجز أو زيادة (Double-Entry Reconcilation)
    IF v_shortage_overage != 0 THEN
        v_diff_abs   := ABS(v_shortage_overage);
        v_journal_id := gen_random_uuid();

        -- جلب الحسابات المحاسبية المطلوبة من دليل الحسابات مع إعطاء الأولوية القصوى للأكواد الصريحة
        SELECT id INTO v_acc_cash_id    
        FROM public.accounts 
        WHERE code = '122' OR name ILIKE '%الخزينة%' 
        ORDER BY CASE WHEN code = '122' THEN 1 ELSE 2 END 
        LIMIT 1;

        SELECT id INTO v_acc_custody_id 
        FROM public.accounts 
        WHERE code = '125' OR name ILIKE '%عهدة موظف%' OR name ILIKE '%مناديب%' OR name ILIKE '%عجز%'
        ORDER BY CASE WHEN code = '125' THEN 1 ELSE 2 END 
        LIMIT 1;

        SELECT id INTO v_acc_overage_id 
        FROM public.accounts 
        WHERE code = '44'  OR name ILIKE '%إيرادات أخرى متنوعة%' OR name ILIKE '%زيادة%'
        ORDER BY CASE WHEN code = '44' THEN 1 ELSE 2 END 
        LIMIT 1;

        IF v_acc_cash_id IS NULL THEN
            RAISE EXCEPTION 'حساب الخزينة الرئيسية (122) غير موجود بدليل الحسابات';
        END IF;

        IF v_shortage_overage < 0 THEN
            -- حالة عجز في الصندوق (Shortage):
            -- من حـ/ عهدة موظفين او مناديب - عجز صندوق (125) [مدين]
            -- إلى حـ/ الخزينة الرئيسية (122) [دائن]
            v_variance_type := 'shortage';
            IF v_acc_custody_id IS NULL THEN
                RAISE EXCEPTION 'حساب عهدة الموظفين / عجز الصندوق (125) غير معرف بدليل الحسابات';
            END IF;

            INSERT INTO public.journal_headers (
                id, entry_date, description, status, v_type, reference_id, created_at
            ) VALUES (
                v_journal_id, CURRENT_DATE, 'تسوية عجز صندوق وردية الكاشير رقم: ' || SUBSTRING(v_shift_id::TEXT, 1, 8), 'posted', 'pos_reconciliation', v_shift_id, NOW()
            );

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes, delegate_id)
            VALUES (v_journal_id, v_acc_custody_id, v_shift.delegate_id, v_diff_abs, 0.00, 'إثبات عجز الصندوق عهدة على الكاشير/المندوب', v_shift.delegate_id);
            v_total_debit := v_total_debit + v_diff_abs;

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes, delegate_id)
            VALUES (v_journal_id, v_acc_cash_id, NULL, 0.00, v_diff_abs, 'تخفيض رصيد الخزينة لمطابقة النقد الفعلي بعد العجز', v_shift.delegate_id);
            v_total_credit := v_total_credit + v_diff_abs;

        ELSE
            -- حالة زيادة في الصندوق (Overage):
            -- من حـ/ الخزينة الرئيسية (122) [مدين]
            -- إلى حـ/ إيرادات أخرى متنوعة - زيادة صندوق (44) [دائن]
            v_variance_type := 'overage';
            IF v_acc_overage_id IS NULL THEN
                RAISE EXCEPTION 'حساب إيرادات أخرى متنوعة (44) غير معرف بدليل الحسابات';
            END IF;

            INSERT INTO public.journal_headers (
                id, entry_date, description, status, v_type, reference_id, created_at
            ) VALUES (
                v_journal_id, CURRENT_DATE, 'تسوية زيادة صندوق وردية الكاشير رقم: ' || SUBSTRING(v_shift_id::TEXT, 1, 8), 'posted', 'pos_reconciliation', v_shift_id, NOW()
            );

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes, delegate_id)
            VALUES (v_journal_id, v_acc_cash_id, NULL, v_diff_abs, 0.00, 'إثبات الزيادة النقدية الفعلية بصندوق الكاشير', v_shift.delegate_id);
            v_total_debit := v_total_debit + v_diff_abs;

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes, delegate_id)
            VALUES (v_journal_id, v_acc_overage_id, v_shift.delegate_id, 0.00, v_diff_abs, 'قيد الزيادة النقدية كإيرادات أخرى متنوعة', v_shift.delegate_id);
            v_total_credit := v_total_credit + v_diff_abs;
        END IF;

        -- التحقق الصارم من توازن القيد المحاسبي
        IF v_total_debit != v_total_credit THEN
            RAISE EXCEPTION 'خطأ محاسبي: قيد تسوية الوردية غير متوازن! مدين: %, دائن: %', v_total_debit, v_total_credit;
        END IF;
    END IF;

    -- 6. تحديث بيانات الوردية وإغلاقها نهائياً
    UPDATE public.pos_shifts
    SET 
        status = 'closed',
        closed_at = NOW(),
        actual_cash = v_actual_cash,
        expected_cash = v_expected_cash,
        shortage_overage = v_shortage_overage,
        total_sales = v_total_sales,
        total_cash_sales = v_cash_sales,
        total_card_sales = v_card_sales,
        total_credit_sales = v_credit_sales,
        total_expenses = v_total_expenses,
        bottles_sold = v_bottles_sold,
        bottles_returned = v_bottles_returned,
        bottles_shortage = v_bottles_shortage,
        actual_bottles = v_bottles_returned,
        closing_notes = v_notes
    WHERE id = v_shift_id;

    -- 7. الاستجابة وإرجاع تقرير التقفيل
    RETURN jsonb_build_object(
        'success', true,
        'shift_id', v_shift_id,
        'status', 'closed',
        'closed_at', NOW(),
        'starting_cash', v_shift.starting_cash,
        'expected_cash', v_expected_cash,
        'actual_cash', v_actual_cash,
        'shortage_overage', v_shortage_overage,
        'variance_type', v_variance_type,
        'journal_id', v_journal_id,
        'total_sales', v_total_sales,
        'total_cash_sales', v_cash_sales,
        'total_card_sales', v_card_sales,
        'total_credit_sales', v_credit_sales,
        'bottles_sold', v_bottles_sold,
        'bottles_returned', v_bottles_returned,
        'bottles_shortage', v_bottles_shortage,
        'message', 'تم إغلاق الوردية وتسوية الصندوق دفترياً ومحاسبياً بنجاح 🔒'
    );
END;
$$;

-- منح الصلاحيات
GRANT EXECUTE ON FUNCTION public.rpc_close_pos_shift(JSONB) TO authenticated, service_role, anon;

-- دالة توافقية مع الأنظمة والواجهات القديمة (Backward-Compatibility Wrapper)
CREATE OR REPLACE FUNCTION public.close_pos_shift(p_shift_id UUID, p_actual_cash NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.rpc_close_pos_shift(jsonb_build_object(
        'shift_id', p_shift_id,
        'actual_cash', p_actual_cash
    ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_pos_shift(UUID, NUMERIC) TO authenticated, service_role, anon;
