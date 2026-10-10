-- ==============================================================================
-- Migration: 20261010_rpc_financial_period_closing_and_trial_balance.sql
-- Description: Production-grade financial period closing, trial balance generation,
--              automated P&L closing entries, ZATCA VAT return calculation,
--              and audit period locking triggers.
-- ==============================================================================

-- 1. Table: financial_periods
CREATE TABLE IF NOT EXISTS public.financial_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    fiscal_year INT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'locked')),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    closing_journal_id UUID REFERENCES public.journal_headers(id),
    net_profit NUMERIC(15, 4) DEFAULT 0,
    total_revenue NUMERIC(15, 4) DEFAULT 0,
    total_expenses NUMERIC(15, 4) DEFAULT 0,
    vat_output NUMERIC(15, 4) DEFAULT 0,
    vat_input NUMERIC(15, 4) DEFAULT 0,
    vat_net NUMERIC(15, 4) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_financial_period_dates UNIQUE (start_date, end_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_periods_dates ON public.financial_periods (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_financial_periods_status ON public.financial_periods (status);

-- 2. Audit Period Lock Trigger on journal_headers
CREATE OR REPLACE FUNCTION public.fn_check_financial_period_lock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $trig$
DECLARE
    v_date DATE;
    v_is_locked BOOLEAN;
BEGIN
    v_date := COALESCE(NEW.entry_date, OLD.entry_date);

    -- Allow closing journal entry created by the closing RPC itself
    IF TG_OP = 'INSERT' AND NEW.v_type = 'closing' THEN
        RETURN NEW;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.financial_periods
        WHERE status IN ('closed', 'locked')
          AND v_date BETWEEN start_date AND end_date
    ) INTO v_is_locked;

    IF v_is_locked THEN
        RAISE EXCEPTION 'لا يمكن تعديل أو إضافة قيود يومية في فترة مالية مغلقة ومقفلة رقابياً (تاريخ القيد: %)', v_date;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$trig$;

DROP TRIGGER IF EXISTS trg_check_period_lock ON public.journal_headers;
CREATE TRIGGER trg_check_period_lock
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_headers
FOR EACH ROW
EXECUTE FUNCTION public.fn_check_financial_period_lock();

-- 3. Stored Procedure: rpc_generate_trial_balance
CREATE OR REPLACE FUNCTION public.rpc_generate_trial_balance(p_data JSONB DEFAULT '{}'::jsonb)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_start_date            DATE;
    v_end_date              DATE;
    v_inc_zero              BOOLEAN;
    
    -- Totals
    v_tot_open_dr           NUMERIC(15, 4) := 0;
    v_tot_open_cr           NUMERIC(15, 4) := 0;
    v_tot_period_dr         NUMERIC(15, 4) := 0;
    v_tot_period_cr         NUMERIC(15, 4) := 0;
    v_tot_close_dr          NUMERIC(15, 4) := 0;
    v_tot_close_cr          NUMERIC(15, 4) := 0;
    
    -- P&L & VAT metrics
    v_total_revenue         NUMERIC(15, 4) := 0;
    v_total_cogs            NUMERIC(15, 4) := 0;
    v_total_expenses        NUMERIC(15, 4) := 0;
    v_gross_profit          NUMERIC(15, 4) := 0;
    v_net_profit            NUMERIC(15, 4) := 0;
    
    v_vat_acc_id            UUID := '990c949c-5f32-40d7-8d36-5fe45a6c892c'::uuid; -- 215 ضريبة القيمة المضافة
    v_vat_input             NUMERIC(15, 4) := 0;
    v_vat_output            NUMERIC(15, 4) := 0;
    v_vat_net               NUMERIC(15, 4) := 0;
    
    v_accounts_list         JSONB := '[]'::jsonb;
    v_rec                   RECORD;
BEGIN
    v_start_date := COALESCE(NULLIF(p_data->>'start_date', ''), '1970-01-01')::date;
    v_end_date := COALESCE(NULLIF(p_data->>'end_date', ''), CURRENT_DATE::text)::date;
    v_inc_zero := COALESCE((p_data->>'include_zero_balances')::boolean, false);

    IF v_start_date > v_end_date THEN
        RAISE EXCEPTION 'تاريخ البداية (%) يجب أن يكون أصغر من أو يساوي تاريخ النهاية (%)', v_start_date, v_end_date;
    END IF;

    -- Iterate over transactional accounts
    FOR v_rec IN 
        WITH opening AS (
            SELECT 
                jl.account_id,
                COALESCE(SUM(jl.debit), 0) AS open_dr,
                COALESCE(SUM(jl.credit), 0) AS open_cr
            FROM public.journal_lines jl
            JOIN public.journal_headers jh ON jh.id = jl.header_id
            WHERE jh.entry_date < v_start_date
            GROUP BY jl.account_id
        ),
        period_movements AS (
            SELECT 
                jl.account_id,
                COALESCE(SUM(jl.debit), 0) AS period_dr,
                COALESCE(SUM(jl.credit), 0) AS period_cr
            FROM public.journal_lines jl
            JOIN public.journal_headers jh ON jh.id = jl.header_id
            WHERE jh.entry_date BETWEEN v_start_date AND v_end_date
            GROUP BY jl.account_id
        )
        SELECT 
            a.id,
            a.code,
            a.name,
            a.account_type,
            a.is_transactional,
            COALESCE(o.open_dr, 0) AS open_dr,
            COALESCE(o.open_cr, 0) AS open_cr,
            COALESCE(p.period_dr, 0) AS period_dr,
            COALESCE(p.period_cr, 0) AS period_cr,
            (COALESCE(o.open_dr, 0) + COALESCE(p.period_dr, 0)) AS cum_dr,
            (COALESCE(o.open_cr, 0) + COALESCE(p.period_cr, 0)) AS cum_cr
        FROM public.accounts a
        LEFT JOIN opening o ON o.account_id = a.id
        LEFT JOIN period_movements p ON p.account_id = a.id
        WHERE a.is_transactional = true
        ORDER BY a.code ASC
    LOOP
        -- Check if account has any activity
        IF v_inc_zero OR (v_rec.open_dr <> 0 OR v_rec.open_cr <> 0 OR v_rec.period_dr <> 0 OR v_rec.period_cr <> 0) THEN
            DECLARE
                v_open_net NUMERIC(15, 4);
                v_close_net NUMERIC(15, 4);
                v_final_dr NUMERIC(15, 4) := 0;
                v_final_cr NUMERIC(15, 4) := 0;
            BEGIN
                v_open_net := v_rec.open_dr - v_rec.open_cr;
                v_close_net := v_rec.cum_dr - v_rec.cum_cr;

                IF v_close_net >= 0 THEN
                    v_final_dr := v_close_net;
                    v_final_cr := 0;
                ELSE
                    v_final_dr := 0;
                    v_final_cr := ABS(v_close_net);
                END IF;

                -- Accumulate totals
                v_tot_open_dr := v_tot_open_dr + v_rec.open_dr;
                v_tot_open_cr := v_tot_open_cr + v_rec.open_cr;
                v_tot_period_dr := v_tot_period_dr + v_rec.period_dr;
                v_tot_period_cr := v_tot_period_cr + v_rec.period_cr;
                v_tot_close_dr := v_tot_close_dr + v_final_dr;
                v_tot_close_cr := v_tot_close_cr + v_final_cr;

                -- P&L Accumulation (Only period activity)
                IF v_rec.code LIKE '4%' OR v_rec.account_type = 'إيرادات' THEN
                    v_total_revenue := v_total_revenue + (v_rec.period_cr - v_rec.period_dr);
                ELSIF v_rec.code = '511' OR v_rec.name LIKE '%تكلفة المبيعات%' THEN
                    v_total_cogs := v_total_cogs + (v_rec.period_dr - v_rec.period_cr);
                ELSIF v_rec.code LIKE '5%' OR v_rec.account_type = 'مصروفات' THEN
                    v_total_expenses := v_total_expenses + (v_rec.period_dr - v_rec.period_cr);
                END IF;

                -- VAT Accumulation
                IF v_rec.id = v_vat_acc_id OR v_rec.code = '215' THEN
                    v_vat_input := v_vat_input + v_rec.period_dr;
                    v_vat_output := v_vat_output + v_rec.period_cr;
                END IF;

                -- Append to list
                v_accounts_list := v_accounts_list || jsonb_build_object(
                    'account_id', v_rec.id,
                    'code', v_rec.code,
                    'name', v_rec.name,
                    'account_type', v_rec.account_type,
                    'opening_debit', v_rec.open_dr,
                    'opening_credit', v_rec.open_cr,
                    'period_debit', v_rec.period_dr,
                    'period_credit', v_rec.period_cr,
                    'closing_debit', v_final_dr,
                    'closing_credit', v_final_cr,
                    'net_balance', v_close_net
                );
            END;
        END IF;
    END LOOP;

    v_gross_profit := v_total_revenue - v_total_cogs;
    v_net_profit := v_gross_profit - v_total_expenses;
    v_vat_net := v_vat_output - v_vat_input;

    RETURN jsonb_build_object(
        'success', true,
        'period', jsonb_build_object(
            'start_date', v_start_date,
            'end_date', v_end_date
        ),
        'is_balanced', (ABS(v_tot_period_dr - v_tot_period_cr) < 0.01),
        'balance_difference', ROUND(ABS(v_tot_period_dr - v_tot_period_cr), 4),
        'totals', jsonb_build_object(
            'opening_debit', v_tot_open_dr,
            'opening_credit', v_tot_open_cr,
            'period_debit', v_tot_period_dr,
            'period_credit', v_tot_period_cr,
            'closing_debit', v_tot_close_dr,
            'closing_credit', v_tot_close_cr
        ),
        'income_statement_summary', jsonb_build_object(
            'total_revenue', v_total_revenue,
            'cogs', v_total_cogs,
            'gross_profit', v_gross_profit,
            'operating_expenses', v_total_expenses,
            'net_profit', v_net_profit
        ),
        'zatca_vat_summary', jsonb_build_object(
            'vat_output', v_vat_output,
            'vat_input', v_vat_input,
            'vat_net_payable', v_vat_net,
            'status', CASE WHEN v_vat_net >= 0 THEN 'مستحق للسداد للهيئة' ELSE 'رصيد دائن مسترد من الهيئة' END
        ),
        'accounts', v_accounts_list
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_generate_trial_balance(JSONB) TO anon, authenticated, service_role;

-- 4. Stored Procedure: rpc_close_financial_period
CREATE OR REPLACE FUNCTION public.rpc_close_financial_period(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_period_name           TEXT;
    v_start_date            DATE;
    v_end_date              DATE;
    v_fiscal_year           INT;
    v_user_id               UUID;
    v_notes                 TEXT;
    
    v_period_id             UUID;
    v_closing_journal_id    UUID := NULL;
    v_trial_bal             JSONB;
    v_inc_stmt              JSONB;
    v_vat_stmt              JSONB;
    
    v_total_revenue         NUMERIC(15, 4) := 0;
    v_total_expenses        NUMERIC(15, 4) := 0;
    v_net_profit            NUMERIC(15, 4) := 0;
    
    -- Retained Earnings Account (33 - الأرباح المرحلة / الخسائر)
    v_acc_retained_earnings UUID := '7dd590b4-b959-4b16-8874-d7c155e1c940'::uuid;
    
    v_rec                   RECORD;
    v_lines_count           INT := 0;
    v_closing_tot_dr        NUMERIC(15, 4) := 0;
    v_closing_tot_cr        NUMERIC(15, 4) := 0;
BEGIN
    -- 1. Input Extraction & Validation
    v_start_date := (p_data->>'start_date')::date;
    v_end_date := (p_data->>'end_date')::date;

    IF v_start_date IS NULL OR v_end_date IS NULL THEN
        RAISE EXCEPTION 'تاريخ البداية وتاريخ النهاية مطلوبان لإقفال الفترة المالية';
    END IF;

    IF v_start_date > v_end_date THEN
        RAISE EXCEPTION 'تاريخ البداية (%) لا يمكن أن يتجاوز تاريخ النهاية (%)', v_start_date, v_end_date;
    END IF;

    v_fiscal_year := COALESCE((p_data->>'fiscal_year')::int, EXTRACT(YEAR FROM v_end_date)::int);
    v_period_name := TRIM(COALESCE(p_data->>'period_name', 'إقفال الفترة المالية ' || to_char(v_start_date, 'YYYY-MM-DD') || ' إلى ' || to_char(v_end_date, 'YYYY-MM-DD')));
    v_notes := COALESCE(p_data->>'notes', 'إقفال مالي دوري وتصفير حسابات الأرباح والخسائر');
    
    IF p_data->>'user_id' IS NOT NULL AND TRIM(p_data->>'user_id') <> '' THEN
        BEGIN
            v_user_id := (p_data->>'user_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_user_id := NULL;
        END;
    END IF;

    -- 2. Idempotency Check: Already Closed Period
    SELECT id, closing_journal_id, net_profit INTO v_period_id, v_closing_journal_id, v_net_profit
    FROM public.financial_periods
    WHERE start_date = v_start_date AND end_date = v_end_date AND status = 'closed';

    IF v_period_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'already_closed', true,
            'period_id', v_period_id,
            'period_name', v_period_name,
            'closing_journal_id', v_closing_journal_id,
            'net_profit', v_net_profit,
            'message', 'هذه الفترة المالية مغلقة ومقفلة مسبقاً (تم منع التكرار)'
        );
    END IF;

    -- 3. Generate Trial Balance & P&L for this period
    v_trial_bal := public.rpc_generate_trial_balance(jsonb_build_object(
        'start_date', v_start_date,
        'end_date', v_end_date,
        'include_zero_balances', false
    ));

    IF NOT COALESCE((v_trial_bal->>'is_balanced')::boolean, false) THEN
        RAISE EXCEPTION 'لا يمكن إقفال الفترة المالية لأن ميزان المراجعة غير متوازن! الفارق: %', v_trial_bal->>'balance_difference';
    END IF;

    v_inc_stmt := v_trial_bal->'income_statement_summary';
    v_vat_stmt := v_trial_bal->'zatca_vat_summary';

    v_total_revenue := COALESCE((v_inc_stmt->>'total_revenue')::numeric, 0);
    v_total_expenses := COALESCE((v_inc_stmt->>'cogs')::numeric, 0) + COALESCE((v_inc_stmt->>'operating_expenses')::numeric, 0);
    v_net_profit := COALESCE((v_inc_stmt->>'net_profit')::numeric, 0);

    -- 4. Create Closing Journal Entry if there is any revenue or expense activity
    IF (v_total_revenue <> 0 OR v_total_expenses <> 0) THEN
        INSERT INTO public.journal_headers (
            entry_date,
            description,
            status,
            v_type
        ) VALUES (
            v_end_date,
            'قيد إقفال الفترة المالية وتصفير حسابات الأرباح والخسائر: ' || v_period_name,
            'posted',
            'closing'
        ) RETURNING id INTO v_closing_journal_id;

        -- 4.1 Close Revenue Accounts: Debit each revenue account with its net credit balance
        FOR v_rec IN 
            SELECT 
                jl.account_id,
                a.code,
                a.name,
                SUM(jl.credit) - SUM(jl.debit) AS net_revenue
            FROM public.journal_lines jl
            JOIN public.journal_headers jh ON jh.id = jl.header_id
            JOIN public.accounts a ON a.id = jl.account_id
            WHERE jh.entry_date BETWEEN v_start_date AND v_end_date
              AND jh.id <> v_closing_journal_id
              AND (a.code LIKE '4%' OR a.account_type = 'إيرادات')
            GROUP BY jl.account_id, a.code, a.name
            HAVING (SUM(jl.credit) - SUM(jl.debit)) <> 0
        LOOP
            IF v_rec.net_revenue > 0 THEN
                -- Normal positive revenue: Debit to zero out
                INSERT INTO public.journal_lines (
                    header_id, account_id, debit, credit, notes
                ) VALUES (
                    v_closing_journal_id, v_rec.account_id, v_rec.net_revenue, 0,
                    'إقفال وتصفير حساب إيراد [' || v_rec.code || '] ' || v_rec.name
                );
                v_closing_tot_dr := v_closing_tot_dr + v_rec.net_revenue;
            ELSE
                -- Negative revenue (unusual debit balance): Credit to zero out
                INSERT INTO public.journal_lines (
                    header_id, account_id, debit, credit, notes
                ) VALUES (
                    v_closing_journal_id, v_rec.account_id, 0, ABS(v_rec.net_revenue),
                    'إقفال وتصفير حساب إيراد [' || v_rec.code || '] ' || v_rec.name
                );
                v_closing_tot_cr := v_closing_tot_cr + ABS(v_rec.net_revenue);
            END IF;
            v_lines_count := v_lines_count + 1;
        END LOOP;

        -- 4.2 Close Expense Accounts: Credit each expense account with its net debit balance
        FOR v_rec IN 
            SELECT 
                jl.account_id,
                a.code,
                a.name,
                SUM(jl.debit) - SUM(jl.credit) AS net_expense
            FROM public.journal_lines jl
            JOIN public.journal_headers jh ON jh.id = jl.header_id
            JOIN public.accounts a ON a.id = jl.account_id
            WHERE jh.entry_date BETWEEN v_start_date AND v_end_date
              AND jh.id <> v_closing_journal_id
              AND (a.code LIKE '5%' OR a.account_type = 'مصروفات')
            GROUP BY jl.account_id, a.code, a.name
            HAVING (SUM(jl.debit) - SUM(jl.credit)) <> 0
        LOOP
            IF v_rec.net_expense > 0 THEN
                -- Normal positive expense: Credit to zero out
                INSERT INTO public.journal_lines (
                    header_id, account_id, debit, credit, notes
                ) VALUES (
                    v_closing_journal_id, v_rec.account_id, 0, v_rec.net_expense,
                    'إقفال وتصفير حساب مصروف [' || v_rec.code || '] ' || v_rec.name
                );
                v_closing_tot_cr := v_closing_tot_cr + v_rec.net_expense;
            ELSE
                -- Negative expense: Debit to zero out
                INSERT INTO public.journal_lines (
                    header_id, account_id, debit, credit, notes
                ) VALUES (
                    v_closing_journal_id, v_rec.account_id, ABS(v_rec.net_expense), 0,
                    'إقفال وتصفير حساب مصروف [' || v_rec.code || '] ' || v_rec.name
                );
                v_closing_tot_dr := v_closing_tot_dr + ABS(v_rec.net_expense);
            END IF;
            v_lines_count := v_lines_count + 1;
        END LOOP;

        -- 4.3 Post Net Profit or Loss to Retained Earnings (33)
        IF v_net_profit > 0 THEN
            -- Profit: Credit Retained Earnings
            INSERT INTO public.journal_lines (
                header_id, account_id, debit, credit, notes
            ) VALUES (
                v_closing_journal_id, v_acc_retained_earnings, 0, v_net_profit,
                'ترحيل صافي أرباح الفترة إلى حساب الأرباح المبقاة والمرحلة'
            );
            v_closing_tot_cr := v_closing_tot_cr + v_net_profit;
            v_lines_count := v_lines_count + 1;
        ELSIF v_net_profit < 0 THEN
            -- Loss: Debit Retained Earnings
            INSERT INTO public.journal_lines (
                header_id, account_id, debit, credit, notes
            ) VALUES (
                v_closing_journal_id, v_acc_retained_earnings, ABS(v_net_profit), 0,
                'ترحيل صافي خسائر الفترة إلى حساب الأرباح المبقاة والمرحلة'
            );
            v_closing_tot_dr := v_closing_tot_dr + ABS(v_net_profit);
            v_lines_count := v_lines_count + 1;
        END IF;

        -- Safety Check: Verify closing entry is 100% balanced
        IF ABS(v_closing_tot_dr - v_closing_tot_cr) > 0.001 THEN
            RAISE EXCEPTION 'فشل قيد الإقفال: القيد غير متوازن! مدين: %, دائن: %', v_closing_tot_dr, v_closing_tot_cr;
        END IF;
    END IF;

    -- 5. Record/Upsert financial_periods row
    INSERT INTO public.financial_periods (
        period_name,
        start_date,
        end_date,
        fiscal_year,
        status,
        closed_at,
        closed_by,
        closing_journal_id,
        net_profit,
        total_revenue,
        total_expenses,
        vat_output,
        vat_input,
        vat_net,
        notes,
        updated_at
    ) VALUES (
        v_period_name,
        v_start_date,
        v_end_date,
        v_fiscal_year,
        'closed',
        NOW(),
        v_user_id,
        v_closing_journal_id,
        v_net_profit,
        v_total_revenue,
        v_total_expenses,
        COALESCE((v_vat_stmt->>'vat_output')::numeric, 0),
        COALESCE((v_vat_stmt->>'vat_input')::numeric, 0),
        COALESCE((v_vat_stmt->>'vat_net_payable')::numeric, 0),
        v_notes,
        NOW()
    )
    ON CONFLICT (start_date, end_date)
    DO UPDATE SET
        status = 'closed',
        closed_at = NOW(),
        closed_by = EXCLUDED.closed_by,
        closing_journal_id = EXCLUDED.closing_journal_id,
        net_profit = EXCLUDED.net_profit,
        total_revenue = EXCLUDED.total_revenue,
        total_expenses = EXCLUDED.total_expenses,
        vat_output = EXCLUDED.vat_output,
        vat_input = EXCLUDED.vat_input,
        vat_net = EXCLUDED.vat_net,
        notes = EXCLUDED.notes,
        updated_at = NOW()
    RETURNING id INTO v_period_id;

    -- 6. Return Result
    RETURN jsonb_build_object(
        'success', true,
        'period_id', v_period_id,
        'period_name', v_period_name,
        'start_date', v_start_date,
        'end_date', v_end_date,
        'fiscal_year', v_fiscal_year,
        'closing_journal_id', v_closing_journal_id,
        'closing_lines_count', v_lines_count,
        'financial_summary', jsonb_build_object(
            'total_revenue', v_total_revenue,
            'total_expenses', v_total_expenses,
            'net_profit', v_net_profit
        ),
        'vat_summary', v_vat_stmt,
        'message', 'تم إقفال الفترة المالية وتصفير حسابات الأرباح والخسائر وقفل الفترة رقابياً بنجاح'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_close_financial_period(JSONB) TO anon, authenticated, service_role;
