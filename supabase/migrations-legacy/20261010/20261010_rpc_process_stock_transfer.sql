-- ==============================================================================
-- Migration: 20261010_rpc_process_stock_transfer.sql
-- Description: Atomic Inter-Warehouse & Vehicle Trip Stock Transfer Stored Procedure
-- Author: Principal Database Architect
-- ==============================================================================

-- 1. Ensure Unique Indexes for Atomic Upserts
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_inventory_fleet_item 
ON public.vehicle_inventory (fleet_operation_id, item_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_inventory_wh_item 
ON public.warehouse_inventory (warehouse_id, item_id);

-- 2. Core RPC Function
CREATE OR REPLACE FUNCTION public.rpc_process_stock_transfer(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    -- Header parameters
    v_transfer_number           TEXT;
    v_date                      DATE;
    v_source_warehouse_id       UUID;
    v_dest_warehouse_id         UUID;
    v_fleet_operation_id        UUID;
    v_delegate_id               UUID;
    v_notes                     TEXT;
    v_lines                     JSONB;
    
    -- Lookups & metadata
    v_src_name                  TEXT;
    v_dest_name                 TEXT;
    v_fleet_op_number           TEXT;
    v_delegate_name             TEXT;
    
    -- Processing variables
    v_line                      JSONB;
    v_idx                       INT := 0;
    v_item_id                   UUID;
    v_item_name                 TEXT;
    v_item_unit                 TEXT;
    v_item_cost                 NUMERIC(15, 4);
    v_requested_qty             NUMERIC(15, 4);
    v_source_qty                NUMERIC(15, 4);
    v_line_total_cost           NUMERIC(15, 4);
    
    -- Totals
    v_total_qty                 NUMERIC(15, 4) := 0;
    v_total_cost                NUMERIC(15, 4) := 0;
    
    -- Output arrays & IDs
    v_txn_out_id                UUID;
    v_txn_in_id                 UUID;
    v_txn_out_num               TEXT;
    v_txn_in_num                TEXT;
    v_created_transactions      JSONB := '[]'::jsonb;
    
    -- Accounting
    v_journal_id                UUID := NULL;
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid; -- 126 مخزون البضائع
    v_acc_custody               UUID := 'd133777e-c5f6-42be-b333-ccce6496b97f'::uuid; -- 130 عهدة مخزون
    v_acc_emp_custody           UUID := 'f9c7ba68-6998-48e6-99b3-3a4526d820a1'::uuid; -- 125 عهدة موظفين/مناديب
    v_debit_acc                 UUID;
    v_credit_acc                UUID;
    v_debit_notes               TEXT;
    v_credit_notes              TEXT;
BEGIN
    -- 1. Input Extraction & Fallbacks
    v_transfer_number := TRIM(COALESCE(p_data->>'transfer_number', p_data->>'transfer_no', ''));
    IF v_transfer_number = '' THEN
        v_transfer_number := 'TR-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), NULLIF(p_data->>'transfer_date', ''), CURRENT_DATE::text)::date;
    
    BEGIN
        v_source_warehouse_id := (p_data->>'source_warehouse_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف مستودع المصدر غير صالح';
    END;

    BEGIN
        v_dest_warehouse_id := (p_data->>'destination_warehouse_id')::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف مستودع الوجهة غير صالح';
    END;

    IF p_data->>'fleet_operation_id' IS NOT NULL AND TRIM(p_data->>'fleet_operation_id') <> '' THEN
        BEGIN
            v_fleet_operation_id := (p_data->>'fleet_operation_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_fleet_operation_id := NULL;
        END;
    END IF;

    IF p_data->>'delegate_id' IS NOT NULL AND TRIM(p_data->>'delegate_id') <> '' THEN
        BEGIN
            v_delegate_id := (p_data->>'delegate_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_delegate_id := NULL;
        END;
    END IF;

    v_notes := COALESCE(p_data->>'notes', '');
    v_lines := COALESCE(p_data->'lines', p_data->'items');

    -- 2. Basic Validations
    IF v_source_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'مستودع المصدر مطلوب';
    END IF;

    IF v_dest_warehouse_id IS NULL THEN
        RAISE EXCEPTION 'مستودع الوجهة مطلوب';
    END IF;

    IF v_source_warehouse_id = v_dest_warehouse_id THEN
        RAISE EXCEPTION 'لا يمكن إجراء تحويل مخزني لنفس المستودع';
    END IF;

    IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
        RAISE EXCEPTION 'يجب تحديد صنف واحد على الأقل للتحويل';
    END IF;

    -- Verify source warehouse exists
    SELECT name INTO v_src_name
    FROM public.warehouses
    WHERE id = v_source_warehouse_id;

    IF v_src_name IS NULL THEN
        RAISE EXCEPTION 'مستودع المصدر غير موجود أو غير معرّف';
    END IF;

    -- Verify destination warehouse exists
    SELECT name INTO v_dest_name
    FROM public.warehouses
    WHERE id = v_dest_warehouse_id;

    IF v_dest_name IS NULL THEN
        RAISE EXCEPTION 'مستودع الوجهة غير موجود أو غير معرّف';
    END IF;

    -- Look up fleet operation details if linked
    IF v_fleet_operation_id IS NOT NULL THEN
        SELECT operation_number, driver_id INTO v_fleet_op_number, v_delegate_id
        FROM public.fleet_operations
        WHERE id = v_fleet_operation_id;

        IF v_fleet_op_number IS NULL THEN
            RAISE EXCEPTION 'أمر تشغيل الرحلة المحدد غير موجود';
        END IF;
    END IF;

    -- Look up delegate name if delegate_id is present
    IF v_delegate_id IS NOT NULL THEN
        SELECT name INTO v_delegate_name
        FROM public.partners
        WHERE id = v_delegate_id;
    END IF;

    -- 3. Idempotency Guard (Anti-Duplicate Check)
    IF EXISTS (
        SELECT 1 FROM public.inventory_transactions
        WHERE transaction_number = 'TROUT-' || v_transfer_number || '-1'
           OR transaction_number = 'TROUT-' || v_transfer_number
           OR transaction_number = v_transfer_number
    ) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'transfer_number', v_transfer_number,
            'message', 'تم تنفيذ هذا التحويل مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    -- 4. Line-by-Line Stock Validation & Pessimistic Row Locking
    -- Lock and validate all lines upfront to guarantee complete atomic consistency
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_item_id := (v_line->>'item_id')::uuid;
        v_requested_qty := COALESCE((v_line->>'quantity')::numeric, 0);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'معرّف الصنف غير صالح في أحد بنود التحويل';
        END IF;

        IF v_requested_qty <= 0 THEN
            RAISE EXCEPTION 'كمية التحويل يجب أن تكون أكبر من الصفر لجميع الأصناف';
        END IF;

        -- Check item existence
        SELECT name, unit, COALESCE(cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'الصنف برقم % غير مسجل في النظام', v_item_id;
        END IF;

        -- Row lock source warehouse inventory
        SELECT COALESCE(quantity, 0)
        INTO v_source_qty
        FROM public.warehouse_inventory
        WHERE warehouse_id = v_source_warehouse_id AND item_id = v_item_id
        FOR UPDATE;

        IF NOT FOUND OR v_source_qty < v_requested_qty THEN
            RAISE EXCEPTION 'رصيد الصنف "%" غير كافٍ في مستودع المصدر (%). المتاح: % %، المطلوب: % %',
                v_item_name, v_src_name, COALESCE(v_source_qty, 0), COALESCE(v_item_unit, 'وحدة'), v_requested_qty, COALESCE(v_item_unit, 'وحدة');
        END IF;
    END LOOP;

    -- 5. Execution: Deduct Source, Add Destination, Update Fleet, Log Transactions
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_requested_qty := (v_line->>'quantity')::numeric;

        -- Item cost (override from payload if provided, else from item master)
        SELECT name, unit, COALESCE(NULLIF((v_line->>'unit_price')::numeric, 0), cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        v_line_total_cost := v_requested_qty * v_item_cost;
        v_total_qty := v_total_qty + v_requested_qty;
        v_total_cost := v_total_cost + v_line_total_cost;

        -- 5.1 Deduct from Source Warehouse
        UPDATE public.warehouse_inventory
        SET quantity = quantity - v_requested_qty,
            updated_at = NOW()
        WHERE warehouse_id = v_source_warehouse_id AND item_id = v_item_id;

        -- 5.2 Add/Upsert into Destination Warehouse
        INSERT INTO public.warehouse_inventory (
            warehouse_id, item_id, quantity, updated_at
        )
        VALUES (
            v_dest_warehouse_id, v_item_id, v_requested_qty, NOW()
        )
        ON CONFLICT (warehouse_id, item_id)
        DO UPDATE SET
            quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
            updated_at = NOW();

        -- 5.3 If linked to a Fleet Operation / Trip, update vehicle_inventory
        IF v_fleet_operation_id IS NOT NULL THEN
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
            )
            VALUES (
                gen_random_uuid(),
                v_fleet_operation_id,
                v_item_id,
                v_requested_qty,
                v_requested_qty,
                0, 0, 0, 0,
                NOW(),
                NOW()
            )
            ON CONFLICT (fleet_operation_id, item_id)
            DO UPDATE SET
                quantity = COALESCE(public.vehicle_inventory.quantity, 0) + EXCLUDED.quantity,
                loaded_qty = COALESCE(public.vehicle_inventory.loaded_qty, 0) + EXCLUDED.loaded_qty,
                updated_at = NOW();
        END IF;

        -- 5.4 Insert Paired Audit Records into inventory_transactions
        v_txn_out_num := 'TROUT-' || v_transfer_number || '-' || v_idx;
        v_txn_in_num  := 'TRIN-'  || v_transfer_number || '-' || v_idx;

        -- Transfer Out Record
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
            destination_warehouse_id,
            unit_price,
            total_price,
            notes,
            status,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            v_txn_out_num,
            v_date,
            'transfer_out',
            v_requested_qty,
            v_item_id,
            v_delegate_id,
            v_delegate_id,
            v_fleet_operation_id,
            v_source_warehouse_id,
            v_dest_warehouse_id,
            v_item_cost,
            v_line_total_cost,
            'تحويل مخزني صادر رقم ' || v_transfer_number || ' إلى ' || v_dest_name || COALESCE(' - ' || v_notes, ''),
            'approved',
            NOW()
        )
        RETURNING id INTO v_txn_out_id;

        -- Transfer In Record
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
            destination_warehouse_id,
            unit_price,
            total_price,
            notes,
            status,
            created_at
        )
        VALUES (
            gen_random_uuid(),
            v_txn_in_num,
            v_date,
            'transfer_in',
            v_requested_qty,
            v_item_id,
            v_delegate_id,
            v_delegate_id,
            v_fleet_operation_id,
            v_dest_warehouse_id,
            v_source_warehouse_id,
            v_item_cost,
            v_line_total_cost,
            'تحويل مخزني وارد رقم ' || v_transfer_number || ' من ' || v_src_name || COALESCE(' - ' || v_notes, ''),
            'approved',
            NOW()
        )
        RETURNING id INTO v_txn_in_id;

        -- Append to return array
        v_created_transactions := v_created_transactions || jsonb_build_object(
            'item_id', v_item_id,
            'item_name', v_item_name,
            'quantity', v_requested_qty,
            'unit_cost', v_item_cost,
            'total_cost', v_line_total_cost,
            'transfer_out_id', v_txn_out_id,
            'transfer_in_id', v_txn_in_id
        );
    END LOOP;

    -- 6. Balanced Double-Entry General Ledger Journal Entry
    IF v_total_cost > 0 THEN
        IF v_fleet_operation_id IS NOT NULL THEN
            -- Dispatch / Loading for Fleet trip
            v_debit_acc := v_acc_custody; -- 130 عهدة مخزون
            v_credit_acc := v_acc_inventory; -- 126 مخزون البضائع
            v_debit_notes := 'تحميل بضاعة عهدة رحلة #' || COALESCE(v_fleet_op_number, '') || COALESCE(' مندوب: ' || v_delegate_name, '');
            v_credit_notes := 'صرف بضاعة من ' || v_src_name || ' لعهدة رحلة #' || COALESCE(v_fleet_op_number, '');
        ELSE
            -- Inter-Warehouse Transfer between Cost Centers
            v_debit_acc := v_acc_inventory; -- 126 مخزون البضائع (مستودع الوجهة)
            v_credit_acc := v_acc_inventory; -- 126 مخزون البضائع (مستودع المصدر)
            v_debit_notes := 'استلام تحويل مخزني داخلي في ' || v_dest_name;
            v_credit_notes := 'صرف تحويل مخزني داخلي من ' || v_src_name;
        END IF;

        INSERT INTO public.journal_headers (
            entry_date,
            description,
            status,
            v_type,
            reference_id
        )
        VALUES (
            v_date,
            'تحويل مخزني #' || v_transfer_number || ' من ' || v_src_name || ' إلى ' || v_dest_name,
            'posted',
            'inventory',
            COALESCE(v_fleet_operation_id, v_txn_out_id)
        )
        RETURNING id INTO v_journal_id;

        -- Debit Line
        INSERT INTO public.journal_lines (
            header_id,
            account_id,
            partner_id,
            debit,
            credit,
            notes
        )
        VALUES (
            v_journal_id,
            v_debit_acc,
            v_delegate_id,
            v_total_cost,
            0,
            v_debit_notes
        );

        -- Credit Line
        INSERT INTO public.journal_lines (
            header_id,
            account_id,
            partner_id,
            debit,
            credit,
            notes
        )
        VALUES (
            v_journal_id,
            v_credit_acc,
            NULL,
            0,
            v_total_cost,
            v_credit_notes
        );

        -- Link journal_id to the created inventory transactions
        UPDATE public.inventory_transactions
        SET journal_id = v_journal_id
        WHERE transaction_number LIKE 'TROUT-' || v_transfer_number || '-%'
           OR transaction_number LIKE 'TRIN-'  || v_transfer_number || '-%';
    END IF;

    -- 7. Return Summary Response
    RETURN jsonb_build_object(
        'success', true,
        'transfer_number', v_transfer_number,
        'journal_id', v_journal_id,
        'source_warehouse_id', v_source_warehouse_id,
        'source_warehouse_name', v_src_name,
        'destination_warehouse_id', v_dest_warehouse_id,
        'destination_warehouse_name', v_dest_name,
        'fleet_operation_id', v_fleet_operation_id,
        'fleet_operation_number', v_fleet_op_number,
        'delegate_id', v_delegate_id,
        'delegate_name', v_delegate_name,
        'lines_count', v_idx,
        'total_quantity', v_total_qty,
        'total_cost', v_total_cost,
        'transactions', v_created_transactions,
        'message', 'تم تنفيذ التحويل المخزني بنجاح وتحديث الأرصدة والقيود المحاسبية'
    );
END;
$func$;

GRANT EXECUTE ON FUNCTION public.rpc_process_stock_transfer(JSONB) TO anon, authenticated, service_role;
