-- ==============================================================================
-- Migration: 20261010_rpc_settle_fleet_trip.sql
-- Description: Atomic Fleet Trip Settlement & Driver Reconciliation Stored Procedure
-- Author: Principal Database Architect
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rpc_settle_fleet_trip(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    -- Header & Configuration
    v_fleet_operation_id        UUID;
    v_settlement_date           DATE;
    v_actual_cash_collected     NUMERIC(15, 4);
    v_safe_bank_acc_id          UUID;
    v_shortage_action           TEXT;
    v_close_trip                BOOLEAN;
    v_return_wh_id              UUID;
    v_notes                     TEXT;
    v_lines                     JSONB;

    -- Trip details
    v_trip                      RECORD;
    v_driver_id                 UUID;
    v_driver_name               TEXT;
    v_driver_phone              TEXT;
    v_vehicle_plate             TEXT;
    
    -- Financials
    v_total_sales               NUMERIC(15, 4) := 0;
    v_cash_sales                NUMERIC(15, 4) := 0;
    v_credit_sales              NUMERIC(15, 4) := 0;
    v_total_expenses            NUMERIC(15, 4) := 0;
    v_expected_cash             NUMERIC(15, 4) := 0;
    v_cash_diff                 NUMERIC(15, 4) := 0;
    v_cash_shortage             NUMERIC(15, 4) := 0;
    
    -- Inventory loop variables
    v_line                      JSONB;
    v_idx                       INT := 0;
    v_item_id                   UUID;
    v_item_name                 TEXT;
    v_item_unit                 TEXT;
    v_item_cost                 NUMERIC(15, 4);
    v_line_ret                  NUMERIC(15, 4) := 0;
    v_line_wst                  NUMERIC(15, 4) := 0;
    v_line_sold                 NUMERIC(15, 4) := 0;
    v_line_short                NUMERIC(15, 4) := 0;
    v_v_loaded                  NUMERIC(15, 4) := 0;
    v_v_sold                    NUMERIC(15, 4) := 0;
    v_accounted                 NUMERIC(15, 4) := 0;
    
    -- Inventory totals
    v_total_return_val          NUMERIC(15, 4) := 0;
    v_total_waste_val           NUMERIC(15, 4) := 0;
    v_total_shortage_val        NUMERIC(15, 4) := 0;
    v_total_inv_val             NUMERIC(15, 4) := 0;
    v_total_cogs                NUMERIC(15, 4) := 0;
    v_net_profit                NUMERIC(15, 4) := 0;
    
    -- Created records
    v_rv_id                     UUID := NULL;
    v_receipt_number            TEXT;
    v_cash_journal_id           UUID := NULL;
    v_inv_journal_id            UUID := NULL;
    v_settled_items             JSONB := '[]'::jsonb;

    -- Chart of accounts constants
    v_acc_cash_box              UUID := '21b8a1db-bc9f-4cf8-b741-1efeded0963c'::uuid; -- 122 الخزينة الرئيسية
    v_acc_emp_custody           UUID := 'f9c7ba68-6998-48e6-99b3-3a4526d820a1'::uuid; -- 125 عهدة موظفين ومناديب
    v_acc_emp_advances          UUID := '31c9923a-3629-4f3f-b661-b86df51c8e09'::uuid; -- 128 سلف موظفين الشركة / ذمم
    v_acc_rounding              UUID := 'd5e827b1-4f1a-4c2f-8a03-8d6e7f123456'::uuid; -- 527 تسويات وفروق هللات
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid; -- 126 مخزون البضائع
    v_acc_inv_custody           UUID := 'd133777e-c5f6-42be-b333-ccce6496b97f'::uuid; -- 130 عهدة مخزون
    v_acc_waste_loss            UUID := 'a5280000-0000-4000-a000-000000000528'::uuid; -- 528 خسائر توالف وهدر مخزني
BEGIN
    -- 1. Extract Header Inputs
    BEGIN
        v_fleet_operation_id := (p_data->>'fleet_operation_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف رحلة الأسطول غير صالح';
    END;

    IF v_fleet_operation_id IS NULL THEN
        RAISE EXCEPTION 'معرّف رحلة الأسطول (fleet_operation_id) مطلوب';
    END IF;

    v_settlement_date := COALESCE(NULLIF(p_data->>'settlement_date', ''), NULLIF(p_data->>'date', ''), CURRENT_DATE::text)::date;
    v_actual_cash_collected := COALESCE((p_data->>'actual_cash_collected')::numeric, (p_data->>'cash_amount')::numeric, 0);

    IF p_data->>'safe_bank_acc_id' IS NOT NULL AND TRIM(p_data->>'safe_bank_acc_id') <> '' THEN
        BEGIN
            v_safe_bank_acc_id := (p_data->>'safe_bank_acc_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_safe_bank_acc_id := v_acc_cash_box;
        END;
    ELSE
        v_safe_bank_acc_id := v_acc_cash_box;
    END IF;

    v_shortage_action := COALESCE(p_data->>'shortage_action', 'debt_on_delegate');
    v_close_trip := COALESCE((p_data->>'close_trip')::boolean, (p_data->>'closeTrip')::boolean, true);
    v_notes := COALESCE(p_data->>'notes', '');
    v_lines := COALESCE(p_data->'lines', p_data->'inventory_returns', '[]'::jsonb);

    -- 2. Fetch and Lock Fleet Operation
    SELECT * INTO v_trip
    FROM public.fleet_operations
    WHERE id = v_fleet_operation_id
    FOR UPDATE;

    IF v_trip.id IS NULL THEN
        RAISE EXCEPTION 'أمر تشغيل الرحلة غير موجود';
    END IF;

    -- 3. Idempotency Guard (Anti-Duplicate Check)
    IF v_trip.status IN ('مغلق', 'closed', 'settled') THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'fleet_operation_id', v_fleet_operation_id,
            'operation_number', v_trip.operation_number,
            'status', v_trip.status,
            'message', 'تمت تصفية وتسوية هذه الرحلة مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    -- Driver Details
    v_driver_id := v_trip.driver_id;
    IF v_driver_id IS NOT NULL THEN
        SELECT name, phone INTO v_driver_name, v_driver_phone
        FROM public.partners
        WHERE id = v_driver_id;
    END IF;

    -- Vehicle Plate Details
    IF v_trip.vehicle_id IS NOT NULL THEN
        SELECT plate_number INTO v_vehicle_plate
        FROM public.fleet_vehicles
        WHERE id = v_trip.vehicle_id;
    END IF;

    -- Return Warehouse Destination
    IF p_data->>'return_warehouse_id' IS NOT NULL AND TRIM(p_data->>'return_warehouse_id') <> '' THEN
        BEGIN
            v_return_wh_id := (p_data->>'return_warehouse_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_return_wh_id := NULL;
        END;
    END IF;
    v_return_wh_id := COALESCE(v_return_wh_id, v_trip.warehouse_id, '11111111-1111-1111-1111-111111111111'::uuid);

    -- 4. Calculate Financial Metrics (Sales & Expenses)
    SELECT 
        COALESCE(SUM(total_amount), 0),
        COALESCE(SUM(paid_amount) FILTER (WHERE payment_method ILIKE '%نقدي%' OR payment_method ILIKE '%كاش%'), 0),
        COALESCE(SUM(total_amount - paid_amount), 0)
    INTO v_total_sales, v_cash_sales, v_credit_sales
    FROM public.invoices
    WHERE fleet_operation_id = v_fleet_operation_id
      AND (status IS NULL OR status <> 'cancelled');

    SELECT COALESCE(SUM(total_price), 0)
    INTO v_total_expenses
    FROM public.expenses
    WHERE fleet_operation_id = v_fleet_operation_id
      AND (is_deleted IS NULL OR is_deleted = false);

    IF p_data->>'net_cash_due' IS NOT NULL THEN
        v_expected_cash := (p_data->>'net_cash_due')::numeric;
    ELSE
        v_expected_cash := GREATEST(0, v_cash_sales - v_total_expenses);
    END IF;

    v_cash_diff := v_actual_cash_collected - v_expected_cash;
    IF v_cash_diff < 0 THEN
        v_cash_shortage := ABS(v_cash_diff);
    ELSE
        v_cash_shortage := 0;
    END IF;

    -- 5. Cash Settlement: Receipt Voucher & Cash General Ledger Entry
    IF v_actual_cash_collected > 0 OR v_cash_shortage > 0 THEN
        -- 5.1 Insert Receipt Voucher if cash was remitted
        IF v_actual_cash_collected > 0 THEN
            v_receipt_number := 'RV-SETTLE-' || v_trip.operation_number || '-' || to_char(NOW(), 'HH24MISS');
            
            INSERT INTO public.receipt_vouchers (
                id,
                receipt_number,
                date,
                amount,
                payment_method,
                partner_id,
                delegate_id,
                fleet_operation_id,
                safe_bank_acc_id,
                partner_acc_id,
                status,
                notes,
                created_at
            ) VALUES (
                gen_random_uuid(),
                v_receipt_number,
                v_settlement_date,
                v_actual_cash_collected,
                'نقدي (كاش)',
                v_driver_id,
                v_driver_id,
                v_fleet_operation_id,
                v_safe_bank_acc_id,
                v_acc_emp_custody,
                'معتمد',
                'توريد نقدية تسوية عهدة رحلة #' || v_trip.operation_number || ' للمندوب: ' || COALESCE(v_driver_name, ''),
                NOW()
            ) RETURNING id INTO v_rv_id;
        END IF;

        -- 5.2 Insert Cash Settlement Journal Header
        INSERT INTO public.journal_headers (
            entry_date,
            description,
            status,
            v_type,
            reference_id,
            fleet_operation_id
        ) VALUES (
            v_settlement_date,
            'تسوية وتوريد نقدية عهدة رحلة #' || v_trip.operation_number || ' للمندوب: ' || COALESCE(v_driver_name, ''),
            'posted',
            'settlement',
            COALESCE(v_rv_id, v_fleet_operation_id),
            v_fleet_operation_id
        ) RETURNING id INTO v_cash_journal_id;

        -- 5.3 Balanced Journal Lines for Cash Remittance
        IF v_actual_cash_collected > 0 THEN
            -- Debit Safe/Bank
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_cash_journal_id, v_safe_bank_acc_id, NULL, v_driver_id, v_fleet_operation_id, v_actual_cash_collected, 0,
                'توريد نقدية للخزينة من عهدة رحلة #' || v_trip.operation_number || ' مندوب: ' || COALESCE(v_driver_name, '')
            );

            -- Credit Driver Custody
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_cash_journal_id, v_acc_emp_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_actual_cash_collected,
                'إخلاء عهدة نقدية للمندوب ' || COALESCE(v_driver_name, '') || ' رحلة #' || v_trip.operation_number
            );
        END IF;

        -- 5.4 Cash Shortage Lines if applicable
        IF v_cash_shortage > 0 THEN
            IF v_shortage_action = 'debt_on_delegate' THEN
                -- Debit Driver Advances / Debt (128)
                INSERT INTO public.journal_lines (
                    header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
                ) VALUES (
                    v_cash_journal_id, v_acc_emp_advances, v_driver_id, v_driver_id, v_fleet_operation_id, v_cash_shortage, 0,
                    'إثبات عجز عهدة نقدية كذمة مستحقة على المندوب ' || COALESCE(v_driver_name, '') || ' رحلة #' || v_trip.operation_number
                );

                -- Credit Driver Custody (125)
                INSERT INTO public.journal_lines (
                    header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
                ) VALUES (
                    v_cash_journal_id, v_acc_emp_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_cash_shortage,
                    'إقفال عجز عهدة رحلة #' || v_trip.operation_number || ' بذمة المندوب'
                );
            ELSE
                -- Debit Rounding Diff (527)
                INSERT INTO public.journal_lines (
                    header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
                ) VALUES (
                    v_cash_journal_id, v_acc_rounding, NULL, v_driver_id, v_fleet_operation_id, v_cash_shortage, 0,
                    'فروق وهللات تسوية عهدة رحلة #' || v_trip.operation_number || ' مندوب: ' || COALESCE(v_driver_name, '')
                );

                -- Credit Driver Custody (125)
                INSERT INTO public.journal_lines (
                    header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
                ) VALUES (
                    v_cash_journal_id, v_acc_emp_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_cash_shortage,
                    'إقفال فرق تسوية عهدة رحلة #' || v_trip.operation_number
                );
            END IF;
        END IF;
    END IF;

    -- 6. Inventory Returns & Discrepancies Processing
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;

        IF v_item_id IS NULL THEN
            CONTINUE;
        END IF;

        -- Item info and cost
        SELECT name, unit, COALESCE(NULLIF((v_line->>'unit_price')::numeric, 0), cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        -- Vehicle inventory loaded state
        SELECT COALESCE(loaded_qty, 0), COALESCE(sold_qty, 0)
        INTO v_v_loaded, v_v_sold
        FROM public.vehicle_inventory
        WHERE fleet_operation_id = v_fleet_operation_id AND item_id = v_item_id;

        v_line_ret   := COALESCE((v_line->>'returned_qty')::numeric, (v_line->>'return_qty')::numeric, 0);
        v_line_wst   := COALESCE((v_line->>'waste_qty')::numeric, 0);
        v_line_sold  := COALESCE((v_line->>'sold_qty')::numeric, v_v_sold, 0);
        v_line_short := COALESCE((v_line->>'shortage_qty')::numeric, 0);

        -- Auto-calculate shortage if not passed
        IF v_line_short = 0 AND v_v_loaded > 0 THEN
            v_accounted := v_line_sold + v_line_ret + v_line_wst;
            IF v_v_loaded > v_accounted THEN
                v_line_short := v_v_loaded - v_accounted;
            END IF;
        END IF;

        -- 6.1 Return Stock to Warehouse
        IF v_line_ret > 0 THEN
            -- Add back to warehouse_inventory
            INSERT INTO public.warehouse_inventory (
                warehouse_id, item_id, quantity, updated_at
            ) VALUES (
                v_return_wh_id, v_item_id, v_line_ret, NOW()
            )
            ON CONFLICT (warehouse_id, item_id)
            DO UPDATE SET
                quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
                updated_at = NOW();

            -- Paired audit in inventory_transactions
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
                unit_price,
                total_price,
                notes,
                status,
                created_at
            ) VALUES (
                gen_random_uuid(),
                'RET-' || v_trip.operation_number || '-' || v_idx,
                v_settlement_date,
                'in',
                v_line_ret,
                v_item_id,
                v_driver_id,
                v_driver_id,
                v_fleet_operation_id,
                v_return_wh_id,
                v_item_cost,
                v_line_ret * v_item_cost,
                'إرجاع فائض بضاعة للمستودع من رحلة #' || v_trip.operation_number || ' للمندوب ' || COALESCE(v_driver_name, ''),
                'approved',
                NOW()
            );

            v_total_return_val := v_total_return_val + (v_line_ret * v_item_cost);
        END IF;

        -- 6.2 Waste / Damage Write-off
        IF v_line_wst > 0 THEN
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
                unit_price,
                total_price,
                notes,
                status,
                created_at
            ) VALUES (
                gen_random_uuid(),
                'WST-' || v_trip.operation_number || '-' || v_idx,
                v_settlement_date,
                'waste',
                v_line_wst,
                v_item_id,
                v_driver_id,
                v_driver_id,
                v_fleet_operation_id,
                v_return_wh_id,
                v_item_cost,
                v_line_wst * v_item_cost,
                'توالف وهدر بضاعة رحلة #' || v_trip.operation_number || ' للمندوب ' || COALESCE(v_driver_name, ''),
                'approved',
                NOW()
            );

            v_total_waste_val := v_total_waste_val + (v_line_wst * v_item_cost);
        END IF;

        -- 6.3 Shortage Value
        IF v_line_short > 0 THEN
            v_total_shortage_val := v_total_shortage_val + (v_line_short * v_item_cost);
        END IF;

        -- 6.4 Update vehicle_inventory: Set quantity to 0 and record breakdown
        INSERT INTO public.vehicle_inventory (
            id,
            fleet_operation_id,
            item_id,
            quantity,
            loaded_qty,
            sold_qty,
            returned_qty,
            waste_qty,
            shortage_qty,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_fleet_operation_id,
            v_item_id,
            0,
            v_v_loaded,
            v_line_sold,
            v_line_ret,
            v_line_wst,
            v_line_short,
            NOW(),
            NOW()
        )
        ON CONFLICT (fleet_operation_id, item_id)
        DO UPDATE SET
            sold_qty = EXCLUDED.sold_qty,
            returned_qty = EXCLUDED.returned_qty,
            waste_qty = EXCLUDED.waste_qty,
            shortage_qty = EXCLUDED.shortage_qty,
            quantity = 0,
            updated_at = NOW();

        v_settled_items := v_settled_items || jsonb_build_object(
            'item_id', v_item_id,
            'item_name', v_item_name,
            'loaded_qty', v_v_loaded,
            'sold_qty', v_line_sold,
            'returned_qty', v_line_ret,
            'waste_qty', v_line_wst,
            'shortage_qty', v_line_short,
            'unit_cost', v_item_cost
        );
    END LOOP;

    -- 7. Inventory Custody Settlement Journal Entry
    v_total_inv_val := v_total_return_val + v_total_waste_val + v_total_shortage_val;
    IF v_total_inv_val > 0 THEN
        INSERT INTO public.journal_headers (
            entry_date,
            description,
            status,
            v_type,
            reference_id,
            fleet_operation_id
        ) VALUES (
            v_settlement_date,
            'إرجاع وتسوية مخزون بضاعة رحلة #' || v_trip.operation_number || ' للمندوب: ' || COALESCE(v_driver_name, ''),
            'posted',
            'inventory',
            v_fleet_operation_id,
            v_fleet_operation_id
        ) RETURNING id INTO v_inv_journal_id;

        -- 7.1 Returned Goods: Debit 126 Inventory, Credit 130 Custody
        IF v_total_return_val > 0 THEN
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_inventory, NULL, v_driver_id, v_fleet_operation_id, v_total_return_val, 0,
                'إرجاع بضاعة للمستودع من عهدة رحلة #' || v_trip.operation_number
            );

            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_inv_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_total_return_val,
                'إخلاء عهدة مخزون بضاعة مرتجعة للمندوب ' || COALESCE(v_driver_name, '')
            );
        END IF;

        -- 7.2 Waste Goods: Debit 528 Waste Loss, Credit 130 Custody
        IF v_total_waste_val > 0 THEN
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_waste_loss, NULL, v_driver_id, v_fleet_operation_id, v_total_waste_val, 0,
                'إثبات خسائر توالف وهدر بضاعة رحلة #' || v_trip.operation_number
            );

            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_inv_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_total_waste_val,
                'تخفيض عهدة المخزون بالتوالف للمندوب ' || COALESCE(v_driver_name, '')
            );
        END IF;

        -- 7.3 Shortage Goods: Debit 128 Advances/Debt, Credit 130 Custody
        IF v_total_shortage_val > 0 THEN
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_emp_advances, v_driver_id, v_driver_id, v_fleet_operation_id, v_total_shortage_val, 0,
                'عجز بضاعة مفقودة محمل كذمة على المندوب ' || COALESCE(v_driver_name, '') || ' رحلة #' || v_trip.operation_number
            );

            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
            ) VALUES (
                v_inv_journal_id, v_acc_inv_custody, v_driver_id, v_driver_id, v_fleet_operation_id, 0, v_total_shortage_val,
                'إقفال عهدة المخزون بالعجز المحمل على المندوب ' || COALESCE(v_driver_name, '')
            );
        END IF;
    END IF;

    -- 8. Final Trip Status & Metrics Update
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_total_cogs
    FROM public.inventory_transactions
    WHERE fleet_operation_id = v_fleet_operation_id
      AND type IN ('out', 'sales_deduction');

    v_net_profit := v_total_sales - (v_total_cogs + v_total_expenses);

    UPDATE public.fleet_operations
    SET 
        status = CASE WHEN v_close_trip THEN 'مغلق' ELSE status END,
        total_sales = v_total_sales,
        total_expenses = v_total_expenses,
        inventory_cost = v_total_cogs,
        net_profit = v_net_profit,
        notes = TRIM(COALESCE(notes, '') || ' | ' || 'تمت التصفية والتسوية بتاريخ ' || v_settlement_date::text || COALESCE(' - ' || v_notes, ''))
    WHERE id = v_fleet_operation_id;

    -- 9. Return Settlement Result
    RETURN jsonb_build_object(
        'success', true,
        'fleet_operation_id', v_fleet_operation_id,
        'operation_number', v_trip.operation_number,
        'status', CASE WHEN v_close_trip THEN 'مغلق' ELSE v_trip.status END,
        'receipt_voucher_id', v_rv_id,
        'receipt_number', v_receipt_number,
        'cash_journal_id', v_cash_journal_id,
        'inventory_journal_id', v_inv_journal_id,
        'driver_id', v_driver_id,
        'driver_name', v_driver_name,
        'financials', jsonb_build_object(
            'total_sales', v_total_sales,
            'cash_sales', v_cash_sales,
            'credit_sales', v_credit_sales,
            'total_expenses', v_total_expenses,
            'expected_cash', v_expected_cash,
            'actual_cash_collected', v_actual_cash_collected,
            'cash_shortage', v_cash_shortage,
            'net_profit', v_net_profit
        ),
        'inventory_settlement', jsonb_build_object(
            'items_settled_count', v_idx,
            'total_returned_value', v_total_return_val,
            'total_waste_value', v_total_waste_val,
            'total_shortage_value', v_total_shortage_val,
            'items', v_settled_items
        ),
        'message', 'تمت تسوية وتصفية رحلة الأسطول بنجاح وتحديث القيود والأرصدة'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_settle_fleet_trip(JSONB) TO anon, authenticated, service_role;
