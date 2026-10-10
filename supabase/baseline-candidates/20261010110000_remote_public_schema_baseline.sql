-- CANDIDATE ONLY: remote public-schema baseline captured read-only from Supabase.
-- Version 20261010110000 sorts before the pending 20261010120000 idempotency migration.
-- This file is intentionally outside supabase/migrations until the duplicate legacy versions
-- and local-vs-remote function differences are resolved.
-- Dump source: PostgreSQL 17.6; generated with pg_dump 18.4, schema-only, no owner rewrite.
-- psql-only restrict directives and CREATE SCHEMA public were removed for migration compatibility.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: approve_inventory_transaction(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_inventory_transaction(p_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_txn RECORD;
    v_qty numeric;
    v_unit_price numeric;
    v_total_amount numeric;
    v_tax_amount numeric;
    v_journal_id uuid;
    v_inv_acc_id uuid := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393';
    v_vat_acc_id uuid := '990c949c-5f32-40d7-8d36-5fe45a6c892c';
    v_delegate_custody_acc_id uuid := 'd133777e-c5f6-42be-b333-ccce6496b97f';
    v_target_warehouse_id uuid;
    v_partner_acc_id uuid;
    v_full_desc text;
BEGIN
    SELECT i.*, 
           itm.name AS item_name, 
           p.name AS partner_name, p.account_id AS partner_acc, p.partner_type,
           fo.operation_number,
           veh.plate_number AS vehicle_plate,
           fo.vehicle_id, fo.driver_id, driver.name AS driver_name
    INTO v_txn
    FROM public.inventory_transactions i
    LEFT JOIN public.inventory_items itm ON itm.id = i.item_id
    LEFT JOIN public.partners p ON p.id = i.partner_id
    LEFT JOIN public.fleet_operations fo ON fo.id = i.fleet_operation_id
    LEFT JOIN public.fleet_vehicles veh ON veh.id = fo.vehicle_id
    LEFT JOIN public.partners driver ON driver.id = fo.driver_id
    WHERE i.id = p_id;

    IF v_txn.id IS NULL THEN
        RAISE EXCEPTION 'Ø§Ù„Ø­Ø±ÙƒØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©';
    END IF;

    IF v_txn.status = 'approved' THEN
        RAISE EXCEPTION 'Ø§Ù„Ø­Ø±ÙƒØ© Ù…Ø¹ØªÙ…Ø¯Ø© Ù…Ø³Ø¨Ù‚Ø§Ù‹';
    END IF;

    v_qty := COALESCE(v_txn.quantity, 0);
    v_unit_price := COALESCE(v_txn.unit_price, 0);
    v_total_amount := v_qty * v_unit_price;
    v_tax_amount := COALESCE(v_txn.tax_amount, 0);

    v_full_desc := 'ØµÙ†Ù: ' || COALESCE(v_txn.item_name, 'ØºÙŠØ± Ù…Ø­Ø¯Ø¯') || 
                   ' | ÙƒÙ…ÙŠØ©: ' || v_qty || 
                   ' | Ø¬Ù‡Ø©: ' || COALESCE(v_txn.partner_name, 'Ø¨Ø¯ÙˆÙ†') || 
                   ' | Ø±Ø­Ù„Ø©: #' || COALESCE(v_txn.operation_number, 'Ø¨Ø¯ÙˆÙ†');

    IF COALESCE(v_txn.partner_type, '') IN ('delegate', 'employee') THEN
        v_partner_acc_id := v_delegate_custody_acc_id;
    ELSE
        v_partner_acc_id := COALESCE(v_txn.partner_acc, CASE WHEN v_txn.type IN ('in', 'transfer_in') THEN 'c4b01e7f-b892-4517-bdc9-7cc97d8112f6'::uuid ELSE '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid END);
    END IF;

    -- Use the transaction's warehouse_id or default to main warehouse
    v_target_warehouse_id := COALESCE(v_txn.warehouse_id, '11111111-1111-1111-1111-111111111111'::uuid);

    -- 1. Ø­Ø±ÙƒØ© Ø£Ø³Ø·ÙˆÙ„ / Ø¹Ù‡Ø¯Ø© Ø³ÙŠØ§Ø±Ø©
    IF v_txn.fleet_operation_id IS NOT NULL AND v_txn.vehicle_id IS NOT NULL THEN
        PERFORM public.update_inventory_quantity(v_txn.item_id, -v_qty, v_target_warehouse_id);
        PERFORM public.update_inventory_quantity(v_txn.item_id, v_qty, v_txn.vehicle_id);

        INSERT INTO public.journal_headers (entry_date, description, status, v_type, reference_id)
        VALUES (v_txn.transaction_date, 'ØªØ­Ù…ÙŠÙ„ Ø¹Ù‡Ø¯Ø© Ù…Ù†Ø¯ÙˆØ¨ - ' || v_full_desc, 'posted', 'inventory', v_txn.id)
        RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_delegate_custody_acc_id, v_txn.driver_id, v_total_amount, 0, 'ØªØ­Ù…ÙŠÙ„ Ø¹Ù‡Ø¯Ø© (Ù…Ø¯ÙŠÙ†)');
        
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_inv_acc_id, NULL, 0, v_total_amount, 'ØµØ±Ù Ù…Ù† Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ (Ø¯Ø§Ø¦Ù†)');

    -- 2. Ø¥ØªÙ„Ø§Ù Ù…Ø®Ø²Ù†ÙŠ ÙˆØªÙˆØ§Ù„Ù (Waste Accounting)
    ELSIF v_txn.type = 'waste' THEN
        PERFORM public.update_inventory_quantity(v_txn.item_id, -v_qty, v_target_warehouse_id);

        IF v_total_amount > 0 THEN
            INSERT INTO public.journal_headers (entry_date, description, status, v_type, reference_id)
            VALUES (v_txn.transaction_date, 'Ø¥ØªÙ„Ø§Ù Ù…Ø®Ø²Ù†ÙŠ - Ø®Ø³Ø§Ø¦Ø± ØªÙˆØ§Ù„Ù ÙˆÙ‡Ø¯Ø± - ' || COALESCE(v_txn.transaction_number, '') || ' - ' || v_full_desc, 'posted', 'inventory', v_txn.id)
            RETURNING id INTO v_journal_id;

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
            VALUES (v_journal_id, 'a5280000-0000-4000-a000-000000000528'::uuid, v_txn.partner_id, v_total_amount, 0, 'Ø®Ø³Ø§Ø¦Ø± ØªÙˆØ§Ù„Ù ÙˆÙ‡Ø¯Ø± Ù…Ø®Ø²Ù†ÙŠ (Ù…Ø¯ÙŠÙ†)');

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
            VALUES (v_journal_id, v_inv_acc_id, NULL, 0, v_total_amount, 'ØªØ®ÙÙŠØ¶ Ø§Ù„Ù…Ø®Ø²ÙˆÙ† Ø¨Ø§Ù„ØªØ§Ù„Ù (Ø¯Ø§Ø¦Ù†)');
        END IF;

    -- 3. Ø§Ø³ØªØ±Ø¬Ø§Ø¹ ÙÙˆØ§Ø±Øº (Empty Bottles Return)
    ELSIF v_txn.type = 'empty_return' THEN
        PERFORM public.update_inventory_quantity(v_txn.item_id, v_qty, v_target_warehouse_id);

        IF v_total_amount > 0 THEN
            INSERT INTO public.journal_headers (entry_date, description, status, v_type, reference_id)
            VALUES (v_txn.transaction_date, 'Ø§Ø³ØªØ±Ø¬Ø§Ø¹ ÙÙˆØ§Ø±Øº Ù„Ù„Ù…Ø³ØªÙˆØ¯Ø¹ - ' || COALESCE(v_txn.transaction_number, '') || ' - ' || v_full_desc, 'posted', 'inventory', v_txn.id)
            RETURNING id INTO v_journal_id;

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
            VALUES (v_journal_id, v_inv_acc_id, NULL, v_total_amount, 0, 'Ø§Ø³ØªÙ„Ø§Ù… ÙÙˆØ§Ø±Øº Ù„Ù„Ù…Ø³ØªÙˆØ¯Ø¹ (Ù…Ø¯ÙŠÙ†)');

            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
            VALUES (v_journal_id, v_partner_acc_id, v_txn.partner_id, 0, v_total_amount, 'ØªØ³ÙˆÙŠØ© Ø¹Ù‡Ø¯Ø©/ØªØ£Ù…ÙŠÙ†Ø§Øª ÙÙˆØ§Ø±Øº (Ø¯Ø§Ø¦Ù†)');
        END IF;

    -- 4. ØªÙˆØ±ÙŠØ¯ Ù…Ø®Ø²Ù†ÙŠ (Inflow)
    ELSIF v_txn.type IN ('in', 'transfer_in') THEN
        PERFORM public.update_inventory_quantity(v_txn.item_id, v_qty, v_target_warehouse_id);

        INSERT INTO public.journal_headers (entry_date, description, status, v_type, reference_id)
        VALUES (v_txn.transaction_date, 'ØªÙˆØ±ÙŠØ¯ Ù…Ø®Ø²Ù†ÙŠ - ' || COALESCE(v_txn.transaction_number,'') || ' - ' || v_full_desc, 'posted', 'inventory', v_txn.id)
        RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_inv_acc_id, NULL, v_total_amount, 0, 'Ø§Ø³ØªÙ„Ø§Ù… Ù„Ù„Ù…Ø³ØªÙˆØ¯Ø¹ (Ù…Ø¯ÙŠÙ†)');
        
        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_partner_acc_id, v_txn.partner_id, 0, v_total_amount, 'ÙÙˆØ§ØªÙŠØ± Ù‚ÙŠØ¯ Ø§Ù„Ø§Ø³ØªÙ„Ø§Ù… (Ø¯Ø§Ø¦Ù†)');
        
    -- 5. ØµØ±Ù Ù…Ø®Ø²Ù†ÙŠ Ø¹Ø§Ø¯ÙŠ (Outflow)
    ELSE
        PERFORM public.update_inventory_quantity(v_txn.item_id, -v_qty, v_target_warehouse_id);

        INSERT INTO public.journal_headers (entry_date, description, status, v_type, reference_id)
        VALUES (v_txn.transaction_date, 'ØµØ±Ù Ù…Ø®Ø²Ù†ÙŠ - ' || COALESCE(v_txn.transaction_number,'') || ' - ' || v_full_desc, 'posted', 'inventory', v_txn.id)
        RETURNING id INTO v_journal_id;

        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_partner_acc_id, v_txn.partner_id, v_total_amount + v_tax_amount, 0, 'Ø§Ø³ØªØ­Ù‚Ø§Ù‚ Ù…Ø¯ÙŠÙ† (Ø°Ù…Ø©)');
        
        IF v_tax_amount > 0 THEN
            INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
            VALUES (v_journal_id, v_vat_acc_id, NULL, 0, v_tax_amount, 'Ø¶Ø±ÙŠØ¨Ø© Ù…Ø®Ø±Ø¬Ø§Øª (Ø¯Ø§Ø¦Ù†)');
        END IF;

        INSERT INTO public.journal_lines (header_id, account_id, partner_id, debit, credit, notes)
        VALUES (v_journal_id, v_inv_acc_id, NULL, 0, v_total_amount, 'ØµØ±Ù Ù…Ù† Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ (Ø¯Ø§Ø¦Ù†)');
    END IF;

    UPDATE public.inventory_transactions SET status = 'approved' WHERE id = p_id;
END;
$$;


--
-- Name: check_pos_invoice_shift_required(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_pos_invoice_shift_required() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_shift_status TEXT;
BEGIN
    -- Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„ÙØ§ØªÙˆØ±Ø© ØµØ§Ø¯Ø±Ø© Ù…Ù† Ù†Ù‚Ø·Ø© Ø¨ÙŠØ¹
    IF (NEW.invoice_number LIKE 'INV-POS-%' OR NEW.shift_id IS NOT NULL) THEN
        IF NEW.shift_id IS NULL THEN
            RAISE EXCEPTION 'â›” Ù…Ù†Ø¹ Ø£Ù…Ù†ÙŠ: Ù„Ø§ ÙŠÙ…ÙƒÙ† Ø¥ØµØ¯Ø§Ø± Ø£ÙŠ ÙØ§ØªÙˆØ±Ø© Ù†Ù‚Ø·Ø© Ø¨ÙŠØ¹ Ø¨Ø¯ÙˆÙ† Ø¨Ø¯Ø¡ ÙˆÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø£ÙˆÙ„Ø§Ù‹! ÙŠØ¬Ø¨ ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© ÙˆØ±Ø¨Ø· Ø§Ù„ÙØ§ØªÙˆØ±Ø© Ø¨Ù‡Ø§.';
        END IF;

        -- Ø§Ù„ØªØ£ÙƒØ¯ Ù…Ù† Ø£Ù† Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…Ø±Ø¨ÙˆØ·Ø© Ù…ÙØªÙˆØ­Ø© ÙˆÙ„ÙŠØ³Øª Ù…ØºÙ„Ù‚Ø©
        SELECT status INTO v_shift_status FROM public.pos_shifts WHERE id = NEW.shift_id;
        IF v_shift_status != 'open' THEN
            RAISE EXCEPTION 'â›” Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…Ø­Ø¯Ø¯Ø© Ù…ØºÙ„Ù‚Ø© Ø­Ø§Ù„ÙŠØ§Ù‹! Ù„Ø§ ÙŠÙ…ÙƒÙ† ØªØ³Ø¬ÙŠÙ„ ÙÙˆØ§ØªÙŠØ± Ø¹Ù„Ù‰ ÙˆØ±Ø¯ÙŠØ© ØªÙ… Ø¥ØºÙ„Ø§Ù‚Ù‡Ø§ ÙˆØªÙ‚ÙÙŠÙ„ ØµÙ†Ø¯ÙˆÙ‚Ù‡Ø§.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: check_single_open_pos_shift(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_single_open_pos_shift() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_existing_shift_id UUID;
    v_existing_delegate_name TEXT;
    v_existing_opened_at TIMESTAMPTZ;
    v_warehouse_name TEXT;
BEGIN
    -- Ø§Ù„ÙØ­Øµ ÙŠØ¹Ù…Ù„ ÙÙ‚Ø· Ø¥Ø°Ø§ ÙƒØ§Ù†Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ù…Ø±Ø§Ø¯ Ø­ÙØ¸Ù‡Ø§ Ø­Ø§Ù„ØªÙ‡Ø§ Ù…ÙØªÙˆØ­Ø© (open)
    IF NEW.status = 'open' THEN
        -- Ø¬Ù„Ø¨ Ø§Ø³Ù… Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ Ù„Ù„ØªÙˆØ¶ÙŠØ­ ÙÙŠ Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø®Ø·Ø£
        SELECT name INTO v_warehouse_name FROM public.warehouses WHERE id = NEW.warehouse_id;

        -- 1. ÙØ­Øµ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹: Ù‡Ù„ ØªÙˆØ¬Ø¯ Ø£ÙŠ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ ÙÙŠ Ù‡Ø°Ø§ Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ØŸ
        SELECT s.id, COALESCE(p.name, 'Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø©'), s.opened_at
        INTO v_existing_shift_id, v_existing_delegate_name, v_existing_opened_at
        FROM public.pos_shifts s
        LEFT JOIN public.partners p ON p.id = s.delegate_id
        WHERE s.warehouse_id = NEW.warehouse_id
          AND s.status = 'open'
          AND (TG_OP = 'INSERT' OR s.id != NEW.id)
        LIMIT 1;

        IF v_existing_shift_id IS NOT NULL THEN
            RAISE EXCEPTION 'âš ï¸ Ø¹Ø°Ø±Ø§Ù‹ØŒ Ù„Ø§ ÙŠÙ…ÙƒÙ† ÙØªØ­ ÙˆØ±Ø¯ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø© ÙÙŠ Ù…Ø³ØªÙˆØ¯Ø¹ (%)! ØªÙˆØ¬Ø¯ Ø¨Ø§Ù„ÙØ¹Ù„ ÙˆØ±Ø¯ÙŠØ© Ù†Ø´Ø·Ø© Ù…ÙØªÙˆØ­Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ Ø¨Ø±Ù‚Ù… (#%) ÙˆØ§Ù„Ù…Ø³Ø¤ÙˆÙ„ Ø¹Ù†Ù‡Ø§: (%). ÙŠØ¬Ø¨ Ø¥Ù†Ù‡Ø§Ø¡ ÙˆØªÙ‚ÙÙŠÙ„ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ø­Ø§Ù„ÙŠØ© Ø£ÙˆÙ„Ø§Ù‹ Ù‚Ø¨Ù„ Ø¨Ø¯Ø¡ ÙˆØ±Ø¯ÙŠØ© Ø¬Ø¯ÙŠØ¯Ø©.',
                COALESCE(v_warehouse_name, 'Ø§Ù„Ù…Ø­Ø¯Ø¯'),
                SUBSTRING(v_existing_shift_id::TEXT, 1, 8),
                v_existing_delegate_name;
        END IF;

        -- 2. ÙØ­Øµ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨: Ù‡Ù„ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ù…Ø®ØªØ§Ø± Ù„Ø¯ÙŠÙ‡ Ø¨Ø§Ù„ÙØ¹Ù„ ÙˆØ±Ø¯ÙŠØ© Ù…ÙØªÙˆØ­Ø© ÙÙŠ Ù…Ø³ØªÙˆØ¯Ø¹ Ø¢Ø®Ø±ØŸ
        IF NEW.delegate_id IS NOT NULL THEN
            SELECT s.id, w.name, s.opened_at
            INTO v_existing_shift_id, v_warehouse_name, v_existing_opened_at
            FROM public.pos_shifts s
            LEFT JOIN public.warehouses w ON w.id = s.warehouse_id
            WHERE s.delegate_id = NEW.delegate_id
              AND s.status = 'open'
              AND (TG_OP = 'INSERT' OR s.id != NEW.id)
            LIMIT 1;

            IF v_existing_shift_id IS NOT NULL THEN
                RAISE EXCEPTION 'âš ï¸ Ù„Ø§ ÙŠÙ…ÙƒÙ† ÙØªØ­ Ø§Ù„ÙˆØ±Ø¯ÙŠØ©! Ù‡Ø°Ø§ Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ù„Ø¯ÙŠÙ‡ Ø¨Ø§Ù„ÙØ¹Ù„ ÙˆØ±Ø¯ÙŠØ© Ù†Ø´Ø·Ø© Ù…ÙØªÙˆØ­Ø© Ø­Ø§Ù„ÙŠØ§Ù‹ ÙÙŠ Ù…Ù†ÙØ° (%) Ø¨Ø±Ù‚Ù… (#%). ÙŠØ¬Ø¨ ØªÙ‚ÙÙŠÙ„ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ø³Ø§Ø¨Ù‚Ø© Ø£ÙˆÙ„Ø§Ù‹.',
                    COALESCE(v_warehouse_name, 'Ø¢Ø®Ø±'),
                    SUBSTRING(v_existing_shift_id::TEXT, 1, 8);
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: close_pos_shift(uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.close_pos_shift(p_shift_id uuid, p_actual_cash numeric) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    PERFORM public.rpc_close_pos_shift(jsonb_build_object(
        'shift_id', p_shift_id,
        'actual_cash', p_actual_cash
    ));
END;
$$;


--
-- Name: fn_check_financial_period_lock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_financial_period_lock() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
    DECLARE
        v_date DATE;
        v_is_locked BOOLEAN;
    BEGIN
        v_date := COALESCE(NEW.entry_date, OLD.entry_date);

        -- If this is a closing journal entry created by the closing RPC, allow it
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
    $$;


--
-- Name: get_pos_shift_details(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pos_shift_details(p_shift_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_shift RECORD;
    v_warehouse RECORD;
    v_delegate RECORD;
    v_profile RECORD;
    v_invoices jsonb := '[]'::jsonb;
    v_items_summary jsonb := '[]'::jsonb;
    v_receipts jsonb := '[]'::jsonb;
    v_result jsonb;
BEGIN
    -- 1. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ©
    SELECT * INTO v_shift
    FROM pos_shifts
    WHERE id = p_shift_id;

    IF v_shift IS NULL THEN
        RETURN NULL;
    END IF;

    -- 2. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªÙˆØ¯Ø¹ / Ù…Ù†ÙØ° Ø§Ù„Ø¨ÙŠØ¹
    SELECT id, name, type, location, phone, vehicle_id INTO v_warehouse
    FROM warehouses
    WHERE id = v_shift.warehouse_id;

    -- 3. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ù†Ø¯ÙˆØ¨ Ø§Ù„Ù…Ø³Ø¤ÙˆÙ„
    SELECT id, name, phone, code, vat_number INTO v_delegate
    FROM partners
    WHERE id = v_shift.delegate_id;

    -- 4. Ø¬Ù„Ø¨ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„ÙƒØ§Ø´ÙŠØ± / Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù…
    SELECT id, full_name, username, email INTO v_profile
    FROM profiles
    WHERE id = v_shift.user_id;

    -- 5. Ø¬Ù„Ø¨ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„ÙÙˆØ§ØªÙŠØ± Ø§Ù„ØªØ§Ø¨Ø¹Ø© Ù„Ù„ÙˆØ±Ø¯ÙŠØ©
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', inv.id,
            'invoice_number', inv.invoice_number,
            'date', inv.date,
            'created_at', inv.created_at,
            'client_name', COALESCE(inv.client_name, 'Ø¹Ù…ÙŠÙ„ Ù†Ù‚Ø¯ÙŠ'),
            'partner_id', inv.partner_id,
            'total_amount', COALESCE(inv.total_amount, 0),
            'tax_amount', COALESCE(inv.tax_amount, 0),
            'taxable_amount', COALESCE(inv.taxable_amount, 0),
            'paid_amount', COALESCE(inv.paid_amount, 0),
            'payment_method', inv.payment_method,
            'status', inv.status,
            'fleet_operation_id', inv.fleet_operation_id,
            'lines_count', jsonb_array_length(COALESCE(inv.lines_data, '[]'::jsonb))
        ) ORDER BY inv.created_at DESC
    ), '[]'::jsonb)
    INTO v_invoices
    FROM invoices inv
    WHERE inv.shift_id = p_shift_id;

    -- 6. ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø£ØµÙ†Ø§Ù Ø§Ù„Ù…Ø¨Ø§Ø¹Ø© Ø®Ù„Ø§Ù„ Ø§Ù„ÙˆØ±Ø¯ÙŠØ© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„ Ù…Ù† lines_data
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'item_id', item_grp.item_id,
            'item_name', item_grp.item_name,
            'total_quantity', item_grp.total_qty,
            'avg_price', CASE WHEN item_grp.total_qty > 0 THEN ROUND(item_grp.total_amount / item_grp.total_qty, 2) ELSE 0 END,
            'total_amount', item_grp.total_amount
        ) ORDER BY item_grp.total_qty DESC
    ), '[]'::jsonb)
    INTO v_items_summary
    FROM (
        SELECT 
            COALESCE(line->>'item_id', line->>'id') AS item_id,
            COALESCE(line->>'name', line->'inventory_items'->>'name', 'ØµÙ†Ù') AS item_name,
            SUM(COALESCE((line->>'quantity')::numeric, (line->>'qty')::numeric, 0)) AS total_qty,
            SUM(COALESCE((line->>'total')::numeric, (line->>'total_price')::numeric, 
                COALESCE((line->>'quantity')::numeric, (line->>'qty')::numeric, 0) * COALESCE((line->>'unit_price')::numeric, (line->>'price')::numeric, (line->>'selected_price')::numeric, 0))) AS total_amount
        FROM invoices inv,
             jsonb_array_elements(COALESCE(inv.lines_data, '[]'::jsonb)) AS line
        WHERE inv.shift_id = p_shift_id
        GROUP BY COALESCE(line->>'item_id', line->>'id'), COALESCE(line->>'name', line->'inventory_items'->>'name', 'ØµÙ†Ù')
    ) item_grp;

    -- 7. Ø¬Ù„Ø¨ Ø£ÙŠ Ø³Ù†Ø¯Ø§Øª Ù‚Ø¨Ø¶ Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù‡Ø°Ù‡ Ø§Ù„ÙÙˆØ§ØªÙŠØ±
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', rc.id,
            'receipt_number', rc.receipt_number,
            'amount', rc.amount,
            'payment_method', rc.payment_method,
            'date', rc.date
        ) ORDER BY rc.created_at DESC
    ), '[]'::jsonb)
    INTO v_receipts
    FROM receipt_vouchers rc
    WHERE rc.invoice_id IN (
        SELECT id FROM invoices WHERE shift_id = p_shift_id
    );

    -- 8. ØªÙƒÙˆÙŠÙ† Ù…Ù„Ù Ø§Ù„Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù…ØªÙƒØ§Ù…Ù„ Ù„Ù„ÙˆØ±Ø¯ÙŠØ©
    v_result := jsonb_build_object(
        'shift_id', v_shift.id,
        'status', v_shift.status,
        'opened_at', v_shift.opened_at,
        'closed_at', v_shift.closed_at,
        'created_at', v_shift.created_at,
        'duration_minutes', CASE 
            WHEN v_shift.closed_at IS NOT NULL THEN ROUND(EXTRACT(EPOCH FROM (v_shift.closed_at - v_shift.opened_at)) / 60)
            ELSE ROUND(EXTRACT(EPOCH FROM (NOW() - v_shift.opened_at)) / 60)
        END,
        'warehouse', jsonb_build_object(
            'id', v_warehouse.id,
            'name', COALESCE(v_warehouse.name, 'Ù…Ø³ØªÙˆØ¯Ø¹ ØºÙŠØ± Ù…Ø­Ø¯Ø¯'),
            'type', v_warehouse.type
        ),
        'delegate', jsonb_build_object(
            'id', v_delegate.id,
            'name', COALESCE(v_delegate.name, 'Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø© (Ø¨Ø¯ÙˆÙ† Ù…Ù†Ø¯ÙˆØ¨)'),
            'phone', v_delegate.phone,
            'code', v_delegate.code
        ),
        'cashier', jsonb_build_object(
            'id', v_shift.user_id,
            'name', COALESCE(v_profile.full_name, v_profile.username, v_profile.email, 'ÙƒØ§Ø´ÙŠØ± Ø§Ù„Ù†Ø¸Ø§Ù…')
        ),
        'financials', jsonb_build_object(
            'starting_cash', COALESCE(v_shift.starting_cash, 0),
            'expected_cash', COALESCE(v_shift.expected_cash, 0),
            'actual_cash', COALESCE(v_shift.actual_cash, 0),
            'shortage_overage', COALESCE(v_shift.shortage_overage, 0),
            'total_sales', COALESCE(v_shift.total_sales, 0),
            'total_cash_sales', COALESCE(v_shift.total_cash_sales, 0),
            'total_card_sales', COALESCE(v_shift.total_card_sales, 0),
            'total_credit_sales', COALESCE(v_shift.total_credit_sales, 0)
        ),
        'bottles', jsonb_build_object(
            'sold', COALESCE(v_shift.bottles_sold, 0),
            'returned', COALESCE(v_shift.bottles_returned, 0),
            'shortage', COALESCE(v_shift.bottles_shortage, 0)
        ),
        'invoices_count', jsonb_array_length(v_invoices),
        'invoices', v_invoices,
        'items_summary', v_items_summary,
        'receipts', v_receipts
    );

    RETURN v_result;
END;
$$;


--
-- Name: get_pos_shifts_list(text, uuid, uuid, timestamp with time zone, timestamp with time zone, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pos_shifts_list(p_status text DEFAULT NULL::text, p_warehouse_id uuid DEFAULT NULL::uuid, p_delegate_id uuid DEFAULT NULL::uuid, p_start_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end_date timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, status character varying, opened_at timestamp with time zone, closed_at timestamp with time zone, warehouse_id uuid, warehouse_name character varying, warehouse_type character varying, delegate_id uuid, delegate_name character varying, cashier_name text, starting_cash numeric, expected_cash numeric, actual_cash numeric, shortage_overage numeric, total_sales numeric, total_cash_sales numeric, total_card_sales numeric, total_credit_sales numeric, bottles_sold numeric, bottles_returned numeric, bottles_shortage numeric, invoices_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.status,
        s.opened_at,
        s.closed_at,
        s.warehouse_id,
        COALESCE(w.name, 'Ù…Ø³ØªÙˆØ¯Ø¹ ØºÙŠØ± Ù…Ø­Ø¯Ø¯')::VARCHAR AS warehouse_name,
        COALESCE(w.type, 'main')::VARCHAR AS warehouse_type,
        s.delegate_id,
        COALESCE(d.name, 'Ù…Ø¨ÙŠØ¹Ø§Øª Ù…Ø¨Ø§Ø´Ø±Ø©')::VARCHAR AS delegate_name,
        COALESCE(p.full_name, p.username, p.email, 'ÙƒØ§Ø´ÙŠØ±')::TEXT AS cashier_name,
        s.starting_cash,
        s.expected_cash,
        s.actual_cash,
        s.shortage_overage,
        s.total_sales,
        s.total_cash_sales,
        s.total_card_sales,
        s.total_credit_sales,
        s.bottles_sold,
        s.bottles_returned,
        s.bottles_shortage,
        (SELECT COUNT(*) FROM invoices inv WHERE inv.shift_id = s.id) AS invoices_count
    FROM pos_shifts s
    LEFT JOIN warehouses w ON w.id = s.warehouse_id
    LEFT JOIN partners d ON d.id = s.delegate_id
    LEFT JOIN profiles p ON p.id = s.user_id
    WHERE (p_status IS NULL OR s.status = p_status)
      AND (p_warehouse_id IS NULL OR s.warehouse_id = p_warehouse_id)
      AND (p_delegate_id IS NULL OR s.delegate_id = p_delegate_id)
      AND (p_start_date IS NULL OR s.opened_at >= p_start_date)
      AND (p_end_date IS NULL OR s.opened_at <= p_end_date)
    ORDER BY s.opened_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;


--
-- Name: post_expense_to_journal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.post_expense_to_journal(p_expense_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    v_expense RECORD;
    v_journal_id UUID;
    v_debit_acc UUID;
    v_credit_acc UUID;
    v_total_amount NUMERIC;
BEGIN
    -- Ù‚Ø±Ø§Ø¡Ø© Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…ØµØ±ÙˆÙ
    SELECT * INTO v_expense FROM expenses WHERE id = p_expense_id;

    IF v_expense.is_posted THEN
        RAISE EXCEPTION 'Ù‡Ø°Ø§ Ø§Ù„Ù…ØµØ±ÙˆÙ Ù…Ø±Ø­Ù‘Ù„ Ù…Ø³Ø¨Ù‚Ø§Ù‹ ÙˆÙ„Ø§ ÙŠÙ…ÙƒÙ† ØªØ±Ø­ÙŠÙ„Ù‡ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰';
    END IF;

    -- Ø­Ø³Ø§Ø¨ Ø§Ù„Ù‚ÙŠÙ…Ø© Ø§Ù„Ø¥Ø¬Ù…Ø§Ù„ÙŠØ©
    v_total_amount := COALESCE(v_expense.total_price, (v_expense.quantity * v_expense.unit_price)) + COALESCE(v_expense.vat_amount, 0);

    -- Ø§Ø³ØªØ®Ø±Ø§Ø¬ ID Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ØµØ±ÙˆÙ (Ø§Ù„Ù…Ø¯ÙŠÙ†) ÙˆØ­Ø³Ø§Ø¨ Ø§Ù„Ø¯ÙØ¹ (Ø§Ù„Ø¯Ø§Ø¦Ù†) Ù…Ù† Ø§Ù„Ø£ÙƒÙˆØ§Ø¯
    -- Ø§ÙØªØ±Ø§Ø¶ Ø£Ù† Ø§Ù„Ù‚ÙŠÙ…Ø© Ù…Ø®Ø²Ù†Ø© Ø¨ØµÙŠØºØ© "Code - Name"
    SELECT id INTO v_debit_acc FROM accounts WHERE code = split_part(v_expense.creditor_account, ' - ', 1) LIMIT 1;
    SELECT id INTO v_credit_acc FROM accounts WHERE code = split_part(v_expense.payment_account, ' - ', 1) LIMIT 1;

    -- Ø¥Ø°Ø§ Ù„Ù… ÙŠØªÙ… Ø§Ù„Ø¹Ø«ÙˆØ± Ø¹Ù„Ù‰ ×”×—Ø³Ø§Ø¨ Ø¹Ø¨Ø± Ø§Ù„ÙƒÙˆØ¯ØŒ Ù†Ø­Ø§ÙˆÙ„ Ø§Ù„Ø¨Ø­Ø« ÙÙŠ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© ÙƒØ­Ù…Ø§ÙŠØ©
    IF v_debit_acc IS NULL THEN
        SELECT id INTO v_debit_acc FROM accounts WHERE account_type = 'expenses' LIMIT 1;
    END IF;
    IF v_credit_acc IS NULL THEN
        SELECT id INTO v_credit_acc FROM accounts WHERE account_type = 'assets' LIMIT 1;
    END IF;

    -- Ø¥Ù†Ø´Ø§Ø¡ Ø±Ø£Ø³ Ø§Ù„Ù‚ÙŠØ¯ (Journal Header)
    INSERT INTO journal_headers (entry_date, description, reference_id, status, fleet_operation_id)
    VALUES (v_expense.exp_date, 'Ù‚ÙŠØ¯ Ù…ØµØ±ÙˆÙ Ø¢Ù„ÙŠ: ' || v_expense.description, v_expense.id, 'posted', v_expense.fleet_operation_id)
    RETURNING id INTO v_journal_id;

    -- Ø§Ù„Ø³Ø·Ø± Ø§Ù„Ù…Ø¯ÙŠÙ† (Ø­Ø³Ø§Ø¨ Ø§Ù„Ù…ØµØ±ÙˆÙØ§Øª)
    INSERT INTO journal_lines (header_id, account_id, debit, credit, notes, partner_id, fleet_operation_id)
    VALUES (v_journal_id, v_debit_acc, v_total_amount, 0, v_expense.description, v_expense.payee_id, v_expense.fleet_operation_id);

    -- Ø§Ù„Ø³Ø·Ø± Ø§Ù„Ø¯Ø§Ø¦Ù† (Ø­Ø³Ø§Ø¨ Ø§Ù„Ù†Ù‚Ø¯ÙŠØ©/Ø§Ù„Ø¨Ù†Ùƒ)
    INSERT INTO journal_lines (header_id, account_id, debit, credit, notes, partner_id, fleet_operation_id)
    VALUES (v_journal_id, v_credit_acc, 0, v_total_amount, 'Ø³Ø¯Ø§Ø¯ Ù…ØµØ±ÙˆÙ: ' || v_expense.description, v_expense.payee_id, v_expense.fleet_operation_id);

    -- ØªØ­Ø¯ÙŠØ« Ø­Ø§Ù„Ø© Ø§Ù„Ù…ØµØ±ÙˆÙ ÙƒÙ€ "Ù…Ø±Ø­Ù‘Ù„"
    UPDATE expenses SET is_posted = true WHERE id = p_expense_id;
END;
$$;


--
-- Name: rpc_close_financial_period(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_close_financial_period(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    $$;


--
-- Name: rpc_close_pos_shift(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_close_pos_shift(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: rpc_generate_trial_balance(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_generate_trial_balance(p_data jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    $$;


--
-- Name: rpc_get_inventory_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_get_inventory_balances() RETURNS TABLE(item_id uuid, item_name character varying, available_quantity numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.item_id,
    MAX(m.item_name) as item_name,
    SUM(CASE WHEN t.type = 'in' THEN t.quantity ELSE -t.quantity END) as available_quantity
  FROM inventory_transactions t
  LEFT JOIN material_items m ON t.item_id = m.id
  GROUP BY t.item_id;
END;
$$;


--
-- Name: rpc_process_inventory_adjustment(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_inventory_adjustment(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
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


--
-- Name: rpc_process_payment_voucher(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_payment_voucher(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_voucher_id            UUID := gen_random_uuid();
    v_voucher_number        TEXT;
    v_date                  DATE;
    v_amount                NUMERIC(15, 4);
    v_payment_method        TEXT;
    v_partner_id            UUID;
    v_partner_name          TEXT;
    v_partner_account_id    UUID;
    v_debit_account_id      UUID;
    v_credit_account_id     UUID;
    v_description           TEXT;
    v_notes                 TEXT;
    v_status                TEXT;
    v_reference_no          TEXT;
    v_related_expense_id    UUID;
    v_sub_claim_id          UUID;
    v_fleet_operation_id    UUID;
    v_shift_id              UUID;
    v_site_ref              TEXT;
    v_created_by            UUID;
    v_journal_id            UUID;
    v_is_partner_subledger  BOOLEAN := false;
BEGIN
    v_voucher_number := TRIM(COALESCE(p_data->>'voucher_number', p_data->>'payment_number', ''));
    IF v_voucher_number = '' THEN
        v_voucher_number := 'PV-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    IF EXISTS (SELECT 1 FROM public.payment_vouchers WHERE voucher_number = v_voucher_number) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'voucher_number', v_voucher_number,
            'message', 'تم تسجيل سند الصرف مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), CURRENT_DATE::text)::date;
    v_amount := COALESCE((p_data->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ سند الصرف يجب أن يكون أكبر من الصفر (القيمة الحالية: %)', v_amount;
    END IF;

    v_payment_method := COALESCE(p_data->>'payment_method', 'نقدي');
    v_description := COALESCE(p_data->>'description', 'سند صرف نقدي');
    v_notes := COALESCE(p_data->>'notes', '');
    v_status := COALESCE(p_data->>'status', 'posted');
    v_reference_no := p_data->>'reference_no';
    v_site_ref := p_data->>'site_ref';

    IF p_data->>'partner_id' IS NOT NULL AND TRIM(p_data->>'partner_id') <> '' THEN
        BEGIN
            v_partner_id := (p_data->>'partner_id')::uuid;
            SELECT name, account_id INTO v_partner_name, v_partner_account_id
            FROM public.partners WHERE id = v_partner_id;
        EXCEPTION WHEN OTHERS THEN
            v_partner_id := NULL;
        END;
    END IF;

    IF p_data->>'credit_account_id' IS NOT NULL AND TRIM(p_data->>'credit_account_id') <> '' THEN
        BEGIN
            v_credit_account_id := (p_data->>'credit_account_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_credit_account_id := NULL;
        END;
    END IF;

    IF p_data->>'debit_account_id' IS NOT NULL AND TRIM(p_data->>'debit_account_id') <> '' THEN
        BEGIN
            v_debit_account_id := (p_data->>'debit_account_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_debit_account_id := NULL;
        END;
    END IF;

    IF v_credit_account_id IS NULL THEN
        IF v_payment_method IN ('cash', 'كاش', 'نقدي', 'نقدي (كاش)') THEN
            SELECT id INTO v_credit_account_id FROM public.accounts WHERE code = '122' LIMIT 1;
        ELSE
            SELECT id INTO v_credit_account_id FROM public.accounts WHERE code = '129' LIMIT 1;
        END IF;
    END IF;

    IF v_debit_account_id IS NULL THEN
        IF v_partner_account_id IS NOT NULL THEN
            v_debit_account_id := v_partner_account_id;
        ELSE
            SELECT id INTO v_debit_account_id FROM public.accounts WHERE code = '211' LIMIT 1;
        END IF;
    END IF;

    -- Check if debit account is a partner sub-ledger (Accounts Payable 211, Custody 125, etc.)
    SELECT EXISTS (
        SELECT 1 FROM public.accounts 
        WHERE id = v_debit_account_id 
          AND (code IN ('211', '125', '128', '123') OR name ILIKE '%الموردين%' OR name ILIKE '%العملاء%' OR name ILIKE '%عهدة%')
    ) INTO v_is_partner_subledger;

    INSERT INTO public.payment_vouchers (
        id, voucher_number, date, amount, partner_id, credit_account_id, debit_account_id, payment_method, reference_no, description, notes, status, is_posted, created_by, site_ref, related_expense_id, sub_claim_id, fleet_operation_id, shift_id, created_at, updated_at
    ) VALUES (
        v_voucher_id, v_voucher_number, v_date, v_amount, v_partner_id, v_credit_account_id, v_debit_account_id, v_payment_method, v_reference_no, v_description, v_notes, v_status, TRUE, v_created_by, v_site_ref, v_related_expense_id, v_sub_claim_id, v_fleet_operation_id, v_shift_id, NOW(), NOW()
    );

    -- Double-Entry Journal Entry
    v_journal_id := gen_random_uuid();
    INSERT INTO public.journal_headers (
        id, entry_date, description, status, v_type, reference_id, fleet_operation_id, created_at
    ) VALUES (
        v_journal_id, v_date, 'سند صرف رقم: ' || v_voucher_number || ' - ' || COALESCE(v_partner_name, 'صرف نقدي') || ' - ' || v_description, 'posted', 'payment', v_voucher_id, v_fleet_operation_id, NOW()
    );

    -- Debit Side: If partner subledger -> partner_id = v_partner_id, else NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, fleet_operation_id
    ) VALUES (
        v_journal_id, v_debit_account_id, CASE WHEN v_is_partner_subledger THEN v_partner_id ELSE NULL END, v_amount, 0.00, 'إثبات سداد/صرف لسند صرف #' || v_voucher_number, v_fleet_operation_id
    );

    -- Credit Side: Cash / Bank (Company Asset) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, fleet_operation_id
    ) VALUES (
        v_journal_id, v_credit_account_id, NULL, 0.00, v_amount, 'خروج نقدية من خزانة/بنك لسند صرف #' || v_voucher_number, v_fleet_operation_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'voucher_number', v_voucher_number,
        'journal_id', v_journal_id,
        'amount', v_amount,
        'message', 'تم حفظ سند الصرف وترحيل القيد المحاسبي المتزن بنجاح'
    );
END;
$$;


--
-- Name: rpc_process_pos_sale(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_pos_sale(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: rpc_process_purchase_invoice(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_purchase_invoice(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
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
    v_payment_mode              TEXT;
    v_notes                     TEXT;
    v_lines                     JSONB;
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
    v_taxable_amount            NUMERIC(15, 4) := 0;
    v_tax_amount                NUMERIC(15, 4) := 0;
    v_total_amount              NUMERIC(15, 4) := 0;
    v_first_txn_id              UUID := NULL;
    v_txn_id                    UUID;
    v_txn_number                TEXT;
    v_created_items             JSONB := '[]'::jsonb;
    v_journal_id                UUID := NULL;
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid;
    v_acc_vat_input             UUID := '990c949c-5f32-40d7-8d36-5fe45a6c892c'::uuid;
    v_acc_suppliers_ap          UUID := '2ca6f54c-5f37-49a0-8c41-e37f94b09752'::uuid;
    v_acc_cash_box              UUID := '21b8a1db-bc9f-4cf8-b741-1efeded0963c'::uuid;
    v_acc_banks                 UUID := 'da7ee249-ee43-47da-9e8c-3d623c3f1b50'::uuid;
    v_credit_acc                UUID;
    v_credit_notes              TEXT;
BEGIN
    v_invoice_number := TRIM(COALESCE(p_data->>'invoice_number', p_data->>'invoice_no', ''));
    IF v_invoice_number = '' THEN
        v_invoice_number := 'PUR-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), CURRENT_DATE::text)::date;

    BEGIN
        v_supplier_id := (COALESCE(p_data->>'supplier_id', p_data->>'partner_id', p_data->>'vendor_id'))::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف المورد (supplier_id) غير صالح';
    END;

    IF v_supplier_id IS NULL THEN
        RAISE EXCEPTION 'المورد مطلوب لإثبات فاتورة المشتريات';
    END IF;

    SELECT name, account_id INTO v_supplier_name, v_supplier_acc_id
    FROM public.partners WHERE id = v_supplier_id;

    IF v_supplier_name IS NULL THEN
        RAISE EXCEPTION 'بيانات المورد غير مسجلة في النظام';
    END IF;

    v_warehouse_id := (p_data->>'warehouse_id')::uuid;
    IF v_warehouse_id IS NULL THEN
        v_warehouse_id := '11111111-1111-1111-1111-111111111111'::uuid;
    END IF;

    SELECT name INTO v_warehouse_name FROM public.warehouses WHERE id = v_warehouse_id;
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
    v_notes := COALESCE(p_data->>'notes', '');
    v_lines := COALESCE(p_data->'lines', p_data->'items');

    IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
        RAISE EXCEPTION 'يجب أن تحتوي فاتورة المشتريات على صنف واحد على الأقل';
    END IF;

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

    -- Items Loop
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
        v_unit_cost := COALESCE((v_line->>'unit_cost')::numeric, (v_line->>'cost_price')::numeric, 0);
        v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, 15);
        v_discount := COALESCE((v_line->>'discount_amount')::numeric, 0);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'معرّف الصنف غير صالح في السطر رقم %', v_idx;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'كمية التوريد يجب أن تكون أكبر من الصفر في السطر رقم %', v_idx;
        END IF;

        SELECT name, unit, COALESCE(cost_price, 0), COALESCE(current_quantity, 0)
        INTO v_item_name, v_item_unit, v_old_cost, v_old_qty
        FROM public.inventory_items WHERE id = v_item_id FOR UPDATE;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'الصنف برقم % غير مسجل في النظام', v_item_id;
        END IF;

        v_line_subtotal := GREATEST(0, (v_qty * v_unit_cost) - v_discount);
        v_line_tax := ROUND((v_line_subtotal * (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_subtotal + v_line_tax;

        v_taxable_amount := v_taxable_amount + v_line_subtotal;
        v_tax_amount := v_tax_amount + v_line_tax;
        v_total_amount := v_total_amount + v_line_total;

        -- WAC
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

        UPDATE public.inventory_items
        SET cost_price = v_new_wac_cost, current_quantity = current_quantity + v_qty
        WHERE id = v_item_id;

        INSERT INTO public.warehouse_inventory (
            warehouse_id, item_id, quantity, updated_at
        ) VALUES (
            v_warehouse_id, v_item_id, v_qty, NOW()
        )
        ON CONFLICT (warehouse_id, item_id)
        DO UPDATE SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = NOW();

        v_txn_number := 'PUR-' || v_invoice_number || '-' || v_idx;
        v_txn_id := gen_random_uuid();
        IF v_first_txn_id IS NULL THEN
            v_first_txn_id := v_txn_id;
        END IF;

        INSERT INTO public.inventory_transactions (
            id, transaction_number, transaction_date, type, quantity, item_id, partner_id, delegate_id, warehouse_id, unit_price, total_price, tax_amount, include_tax, notes, status, created_at
        ) VALUES (
            v_txn_id, v_txn_number, v_date, 'in', v_qty, v_item_id, v_supplier_id, v_delegate_id, v_warehouse_id, v_unit_cost, v_line_subtotal, v_line_tax, true, 'توريد مشتريات فاتورة مورد #' || v_invoice_number, 'approved', NOW()
        );

        v_created_items := v_created_items || jsonb_build_object(
            'item_id', v_item_id, 'item_name', v_item_name, 'quantity', v_qty, 'unit_cost', v_unit_cost, 'new_wac_cost', v_new_wac_cost, 'total', v_line_total
        );
    END LOOP;

    -- Double-Entry Journal Entry
    IF v_total_amount > 0 THEN
        INSERT INTO public.journal_headers (
            entry_date, description, status, v_type, reference_id
        ) VALUES (
            v_date, 'فاتورة مشتريات وتوريد مخزني #' || v_invoice_number || ' - المورد: ' || v_supplier_name, 'posted', 'purchase', v_first_txn_id
        ) RETURNING id INTO v_journal_id;

        -- Debit Line: Inventory Asset (126) -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_inventory, NULL, v_delegate_id,
            v_taxable_amount, 0,
            'إثبات توريد بضاعة للمخزون فاتورة مشتريات #' || v_invoice_number
        );

        -- Debit Line: Input VAT Recoverable (215) -> partner_id = NULL
        IF v_tax_amount > 0 THEN
            INSERT INTO public.journal_lines (
                header_id, account_id, partner_id, delegate_id, debit, credit, notes
            ) VALUES (
                v_journal_id, v_acc_vat_input, NULL, v_delegate_id,
                v_tax_amount, 0,
                'ضريبة القيمة المضافة مدخلات مشتريات فاتورة #' || v_invoice_number
            );
        END IF;

        -- Credit Line:
        -- If Accounts Payable (211) -> partner_id = v_supplier_id
        -- If Cash (122) / Bank (129) -> partner_id = NULL
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_credit_acc, CASE WHEN v_payment_mode = 'credit' THEN v_supplier_id ELSE NULL END, v_delegate_id,
            0, v_total_amount,
            v_credit_notes
        );

        UPDATE public.inventory_transactions
        SET journal_id = v_journal_id
        WHERE transaction_number LIKE 'PUR-' || v_invoice_number || '-%';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_number', v_invoice_number,
        'date', v_date,
        'journal_id', v_journal_id,
        'supplier_id', v_supplier_id,
        'supplier_name', v_supplier_name,
        'payment_mode', v_payment_mode,
        'taxable_amount', v_taxable_amount,
        'tax_amount', v_tax_amount,
        'total_amount', v_total_amount,
        'message', 'تم إثبات فاتورة المشتريات والتوريد المخزني واحتساب متوسط التكلفة وترحيل القيد بنجاح'
    );
END;
$$;


--
-- Name: rpc_process_receipt_voucher(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_receipt_voucher(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_voucher_id            UUID := gen_random_uuid();
    v_receipt_number        TEXT;
    v_date                  DATE;
    v_amount                NUMERIC(15, 4);
    v_payment_method        TEXT;
    v_notes                 TEXT;
    v_partner_id            UUID;
    v_partner_name          TEXT;
    v_partner_custom_acc    UUID;
    v_safe_bank_acc_id      UUID;
    v_partner_acc_id        UUID;
    v_status                TEXT;
    v_reference_number      TEXT;
    v_attachment_url        TEXT;
    v_job_order_id          UUID;
    v_delegate_id           UUID;
    v_shift_id              UUID;
    v_fleet_operation_id    UUID;
    v_invoices_settled      JSONB;
    v_settle_item           JSONB;
    v_alloc_inv_id          UUID;
    v_alloc_amount          NUMERIC(15, 4);
    v_total_allocated       NUMERIC(15, 4) := 0;
    v_inv_id                UUID;
    v_inv_number            TEXT;
    v_inv_total             NUMERIC(15, 4);
    v_inv_paid              NUMERIC(15, 4);
    v_new_paid              NUMERIC(15, 4);
    v_inv_new_status        TEXT;
    v_primary_invoice_id    UUID := NULL;
    v_allocated_records     JSONB := '[]'::jsonb;
    v_journal_id            UUID;
BEGIN
    v_receipt_number := TRIM(COALESCE(p_data->>'receipt_number', p_data->>'voucher_number', ''));
    IF v_receipt_number = '' THEN
        v_receipt_number := 'RV-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    IF EXISTS (SELECT 1 FROM public.receipt_vouchers WHERE receipt_number = v_receipt_number) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'receipt_number', v_receipt_number,
            'message', 'تم تسجيل سند القبض مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), CURRENT_DATE::text)::date;
    v_amount := COALESCE((p_data->>'amount')::numeric, 0);
    IF v_amount <= 0 THEN
        RAISE EXCEPTION 'مبلغ سند القبض يجب أن يكون أكبر من الصفر (القيمة الحالية: %)', v_amount;
    END IF;

    v_payment_method := COALESCE(p_data->>'payment_method', 'نقدي');
    v_notes := COALESCE(p_data->>'notes', '');
    v_status := COALESCE(p_data->>'status', 'posted');
    v_reference_number := p_data->>'reference_number';
    v_attachment_url := p_data->>'attachment_url';

    IF p_data->>'partner_id' IS NOT NULL AND TRIM(p_data->>'partner_id') <> '' THEN
        BEGIN
            v_partner_id := (p_data->>'partner_id')::uuid;
            SELECT name, account_id INTO v_partner_name, v_partner_custom_acc 
            FROM public.partners WHERE id = v_partner_id;
        EXCEPTION WHEN OTHERS THEN
            v_partner_id := NULL;
        END;
    END IF;

    IF p_data->>'safe_bank_acc_id' IS NOT NULL AND TRIM(p_data->>'safe_bank_acc_id') <> '' THEN
        BEGIN
            v_safe_bank_acc_id := (p_data->>'safe_bank_acc_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_safe_bank_acc_id := NULL;
        END;
    END IF;

    IF p_data->>'delegate_id' IS NOT NULL AND TRIM(p_data->>'delegate_id') <> '' THEN
        BEGIN
            v_delegate_id := (p_data->>'delegate_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_delegate_id := NULL;
        END;
    END IF;

    IF p_data->>'shift_id' IS NOT NULL AND TRIM(p_data->>'shift_id') <> '' THEN
        BEGIN
            v_shift_id := (p_data->>'shift_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_shift_id := NULL;
        END;
    END IF;

    IF p_data->>'fleet_operation_id' IS NOT NULL AND TRIM(p_data->>'fleet_operation_id') <> '' THEN
        BEGIN
            v_fleet_operation_id := (p_data->>'fleet_operation_id')::uuid;
        EXCEPTION WHEN OTHERS THEN
            v_fleet_operation_id := NULL;
        END;
    END IF;

    -- Invoices allocation
    v_invoices_settled := p_data->'invoices_settled';
    IF v_invoices_settled IS NOT NULL AND jsonb_array_length(v_invoices_settled) > 0 THEN
        FOR v_settle_item IN SELECT * FROM jsonb_array_elements(v_invoices_settled)
        LOOP
            v_alloc_inv_id := (v_settle_item->>'invoice_id')::uuid;
            v_alloc_amount := COALESCE((v_settle_item->>'allocated_amount')::numeric, 0);

            IF v_alloc_inv_id IS NOT NULL AND v_alloc_amount > 0 THEN
                SELECT id, invoice_number, total_amount, COALESCE(paid_amount, 0)
                INTO v_inv_id, v_inv_number, v_inv_total, v_inv_paid
                FROM public.invoices WHERE id = v_alloc_inv_id FOR UPDATE;

                IF FOUND THEN
                    v_new_paid := v_inv_paid + v_alloc_amount;
                    v_inv_new_status := CASE WHEN v_new_paid >= v_inv_total THEN 'paid' ELSE 'partial' END;

                    UPDATE public.invoices
                    SET paid_amount = v_new_paid, status = v_inv_new_status, payment_status = v_inv_new_status
                    WHERE id = v_alloc_inv_id;

                    IF v_primary_invoice_id IS NULL THEN
                        v_primary_invoice_id := v_alloc_inv_id;
                    END IF;

                    v_total_allocated := v_total_allocated + v_alloc_amount;
                    v_allocated_records := v_allocated_records || jsonb_build_object(
                        'invoice_id', v_alloc_inv_id, 'invoice_number', v_inv_number, 'allocated_amount', v_alloc_amount, 'status', v_inv_new_status
                    );
                END IF;
            END IF;
        END LOOP;
    END IF;

    -- Insert receipt voucher
    INSERT INTO public.receipt_vouchers (
        id, receipt_number, date, amount, payment_method, notes, partner_id, invoice_id, status, safe_bank_acc_id, partner_acc_id, reference_number, attachment_url, job_order_id, delegate_id, shift_id, fleet_operation_id, created_at, updated_at
    ) VALUES (
        v_voucher_id, v_receipt_number, v_date, v_amount, v_payment_method, v_notes, v_partner_id, v_primary_invoice_id, v_status, v_safe_bank_acc_id, v_partner_acc_id, v_reference_number, v_attachment_url, v_job_order_id, v_delegate_id, v_shift_id, v_fleet_operation_id, NOW(), NOW()
    );

    -- Accounts Resolution
    IF v_safe_bank_acc_id IS NULL THEN
        IF v_payment_method IN ('cash', 'كاش', 'نقدي', 'نقدي (كاش)') THEN
            SELECT id INTO v_safe_bank_acc_id FROM public.accounts WHERE code = '122' LIMIT 1;
        ELSE
            SELECT id INTO v_safe_bank_acc_id FROM public.accounts WHERE code = '129' LIMIT 1;
        END IF;
    END IF;

    IF v_partner_acc_id IS NULL THEN
        IF v_partner_custom_acc IS NOT NULL THEN
            v_partner_acc_id := v_partner_custom_acc;
        ELSIF v_partner_id IS NULL AND v_delegate_id IS NOT NULL THEN
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code = '125' LIMIT 1;
        ELSE
            SELECT id INTO v_partner_acc_id FROM public.accounts WHERE code = '123' LIMIT 1;
        END IF;
    END IF;

    v_journal_id := gen_random_uuid();
    INSERT INTO public.journal_headers (
        id, entry_date, description, status, v_type, reference_id, fleet_operation_id, created_at
    ) VALUES (
        v_journal_id, v_date, 'سند قبض رقم: ' || v_receipt_number || ' - ' || COALESCE(v_partner_name, 'تحصيل نقدي'), 'posted', 'receipt', v_voucher_id, v_fleet_operation_id, NOW()
    );

    -- Debit side: Cash/Bank (Company Asset) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, delegate_id, fleet_operation_id
    ) VALUES (
        v_journal_id, v_safe_bank_acc_id, NULL, v_amount, 0.00, 'توريد خزانة/بنك لسند قبض #' || v_receipt_number, v_delegate_id, v_fleet_operation_id
    );

    -- Credit side: Accounts Receivable (123 / Sub-Ledger) -> partner_id = v_partner_id
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, debit, credit, notes, delegate_id, fleet_operation_id
    ) VALUES (
        v_journal_id, v_partner_acc_id, v_partner_id, 0.00, v_amount, 'سداد وتخفيض ذمة لسند قبض #' || v_receipt_number, v_delegate_id, v_fleet_operation_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'voucher_id', v_voucher_id,
        'receipt_number', v_receipt_number,
        'journal_id', v_journal_id,
        'amount', v_amount,
        'allocated_invoices', v_allocated_records,
        'message', 'تم حفظ سند القبض وترحيل القيد المحاسبي المتزن بنجاح'
    );
END;
$$;


--
-- Name: rpc_process_sales_invoice(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_sales_invoice(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_invoice_number            TEXT;
    v_date                      DATE;
    v_partner_id                UUID;
    v_partner_name              TEXT;
    v_credit_limit              NUMERIC(15, 2);
    v_warehouse_id              UUID;
    v_warehouse_name            TEXT;
    v_delegate_id               UUID;
    v_fleet_operation_id        UUID;
    v_payment_method            TEXT;
    v_payment_mode              TEXT;
    v_paid_amount               NUMERIC(15, 4) := 0;
    v_status                    TEXT;
    v_payment_status            TEXT;
    v_due_date                  DATE;
    v_due_in_days               INT;
    v_notes                     TEXT;
    v_lines                     JSONB;
    v_line                      JSONB;
    v_idx                       INT := 0;
    v_item_id                   UUID;
    v_item_name                 TEXT;
    v_item_unit                 TEXT;
    v_item_cost                 NUMERIC(15, 4);
    v_stock_qty                 NUMERIC(15, 4);
    v_qty                       NUMERIC(15, 4);
    v_unit_price                NUMERIC(15, 4);
    v_discount                  NUMERIC(15, 4);
    v_tax_rate                  NUMERIC(15, 4);
    v_line_subtotal             NUMERIC(15, 4);
    v_line_tax                  NUMERIC(15, 4);
    v_line_total                NUMERIC(15, 4);
    v_taxable_amount            NUMERIC(15, 4) := 0;
    v_tax_amount                NUMERIC(15, 4) := 0;
    v_total_amount              NUMERIC(15, 4) := 0;
    v_total_cogs                NUMERIC(15, 4) := 0;
    v_current_balance           NUMERIC(15, 4) := 0;
    v_invoice_id                UUID;
    v_journal_id                UUID;
    v_acc_customers_ar          UUID := '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid;
    v_acc_cash_box              UUID := '21b8a1db-bc9f-4cf8-b741-1efeded0963c'::uuid;
    v_acc_banks                 UUID := 'da7ee249-ee43-47da-9e8c-3d623c3f1b50'::uuid;
    v_acc_sales_revenue         UUID := '6667f91a-9478-49ab-9721-521ee09381fa'::uuid;
    v_acc_vat_payable           UUID := '990c949c-5f32-40d7-8d36-5fe45a6c892c'::uuid;
    v_acc_cogs                  UUID := 'e03c1430-0275-424f-8a93-eae8bc8990bf'::uuid;
    v_acc_inventory             UUID := 'c5efa035-c8d5-4d13-bf33-7c7cd854f393'::uuid;
    v_debit_acc                 UUID;
    v_safe_bank_acc_id          UUID;
    v_enriched_lines            JSONB := '[]'::jsonb;
BEGIN
    v_invoice_number := TRIM(COALESCE(p_data->>'invoice_number', p_data->>'invoice_no', ''));
    IF v_invoice_number = '' THEN
        v_invoice_number := 'INV-' || to_char(NOW(), 'YYYYMMDD-HH24MISS');
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices WHERE invoice_number = v_invoice_number) THEN
        RETURN jsonb_build_object(
            'success', true,
            'duplicate_prevented', true,
            'invoice_number', v_invoice_number,
            'message', 'تم تسجيل الفاتورة مسبقاً (تم منع التكرار بنجاح)'
        );
    END IF;

    v_date := COALESCE(NULLIF(p_data->>'date', ''), CURRENT_DATE::text)::date;

    BEGIN
        v_partner_id := (COALESCE(p_data->>'partner_id', p_data->>'customer_id'))::uuid;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'معرّف العميل (partner_id) غير صالح';
    END;

    IF v_partner_id IS NULL THEN
        RAISE EXCEPTION 'العميل مطلوب لإصدار فاتورة المبيعات';
    END IF;

    SELECT name, credit_limit INTO v_partner_name, v_credit_limit
    FROM public.partners WHERE id = v_partner_id;

    IF v_partner_name IS NULL THEN
        RAISE EXCEPTION 'بيانات العميل غير مسجلة في النظام';
    END IF;

    v_warehouse_id := (p_data->>'warehouse_id')::uuid;
    IF v_warehouse_id IS NULL THEN
        v_warehouse_id := '11111111-1111-1111-1111-111111111111'::uuid;
    END IF;

    SELECT name INTO v_warehouse_name FROM public.warehouses WHERE id = v_warehouse_id;
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
    v_notes := COALESCE(p_data->>'notes', '');
    v_due_in_days := COALESCE((p_data->>'due_in_days')::int, 30);
    v_due_date := COALESCE(NULLIF(p_data->>'due_date', '')::date, (v_date + v_due_in_days));

    v_lines := COALESCE(p_data->'lines', p_data->'items');
    IF v_lines IS NULL OR jsonb_array_length(v_lines) = 0 THEN
        RAISE EXCEPTION 'يجب أن تحتوي الفاتورة على صنف واحد على الأقل';
    END IF;

    -- Items Loop
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := COALESCE((v_line->>'quantity')::numeric, 0);
        v_unit_price := COALESCE((v_line->>'unit_price')::numeric, 0);
        v_discount := COALESCE((v_line->>'discount_amount')::numeric, 0);
        v_tax_rate := COALESCE((v_line->>'tax_rate')::numeric, 15);

        IF v_item_id IS NULL THEN
            RAISE EXCEPTION 'معرّف الصنف غير صالح في السطر رقم %', v_idx;
        END IF;

        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'الكمية يجب أن تكون أكبر من الصفر في السطر رقم %', v_idx;
        END IF;

        IF v_unit_price < 0 THEN
            RAISE EXCEPTION 'سعر الصنف لا يمكن أن يكون سالباً في السطر رقم %', v_idx;
        END IF;

        SELECT name, unit, COALESCE(cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items
        WHERE id = v_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'الصنف برقم % غير مسجل في النظام', v_item_id;
        END IF;

        v_line_subtotal := GREATEST(0, (v_qty * v_unit_price) - v_discount);
        v_line_tax := ROUND((v_line_subtotal * (v_tax_rate / 100.0)), 2);
        v_line_total := v_line_subtotal + v_line_tax;

        v_taxable_amount := v_taxable_amount + v_line_subtotal;
        v_tax_amount := v_tax_amount + v_line_tax;
        v_total_amount := v_total_amount + v_line_total;
        v_total_cogs := v_total_cogs + (v_qty * v_item_cost);

        SELECT COALESCE(quantity, 0) INTO v_stock_qty
        FROM public.warehouse_inventory
        WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id
        FOR UPDATE;

        IF NOT FOUND OR v_stock_qty < v_qty THEN
            RAISE EXCEPTION 'رصيد الصنف "%" غير كافٍ في مستودع البيع (%). المتاح: % %، المطلوب: % %',
                v_item_name, v_warehouse_name, COALESCE(v_stock_qty, 0), COALESCE(v_item_unit, 'وحدة'), v_qty, COALESCE(v_item_unit, 'وحدة');
        END IF;

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

    -- Payment Mode
    IF v_payment_method ILIKE '%نقدي%' OR v_payment_method ILIKE '%كاش%' OR v_payment_method = 'cash' THEN
        v_payment_mode := 'cash';
        v_debit_acc := COALESCE(v_safe_bank_acc_id, v_acc_cash_box);
    ELSIF v_payment_method ILIKE '%بنك%' OR v_payment_method ILIKE '%تحويل%' OR v_payment_method ILIKE '%شبكة%' OR v_payment_method = 'bank' THEN
        v_payment_mode := 'bank';
        v_debit_acc := COALESCE(v_safe_bank_acc_id, v_acc_banks);
    ELSE
        v_payment_mode := 'credit';
        v_debit_acc := v_acc_customers_ar;
    END IF;

    -- Credit limit check
    IF v_payment_mode = 'credit' AND v_credit_limit IS NOT NULL AND v_credit_limit > 0 THEN
        SELECT COALESCE(SUM(total_amount - paid_amount), 0)
        INTO v_current_balance
        FROM public.invoices
        WHERE partner_id = v_partner_id
          AND status NOT IN ('paid', 'cancelled', 'ملغاة');

        IF (v_current_balance + v_total_amount) > v_credit_limit THEN
            RAISE EXCEPTION 'تم تجاوز السقف الائتماني للعميل "%". الرصيد القائم: % ر.س، قيمة الفاتورة: % ر.س، السقف الائتماني: % ر.س',
                v_partner_name, v_current_balance, v_total_amount, v_credit_limit;
        END IF;
    END IF;

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
            v_status := 'pending';
            v_payment_status := 'unpaid';
        END IF;
    END IF;

    v_invoice_id := gen_random_uuid();
    INSERT INTO public.invoices (
        id, invoice_number, date, partner_id, client_name, notes, taxable_amount, tax_amount, total_amount, paid_amount, status, payment_status, payment_method, warehouse_id, delegate_id, fleet_operation_id, lines_data, debit_account_id, revenue_account_id, tax_account_id, due_date, due_in_days, skip_zatca, created_at
    ) VALUES (
        v_invoice_id, v_invoice_number, v_date, v_partner_id, v_partner_name, v_notes, v_taxable_amount, v_tax_amount, v_total_amount, v_paid_amount, v_status, v_payment_status, v_payment_method, v_warehouse_id, v_delegate_id, v_fleet_operation_id, v_enriched_lines, v_debit_acc, v_acc_sales_revenue, v_acc_vat_payable, v_due_date, v_due_in_days, COALESCE((p_data->>'skip_zatca')::boolean, false), NOW()
    );

    -- Stock deduction
    v_idx := 0;
    FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
        v_idx := v_idx + 1;
        v_item_id := (v_line->>'item_id')::uuid;
        v_qty := (v_line->>'quantity')::numeric;

        SELECT name, unit, COALESCE(cost_price, default_price, 0)
        INTO v_item_name, v_item_unit, v_item_cost
        FROM public.inventory_items WHERE id = v_item_id;

        UPDATE public.warehouse_inventory
        SET quantity = quantity - v_qty, updated_at = NOW()
        WHERE warehouse_id = v_warehouse_id AND item_id = v_item_id;

        UPDATE public.inventory_items
        SET current_quantity = GREATEST(0, COALESCE(current_quantity, 0) - v_qty)
        WHERE id = v_item_id;

        INSERT INTO public.inventory_transactions (
            id, transaction_number, transaction_date, type, quantity, item_id, partner_id, delegate_id, fleet_operation_id, warehouse_id, invoice_id, unit_price, total_price, notes, status, created_at
        ) VALUES (
            gen_random_uuid(), 'SAL-' || v_invoice_number || '-' || v_idx, v_date, 'sales_deduction', v_qty, v_item_id, v_partner_id, v_delegate_id, v_fleet_operation_id, v_warehouse_id, v_invoice_id, v_item_cost, v_qty * v_item_cost, 'صرف بضاعة مباعة بفاتورة #' || v_invoice_number, 'approved', NOW()
        );
    END LOOP;

    -- Double-Entry Journal Entry
    INSERT INTO public.journal_headers (
        entry_date, description, status, v_type, reference_id, fleet_operation_id
    ) VALUES (
        v_date, 'فاتورة مبيعات #' || v_invoice_number || ' - العميل: ' || v_partner_name, 'posted', 'invoice', v_invoice_id, v_fleet_operation_id
    ) RETURNING id INTO v_journal_id;

    -- Debit Lines:
    -- Only Accounts Receivable (123) has partner_id!
    -- Cash / Bank accounts have partner_id = NULL!
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

    -- Credit: Sales Revenue (41) -> partner_id = NULL
    INSERT INTO public.journal_lines (
        header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
    ) VALUES (
        v_journal_id, v_acc_sales_revenue, NULL, v_delegate_id, v_fleet_operation_id,
        0, v_taxable_amount, 'إيراد مبيعات فاتورة #' || v_invoice_number
    );

    -- Credit: VAT Payable (215) -> partner_id = NULL
    IF v_tax_amount > 0 THEN
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_vat_payable, NULL, v_delegate_id, v_fleet_operation_id,
            0, v_tax_amount, 'ضريبة القيمة المضافة 15% فاتورة #' || v_invoice_number
        );
    END IF;

    -- COGS & Inventory -> partner_id = NULL
    IF v_total_cogs > 0 THEN
        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_cogs, NULL, v_delegate_id, v_fleet_operation_id,
            v_total_cogs, 0, 'تكلفة البضاعة المباعة فاتورة #' || v_invoice_number
        );

        INSERT INTO public.journal_lines (
            header_id, account_id, partner_id, delegate_id, fleet_operation_id, debit, credit, notes
        ) VALUES (
            v_journal_id, v_acc_inventory, NULL, v_delegate_id, v_fleet_operation_id,
            0, v_total_cogs, 'صرف مخزون بضاعة مباعة فاتورة #' || v_invoice_number
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'journal_id', v_journal_id,
        'partner_id', v_partner_id,
        'partner_name', v_partner_name,
        'payment_mode', v_payment_mode,
        'taxable_amount', v_taxable_amount,
        'tax_amount', v_tax_amount,
        'total_amount', v_total_amount,
        'cogs', v_total_cogs,
        'message', 'تم إصدار الفاتورة واعتماد قيد اليومية والخصم المخزني بنجاح'
    );
END;
$$;


--
-- Name: rpc_process_stock_transfer(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_process_stock_transfer(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    -- We first loop to lock and validate all lines to guarantee atomic consistency
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
$$;


--
-- Name: rpc_settle_fleet_trip(jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rpc_settle_fleet_trip(p_data jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
$$;


--
-- Name: save_expense_with_settlement(uuid, date, text, text, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, text, text, jsonb, boolean, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_expense_with_settlement(p_id uuid, p_exp_date date, p_main_category text, p_sub_contractor text, p_site_ref text, p_creditor_account text, p_description text, p_payee_name text, p_payment_method text, p_payment_account text, p_employee_name text, p_quantity numeric, p_unit_price numeric, p_vat_amount numeric, p_discount_amount numeric, p_discount_account text, p_notes text, p_invoice_image text, p_lines_data jsonb, p_is_auto_distributed boolean, p_payee_id uuid DEFAULT NULL::uuid, p_job_order_id uuid DEFAULT NULL::uuid, p_is_deducted_from_contractor boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
    generated_expense_number text;
    first_inserted_id uuid;
    line_record jsonb;
    current_line_qty numeric;
    current_line_price numeric;
    current_line_vat numeric;
    current_line_disc numeric;
    current_line_desc text;
    lines_array jsonb;
BEGIN
    -- ØªÙˆÙ„ÙŠØ¯ Ø±Ù‚Ù… Ø§Ù„Ø¥Ø°Ù† Ø¥Ø°Ø§ ÙƒØ§Ù† Ø¹Ù…Ù„ÙŠØ© Ø¥Ø¯Ø®Ø§Ù„ Ø¬Ø¯ÙŠØ¯Ø©
    IF p_id IS NULL THEN
        -- Ø§Ù„ØµÙŠØºØ©: EXP-YYYYMMDD-Random
        generated_expense_number := 'EXP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));
    ELSE
        -- ÙÙŠ Ø­Ø§Ù„Ø© Ø§Ù„ØªØ¹Ø¯ÙŠÙ„ØŒ Ù†Ø­ØªÙØ¸ Ø¨Ø§Ù„Ø±Ù‚Ù… Ø§Ù„Ù‚Ø¯ÙŠÙ… ÙˆÙ†Ø­Ø°Ù Ø§Ù„Ø£Ø³Ø·Ø± Ø§Ù„Ù‚Ø¯ÙŠÙ…Ø© Ø§Ù„Ù…Ø±ØªØ¨Ø·Ø© Ø¨Ù‡ Ù„Ø¥Ø¹Ø§Ø¯Ø© Ø¥Ø¯Ø®Ø§Ù„Ù‡Ø§
        SELECT expense_number INTO generated_expense_number FROM public.expenses WHERE id = p_id LIMIT 1;
        
        IF generated_expense_number IS NOT NULL THEN
            DELETE FROM public.expenses WHERE expense_number = generated_expense_number;
        ELSE
            -- Ù„Ùˆ Ù„Ø³Ø¨Ø¨ Ù…Ø§ Ù…ÙÙŠØ´ Ø±Ù‚Ù…ØŒ Ù†Ø¹Ù…Ù„Ù‡ Ø±Ù‚Ù… Ø¬Ø¯ÙŠØ¯
            generated_expense_number := 'EXP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 4));
        END IF;
    END IF;

    -- ØªØ¬Ù‡ÙŠØ² Ù…ØµÙÙˆÙØ© Ø§Ù„Ø¨Ù†ÙˆØ¯
    IF p_lines_data IS NULL OR jsonb_array_length(p_lines_data) = 0 THEN
        -- Ø¥Ø°Ø§ Ù„Ù… ÙŠÙƒÙ† Ù‡Ù†Ø§Ùƒ Ø¨Ù†ÙˆØ¯ Ø¥Ø¶Ø§ÙÙŠØ©ØŒ Ù†Ø¹ØªØ¨Ø± Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø£Ø³Ø§Ø³ÙŠØ© ÙƒØ¨Ù†Ø¯ ÙˆØ­ÙŠØ¯
        lines_array := jsonb_build_array(
            jsonb_build_object(
                'description', p_description,
                'quantity', p_quantity,
                'unit_price', p_unit_price,
                'vat_amount', p_vat_amount,
                'discount_amount', p_discount_amount
            )
        );
    ELSE
        lines_array := p_lines_data;
    END IF;

    -- Ø§Ù„Ø¯ÙˆØ±Ø§Ù† Ø¹Ù„Ù‰ Ø§Ù„Ø¨Ù†ÙˆØ¯ ÙˆØ¥Ø¯Ø®Ø§Ù„Ù‡Ø§ ÙƒØ³Ø·ÙˆØ± Ù…Ù†ÙØµÙ„Ø© ÙÙŠ Ø§Ù„Ø¯Ø§ØªØ§Ø¨ÙŠØ²
    FOR line_record IN SELECT * FROM jsonb_array_elements(lines_array)
    LOOP
        current_line_desc := COALESCE(line_record->>'description', line_record->>'item_name', line_record->>'work_item', p_description);
        current_line_qty := COALESCE((line_record->>'quantity')::numeric, 1);
        current_line_price := COALESCE((line_record->>'unit_price')::numeric, 0);
        current_line_vat := COALESCE((line_record->>'vat_amount')::numeric, 0);
        current_line_disc := COALESCE((line_record->>'discount_amount')::numeric, 0);

        INSERT INTO public.expenses (
            expense_number,
            exp_date,
            main_category,
            sub_contractor,
            site_ref,
            creditor_account,
            description,
            payee_name,
            payment_method,
            payment_account,
            employee_name,
            quantity,
            unit_price,
            vat_amount,
            discount_amount,
            discount_account,
            notes,
            invoice_image,
            is_auto_distributed,
            payee_id,
            job_order_id,
            is_deducted_from_contractor,
            lines_data -- Ù†Ø­ØªÙØ¸ Ø¨Ù‡Ø§ ÙØ§Ø±ØºØ© Ù„Ø£Ù†Ù†Ø§ ÙØµÙ„Ù†Ø§ Ø§Ù„Ø¨Ù†ÙˆØ¯
        ) VALUES (
            generated_expense_number,
            p_exp_date,
            p_main_category,
            p_sub_contractor,
            p_site_ref,
            p_creditor_account,
            current_line_desc,
            p_payee_name,
            p_payment_method,
            p_payment_account,
            p_employee_name,
            current_line_qty,
            current_line_price,
            current_line_vat,
            current_line_disc,
            p_discount_account,
            p_notes,
            p_invoice_image,
            p_is_auto_distributed,
            p_payee_id,
            p_job_order_id,
            p_is_deducted_from_contractor,
            '[]'::jsonb
        ) RETURNING id INTO first_inserted_id;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true, 
        'expense_number', generated_expense_number,
        'id', first_inserted_id 
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


--
-- Name: unapprove_inventory_transaction(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unapprove_inventory_transaction(p_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_txn RECORD;
    v_qty numeric;
    v_target_warehouse_id uuid;
BEGIN
    SELECT * INTO v_txn FROM public.inventory_transactions WHERE id = p_id;
    
    IF v_txn.id IS NULL THEN
        RAISE EXCEPTION 'Ø§Ù„Ø­Ø±ÙƒØ© ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯Ø©';
    END IF;

    IF v_txn.status != 'approved' THEN
        RAISE EXCEPTION 'Ø§Ù„Ø­Ø±ÙƒØ© ØºÙŠØ± Ù…Ø¹ØªÙ…Ø¯Ø© Ù…Ø³Ø¨Ù‚Ø§Ù‹';
    END IF;

    v_qty := COALESCE(v_txn.quantity, 0);
    v_target_warehouse_id := COALESCE(v_txn.warehouse_id, '11111111-1111-1111-1111-111111111111'::uuid);

    -- Reverse inventory quantities
    IF v_txn.fleet_operation_id IS NOT NULL AND v_txn.vehicle_id IS NOT NULL THEN
        PERFORM public.update_inventory_quantity(v_txn.item_id, v_qty, v_target_warehouse_id);
        PERFORM public.update_inventory_quantity(v_txn.item_id, -v_qty, v_txn.vehicle_id);
    ELSE
        IF v_txn.type IN ('in', 'transfer_in', 'empty_return') THEN
            PERFORM public.update_inventory_quantity(v_txn.item_id, -v_qty, v_target_warehouse_id);
        ELSE
            PERFORM public.update_inventory_quantity(v_txn.item_id, v_qty, v_target_warehouse_id);
        END IF;
    END IF;

    -- Delete associated journal entries
    DELETE FROM public.journal_headers WHERE reference_id = p_id AND v_type = 'inventory';

    -- Reset status
    UPDATE public.inventory_transactions SET status = 'pending' WHERE id = p_id;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    account_type character varying NOT NULL,
    parent_id uuid,
    is_transactional boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cash_flows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_flows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    flow_type character varying NOT NULL,
    amount numeric NOT NULL,
    category character varying NOT NULL,
    sub_category text,
    payment_method character varying DEFAULT 'نقدي'::character varying,
    reference_number character varying,
    description text,
    account_id uuid,
    partner_id uuid,
    is_reconciled boolean DEFAULT false,
    reconciled_date date,
    created_by uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    source_id uuid,
    source_type character varying,
    CONSTRAINT cash_flows_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT cash_flows_flow_type_check CHECK (((flow_type)::text = ANY (ARRAY[('inflow'::character varying)::text, ('outflow'::character varying)::text])))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    exp_date date DEFAULT CURRENT_DATE NOT NULL,
    sub_contractor text,
    payee_id uuid,
    creditor_account text,
    description text NOT NULL,
    quantity numeric DEFAULT 1 NOT NULL,
    unit_price numeric NOT NULL,
    vat_amount numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    discount_account character varying,
    paid_amount numeric DEFAULT 0 NOT NULL,
    payment_method text DEFAULT 'كاش'::text,
    payment_account text DEFAULT '125 - عُهد الموظفين والمواقع'::text,
    notes text,
    is_posted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    site_ref text,
    payee_name text,
    employee_name character varying,
    invoice_image text,
    lines_data jsonb DEFAULT '[]'::jsonb,
    is_deducted_in_claim boolean DEFAULT false,
    claim_id uuid,
    is_auto_distributed boolean DEFAULT false,
    total_price numeric DEFAULT 0,
    main_category text,
    is_deleted boolean DEFAULT false,
    job_order_id uuid,
    is_deducted_from_contractor boolean DEFAULT false,
    created_by uuid,
    expense_number text,
    fleet_operation_id uuid,
    shift_id uuid,
    CONSTRAINT expenses_payment_method_check CHECK ((payment_method = ANY (ARRAY['كاش'::text, 'تحويل بنكي'::text, 'شيك'::text, 'عُهدة'::text, 'آجل'::text, 'تسوية داخلية'::text]))),
    CONSTRAINT expenses_quantity_check CHECK ((quantity > (0)::numeric)),
    CONSTRAINT expenses_unit_price_check CHECK ((unit_price >= (0)::numeric)),
    CONSTRAINT expenses_vat_amount_check CHECK ((vat_amount >= (0)::numeric))
);


--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_name text NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    fiscal_year integer NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    closing_journal_id uuid,
    net_profit numeric(15,4) DEFAULT 0,
    total_revenue numeric(15,4) DEFAULT 0,
    total_expenses numeric(15,4) DEFAULT 0,
    vat_output numeric(15,4) DEFAULT 0,
    vat_input numeric(15,4) DEFAULT 0,
    vat_net numeric(15,4) DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT financial_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'locked'::text])))
);


--
-- Name: financial_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plan_year integer NOT NULL,
    plan_month integer NOT NULL,
    category text NOT NULL,
    item_name text NOT NULL,
    planned_amount numeric DEFAULT 0,
    actual_amount numeric DEFAULT 0,
    notes text
);


--
-- Name: fleet_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_number text NOT NULL,
    operation_date date DEFAULT CURRENT_DATE NOT NULL,
    vehicle_id uuid NOT NULL,
    driver_id uuid NOT NULL,
    status text DEFAULT 'مفتوح'::text,
    total_sales numeric DEFAULT 0,
    total_expenses numeric DEFAULT 0,
    inventory_cost numeric DEFAULT 0,
    net_profit numeric DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    total_cost numeric DEFAULT 0,
    warehouse_id uuid,
    description text,
    start_km numeric DEFAULT 0,
    end_km numeric DEFAULT 0
);


--
-- Name: fleet_vehicles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fleet_vehicles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plate_number text NOT NULL,
    vehicle_model text,
    driver_id uuid,
    status text DEFAULT 'متاح'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: inventory_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    unit character varying DEFAULT 'حبة'::character varying NOT NULL,
    current_quantity numeric DEFAULT 0,
    reorder_level numeric DEFAULT 5,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    code character varying,
    default_price numeric DEFAULT 0,
    suggested_price numeric DEFAULT 0,
    cost_price numeric DEFAULT 0,
    barcode character varying,
    is_active boolean DEFAULT true,
    item_type text DEFAULT 'water_product'::text,
    is_returnable_bottle boolean DEFAULT false,
    tax_rate numeric DEFAULT 15
);


--
-- Name: inventory_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_number character varying NOT NULL,
    transaction_date date DEFAULT CURRENT_DATE NOT NULL,
    type character varying NOT NULL,
    quantity numeric NOT NULL,
    item_id uuid,
    partner_id uuid,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    unit_price numeric DEFAULT 0,
    notes text,
    status character varying DEFAULT 'pending'::character varying,
    total_price numeric DEFAULT 0,
    journal_id uuid,
    fleet_operation_id uuid,
    invoice_id uuid,
    warehouse_id uuid,
    delegate_id uuid,
    tax_amount numeric DEFAULT 0,
    include_tax boolean DEFAULT false,
    destination_warehouse_id uuid,
    shift_id uuid,
    CONSTRAINT inventory_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['in'::character varying, 'out'::character varying, 'transfer_out'::character varying, 'transfer_in'::character varying, 'sales_deduction'::character varying, 'waste'::character varying, 'empty_return'::character varying, 'adjustment_in'::character varying, 'adjustment_out'::character varying, 'damage'::character varying, 'reconciliation'::character varying])::text[])))
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number character varying NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    partner_id uuid,
    client_name character varying,
    description text,
    materials_discount numeric DEFAULT 0,
    taxable_amount numeric DEFAULT 0,
    tax_amount numeric DEFAULT 0,
    guarantee_percent numeric DEFAULT 0,
    guarantee_amount numeric DEFAULT 0,
    total_amount numeric DEFAULT 0,
    debit_account_id uuid DEFAULT '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid,
    credit_account_id uuid DEFAULT '6667f91a-9478-49ab-9721-521ee09381fa'::uuid,
    materials_acc_id uuid DEFAULT '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid,
    guarantee_acc_id uuid DEFAULT '4f828d0d-a1f4-4762-83e3-c17dafae802d'::uuid,
    tax_acc_id uuid DEFAULT '6667f91a-9478-49ab-9721-521ee09381fa'::uuid,
    skip_zatca boolean DEFAULT false,
    status character varying DEFAULT 'معلق'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    due_in_days integer DEFAULT 0,
    due_date date,
    paid_amount numeric DEFAULT 0,
    lines_data jsonb DEFAULT '[]'::jsonb,
    fleet_operation_id uuid,
    job_order_id uuid,
    warehouse_id uuid,
    delegate_id uuid,
    payment_method character varying DEFAULT 'آجل'::character varying,
    shift_id uuid,
    created_by uuid,
    payment_status text DEFAULT 'unpaid'::text
);


--
-- Name: job_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text NOT NULL,
    boq_budget_id uuid,
    assigned_qty numeric DEFAULT 0,
    unit_price numeric DEFAULT 0,
    status text DEFAULT 'جاري التنفيذ'::text,
    start_date date DEFAULT CURRENT_DATE,
    end_date date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    executor_type text DEFAULT 'تنفيذ ذاتي'::text,
    contractor_id uuid,
    customer_id uuid,
    CONSTRAINT job_orders_status_check CHECK ((status = ANY (ARRAY['مسودة'::text, 'جاري التنفيذ'::text, 'مكتمل'::text, 'موقوف'::text, 'جاري التسليم'::text, 'مفوتر'::text, 'تم التحصيل'::text])))
);


--
-- Name: journal_errors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_errors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    error_type text,
    description text,
    is_fixed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: journal_headers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_headers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_date date NOT NULL,
    description character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    status character varying DEFAULT 'draft'::character varying,
    reference_id uuid,
    v_type text,
    fleet_operation_id uuid
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    header_id uuid NOT NULL,
    account_id uuid NOT NULL,
    partner_id uuid,
    item_name character varying,
    quantity numeric DEFAULT 1,
    unit_price numeric DEFAULT 0,
    debit numeric DEFAULT 0 NOT NULL,
    credit numeric DEFAULT 0 NOT NULL,
    notes text,
    tax_amount numeric DEFAULT 0,
    tax_rate numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    delegate_id uuid,
    fleet_operation_id uuid
);


--
-- Name: labor_daily_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.labor_daily_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    work_date date NOT NULL,
    worker_name text NOT NULL,
    site_ref text,
    work_item text,
    unit text,
    skill_level text,
    daily_wage numeric DEFAULT 0,
    attendance_value numeric DEFAULT 0,
    sub_contractor text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    worker_partner_id uuid,
    sub_contractor_id uuid,
    is_posted boolean DEFAULT false,
    work_item_id uuid,
    tareeha numeric,
    productivity numeric,
    completion_percentage numeric,
    credit_account_id uuid DEFAULT '39f878cd-dc58-4a2a-a199-50f6fca983d4'::uuid,
    debit_account_id uuid DEFAULT '70d181ba-6385-4c1e-b0fc-d5b1f800dd2c'::uuid,
    production_desc text,
    completed_quantity numeric DEFAULT 0,
    number_of_workers integer DEFAULT 1,
    job_order_id uuid
);


--
-- Name: manual_journals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_journals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_number text,
    entry_date date NOT NULL,
    description text,
    debit_account_id uuid,
    credit_account_id uuid,
    partner_id uuid,
    project_id uuid,
    job_order_id uuid,
    amount numeric NOT NULL,
    status text DEFAULT 'مسودة'::text,
    is_posted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: material_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.material_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_code character varying,
    item_name character varying NOT NULL,
    main_category character varying,
    default_unit character varying DEFAULT 'Ø­Ø¨Ø©'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid NOT NULL,
    receiver_id uuid NOT NULL,
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    read_at timestamp with time zone
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    title text DEFAULT 'إشعار جديد'::text NOT NULL,
    content text DEFAULT 'يوجد تحديث جديد'::text NOT NULL,
    related_id uuid
);


--
-- Name: partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying NOT NULL,
    name character varying NOT NULL,
    partner_type character varying NOT NULL,
    identity_number character varying,
    identity_expiry_date date,
    identity_image_url text,
    phone character varying,
    address text,
    vat_number character varying,
    created_at timestamp with time zone DEFAULT now(),
    job_role character varying,
    account_id uuid,
    is_active boolean DEFAULT true,
    credit_limit numeric DEFAULT 0,
    credit_days integer DEFAULT 0,
    bottle_custody numeric DEFAULT 0,
    location_lat numeric,
    location_lng numeric,
    route_name text
);


--
-- Name: payment_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_vouchers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    voucher_number text NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric DEFAULT 0 NOT NULL,
    partner_id uuid,
    credit_account_id uuid,
    payment_method text,
    reference_no text,
    description text,
    notes text,
    status text DEFAULT 'مسودة'::text NOT NULL,
    is_posted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    debit_account_id uuid,
    site_ref text,
    related_expense_id uuid,
    sub_claim_id uuid,
    fleet_operation_id uuid,
    shift_id uuid,
    CONSTRAINT payment_vouchers_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: payroll_slips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payroll_slips (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    emp_id uuid,
    month text NOT NULL,
    basic_salary numeric DEFAULT 0,
    total_advances numeric DEFAULT 0,
    total_deductions numeric DEFAULT 0,
    net_salary numeric NOT NULL,
    is_posted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    amount_to_pay numeric DEFAULT 0,
    allowances numeric DEFAULT 0,
    status text DEFAULT 'غير مدفوع'::text
);


--
-- Name: pos_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_shifts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    delegate_id uuid,
    warehouse_id uuid,
    opened_at timestamp with time zone DEFAULT now() NOT NULL,
    closed_at timestamp with time zone,
    starting_cash numeric DEFAULT 0 NOT NULL,
    expected_cash numeric DEFAULT 0,
    actual_cash numeric DEFAULT 0,
    total_sales numeric DEFAULT 0,
    total_cash_sales numeric DEFAULT 0,
    total_card_sales numeric DEFAULT 0,
    total_credit_sales numeric DEFAULT 0,
    shortage_overage numeric DEFAULT 0,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    bottles_sold numeric DEFAULT 0,
    bottles_returned numeric DEFAULT 0,
    bottles_shortage numeric DEFAULT 0,
    starting_bottles numeric DEFAULT 0,
    expected_bottles numeric DEFAULT 0,
    total_expenses numeric DEFAULT 0,
    fleet_operation_id uuid,
    closing_notes text,
    actual_bottles numeric DEFAULT 0
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    username text,
    role text DEFAULT 'staff'::text,
    permissions jsonb DEFAULT '{}'::jsonb,
    signature_url text,
    linked_partner_id uuid,
    avatar_url text,
    nickname text,
    phone_number text,
    full_name text,
    email text,
    created_at timestamp with time zone DEFAULT now(),
    is_admin boolean DEFAULT false,
    is_active boolean DEFAULT true,
    quick_links jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text, 'staff'::text, 'contractor'::text, 'client'::text])))
);


--
-- Name: receipt_vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_vouchers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    amount numeric NOT NULL,
    payment_method text NOT NULL,
    notes text,
    partner_id uuid,
    invoice_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    receipt_number character varying,
    status character varying DEFAULT 'مسودة'::character varying,
    safe_bank_acc_id uuid,
    partner_acc_id uuid,
    reference_number text,
    attachment_url text,
    job_order_id uuid,
    delegate_id uuid,
    shift_id uuid,
    fleet_operation_id uuid,
    CONSTRAINT receipt_vouchers_amount_check CHECK ((amount > (0)::numeric))
);


--
-- Name: service_operations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_operations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    operation_date date DEFAULT CURRENT_DATE NOT NULL,
    operation_type text NOT NULL,
    description text NOT NULL,
    client_id uuid,
    employee_id uuid,
    total_amount numeric DEFAULT 0 NOT NULL,
    commission_percentage numeric DEFAULT 0 NOT NULL,
    commission_amount numeric DEFAULT 0 NOT NULL,
    net_profit numeric DEFAULT 0 NOT NULL,
    debit_account_id uuid,
    revenue_account_id uuid,
    commission_expense_account_id uuid,
    journal_id uuid,
    status text DEFAULT 'completed'::text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT service_operations_commission_percentage_check CHECK (((commission_percentage >= (0)::numeric) AND (commission_percentage <= (100)::numeric))),
    CONSTRAINT service_operations_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'completed'::text, 'cancelled'::text]))),
    CONSTRAINT service_operations_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: sys_financial_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_financial_reports (
    report_name character varying NOT NULL,
    report_data jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid NOT NULL,
    theme_config jsonb DEFAULT '{"brand_gold": "#C5A059", "glass_blur": "15px", "bg_gradient": "linear-gradient(180deg, #43342E 0%, #8C6A5D 100%)", "glass_opacity": 0.7}'::jsonb,
    privacy_settings jsonb DEFAULT '{"show_activity_log": true, "show_online_status": true}'::jsonb,
    notifications jsonb DEFAULT '{"email_alerts": true, "push_notifications": false}'::jsonb,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: user_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    type text NOT NULL,
    category text,
    subject text NOT NULL,
    details text,
    status text DEFAULT 'pending'::text,
    admin_note text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: user_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title text NOT NULL,
    description text,
    status text DEFAULT 'pending'::text,
    priority text DEFAULT 'normal'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: vehicle_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vehicle_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    fleet_operation_id uuid,
    item_id uuid,
    quantity numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    loaded_qty numeric DEFAULT 0,
    sold_qty numeric DEFAULT 0,
    returned_qty numeric DEFAULT 0,
    waste_qty numeric DEFAULT 0,
    shortage_qty numeric DEFAULT 0
);


--
-- Name: violations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.violations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    date date DEFAULT CURRENT_DATE,
    partner_id uuid,
    emp_name text,
    profession text,
    site_name text,
    reason text,
    amount numeric,
    image_url text,
    is_posted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    debit_account_id uuid,
    credit_account_id uuid,
    violation_type text DEFAULT 'غرامة'::text,
    boq_item_id uuid,
    is_deleted boolean DEFAULT false
);


--
-- Name: warehouse_inventory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouse_inventory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    warehouse_id uuid NOT NULL,
    item_id uuid NOT NULL,
    quantity numeric DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying DEFAULT 'main'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    delegate_id uuid,
    location text,
    phone text,
    manager_name text,
    description text,
    vehicle_id uuid,
    cash_account_id uuid,
    CONSTRAINT warehouses_type_check CHECK (((type)::text = ANY (ARRAY[('main'::character varying)::text, ('sub'::character varying)::text, ('vehicle'::character varying)::text, ('pos'::character varying)::text])))
);


--
-- Name: accounts accounts_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_code_key UNIQUE (code);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: cash_flows cash_flows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_flows
    ADD CONSTRAINT cash_flows_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: financial_plans financial_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_plans
    ADD CONSTRAINT financial_plans_pkey PRIMARY KEY (id);


--
-- Name: fleet_operations fleet_operations_operation_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_operations
    ADD CONSTRAINT fleet_operations_operation_number_key UNIQUE (operation_number);


--
-- Name: fleet_operations fleet_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_operations
    ADD CONSTRAINT fleet_operations_pkey PRIMARY KEY (id);


--
-- Name: fleet_vehicles fleet_vehicles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fleet_vehicles
    ADD CONSTRAINT fleet_vehicles_pkey PRIMARY KEY (id);


--
-- Name: inventory_items inventory_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_items
    ADD CONSTRAINT inventory_items_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_pkey PRIMARY KEY (id);


--
-- Name: inventory_transactions inventory_transactions_transaction_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_transaction_number_key UNIQUE (transaction_number);


--
-- Name: invoices invoices_invoice_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_invoice_number_key UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: job_orders job_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_orders
    ADD CONSTRAINT job_orders_order_number_key UNIQUE (order_number);


--
-- Name: job_orders job_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_orders
    ADD CONSTRAINT job_orders_pkey PRIMARY KEY (id);


--
-- Name: journal_errors journal_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_errors
    ADD CONSTRAINT journal_errors_pkey PRIMARY KEY (id);


--
-- Name: journal_headers journal_headers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_headers
    ADD CONSTRAINT journal_headers_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: labor_daily_logs labor_daily_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.labor_daily_logs
    ADD CONSTRAINT labor_daily_logs_pkey PRIMARY KEY (id);


--
-- Name: manual_journals manual_journals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journals
    ADD CONSTRAINT manual_journals_pkey PRIMARY KEY (id);


--
-- Name: material_items material_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.material_items
    ADD CONSTRAINT material_items_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: partners partners_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_code_key UNIQUE (code);


--
-- Name: partners partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partners
    ADD CONSTRAINT partners_pkey PRIMARY KEY (id);


--
-- Name: payment_vouchers payment_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_vouchers
    ADD CONSTRAINT payment_vouchers_pkey PRIMARY KEY (id);


--
-- Name: payment_vouchers payment_vouchers_voucher_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_vouchers
    ADD CONSTRAINT payment_vouchers_voucher_number_key UNIQUE (voucher_number);


--
-- Name: payroll_slips payroll_slips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payroll_slips
    ADD CONSTRAINT payroll_slips_pkey PRIMARY KEY (id);


--
-- Name: pos_shifts pos_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_shifts
    ADD CONSTRAINT pos_shifts_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_username_key UNIQUE (username);


--
-- Name: receipt_vouchers receipt_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_vouchers
    ADD CONSTRAINT receipt_vouchers_pkey PRIMARY KEY (id);


--
-- Name: receipt_vouchers receipt_vouchers_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_vouchers
    ADD CONSTRAINT receipt_vouchers_receipt_number_key UNIQUE (receipt_number);


--
-- Name: service_operations service_operations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_operations
    ADD CONSTRAINT service_operations_pkey PRIMARY KEY (id);


--
-- Name: sys_financial_reports sys_financial_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_financial_reports
    ADD CONSTRAINT sys_financial_reports_pkey PRIMARY KEY (report_name);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: financial_periods uq_financial_period_dates; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT uq_financial_period_dates UNIQUE (start_date, end_date);


--
-- Name: user_requests user_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_requests
    ADD CONSTRAINT user_requests_pkey PRIMARY KEY (id);


--
-- Name: user_tasks user_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_tasks
    ADD CONSTRAINT user_tasks_pkey PRIMARY KEY (id);


--
-- Name: vehicle_inventory vehicle_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vehicle_inventory
    ADD CONSTRAINT vehicle_inventory_pkey PRIMARY KEY (id);


--
-- Name: violations violations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.violations
    ADD CONSTRAINT violations_pkey PRIMARY KEY (id);


--
-- Name: warehouse_inventory warehouse_inventory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouse_inventory
    ADD CONSTRAINT warehouse_inventory_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: idx_financial_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_dates ON public.financial_periods USING btree (start_date, end_date);


--
-- Name: idx_financial_periods_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_status ON public.financial_periods USING btree (status);


--
-- Name: idx_pos_shifts_single_open_delegate; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pos_shifts_single_open_delegate ON public.pos_shifts USING btree (delegate_id) WHERE (((status)::text = 'open'::text) AND (delegate_id IS NOT NULL));


--
-- Name: idx_pos_shifts_single_open_warehouse; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_pos_shifts_single_open_warehouse ON public.pos_shifts USING btree (warehouse_id) WHERE ((status)::text = 'open'::text);


--
-- Name: uq_vehicle_inventory_fleet_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_vehicle_inventory_fleet_item ON public.vehicle_inventory USING btree (fleet_operation_id, item_id);


--
-- Name: uq_warehouse_inventory_wh_item; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_warehouse_inventory_wh_item ON public.warehouse_inventory USING btree (warehouse_id, item_id);


--
-- Name: journal_headers trg_check_period_lock; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_period_lock BEFORE INSERT OR DELETE OR UPDATE ON public.journal_headers FOR EACH ROW EXECUTE FUNCTION public.fn_check_financial_period_lock();


--
-- Name: invoices trg_check_pos_invoice_shift_required; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_pos_invoice_shift_required BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.check_pos_invoice_shift_required();


--
-- Name: pos_shifts trg_check_single_open_pos_shift; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_single_open_pos_shift BEFORE INSERT OR UPDATE OF status, warehouse_id, delegate_id ON public.pos_shifts FOR EACH ROW EXECUTE FUNCTION public.check_single_open_pos_shift();


--
-- Name: accounts accounts_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.accounts(id);


--
-- Name: financial_periods financial_periods_closing_journal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_closing_journal_id_fkey FOREIGN KEY (closing_journal_id) REFERENCES public.journal_headers(id);


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION approve_inventory_transaction(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.approve_inventory_transaction(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.approve_inventory_transaction(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.approve_inventory_transaction(p_id uuid) TO service_role;


--
-- Name: FUNCTION check_pos_invoice_shift_required(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_pos_invoice_shift_required() TO anon;
GRANT ALL ON FUNCTION public.check_pos_invoice_shift_required() TO authenticated;
GRANT ALL ON FUNCTION public.check_pos_invoice_shift_required() TO service_role;


--
-- Name: FUNCTION check_single_open_pos_shift(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.check_single_open_pos_shift() TO anon;
GRANT ALL ON FUNCTION public.check_single_open_pos_shift() TO authenticated;
GRANT ALL ON FUNCTION public.check_single_open_pos_shift() TO service_role;


--
-- Name: FUNCTION close_pos_shift(p_shift_id uuid, p_actual_cash numeric); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.close_pos_shift(p_shift_id uuid, p_actual_cash numeric) TO anon;
GRANT ALL ON FUNCTION public.close_pos_shift(p_shift_id uuid, p_actual_cash numeric) TO authenticated;
GRANT ALL ON FUNCTION public.close_pos_shift(p_shift_id uuid, p_actual_cash numeric) TO service_role;


--
-- Name: FUNCTION fn_check_financial_period_lock(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.fn_check_financial_period_lock() TO anon;
GRANT ALL ON FUNCTION public.fn_check_financial_period_lock() TO authenticated;
GRANT ALL ON FUNCTION public.fn_check_financial_period_lock() TO service_role;


--
-- Name: FUNCTION get_pos_shift_details(p_shift_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pos_shift_details(p_shift_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_pos_shift_details(p_shift_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_pos_shift_details(p_shift_id uuid) TO service_role;


--
-- Name: FUNCTION get_pos_shifts_list(p_status text, p_warehouse_id uuid, p_delegate_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer, p_offset integer); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_pos_shifts_list(p_status text, p_warehouse_id uuid, p_delegate_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.get_pos_shifts_list(p_status text, p_warehouse_id uuid, p_delegate_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.get_pos_shifts_list(p_status text, p_warehouse_id uuid, p_delegate_id uuid, p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_limit integer, p_offset integer) TO service_role;


--
-- Name: FUNCTION post_expense_to_journal(p_expense_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.post_expense_to_journal(p_expense_id uuid) TO anon;
GRANT ALL ON FUNCTION public.post_expense_to_journal(p_expense_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.post_expense_to_journal(p_expense_id uuid) TO service_role;


--
-- Name: FUNCTION rpc_close_financial_period(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_close_financial_period(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_close_financial_period(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_close_financial_period(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_close_pos_shift(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_close_pos_shift(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_close_pos_shift(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_close_pos_shift(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_generate_trial_balance(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_generate_trial_balance(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_generate_trial_balance(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_generate_trial_balance(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_get_inventory_balances(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_get_inventory_balances() TO anon;
GRANT ALL ON FUNCTION public.rpc_get_inventory_balances() TO authenticated;
GRANT ALL ON FUNCTION public.rpc_get_inventory_balances() TO service_role;


--
-- Name: FUNCTION rpc_process_inventory_adjustment(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_inventory_adjustment(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_inventory_adjustment(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_inventory_adjustment(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_payment_voucher(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_payment_voucher(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_payment_voucher(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_payment_voucher(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_pos_sale(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_pos_sale(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_pos_sale(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_pos_sale(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_purchase_invoice(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_purchase_invoice(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_purchase_invoice(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_purchase_invoice(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_receipt_voucher(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_receipt_voucher(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_receipt_voucher(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_receipt_voucher(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_sales_invoice(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_sales_invoice(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_sales_invoice(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_sales_invoice(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_process_stock_transfer(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_process_stock_transfer(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_process_stock_transfer(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_process_stock_transfer(p_data jsonb) TO service_role;


--
-- Name: FUNCTION rpc_settle_fleet_trip(p_data jsonb); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.rpc_settle_fleet_trip(p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.rpc_settle_fleet_trip(p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.rpc_settle_fleet_trip(p_data jsonb) TO service_role;


--
-- Name: FUNCTION save_expense_with_settlement(p_id uuid, p_exp_date date, p_main_category text, p_sub_contractor text, p_site_ref text, p_creditor_account text, p_description text, p_payee_name text, p_payment_method text, p_payment_account text, p_employee_name text, p_quantity numeric, p_unit_price numeric, p_vat_amount numeric, p_discount_amount numeric, p_discount_account text, p_notes text, p_invoice_image text, p_lines_data jsonb, p_is_auto_distributed boolean, p_payee_id uuid, p_job_order_id uuid, p_is_deducted_from_contractor boolean); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.save_expense_with_settlement(p_id uuid, p_exp_date date, p_main_category text, p_sub_contractor text, p_site_ref text, p_creditor_account text, p_description text, p_payee_name text, p_payment_method text, p_payment_account text, p_employee_name text, p_quantity numeric, p_unit_price numeric, p_vat_amount numeric, p_discount_amount numeric, p_discount_account text, p_notes text, p_invoice_image text, p_lines_data jsonb, p_is_auto_distributed boolean, p_payee_id uuid, p_job_order_id uuid, p_is_deducted_from_contractor boolean) TO anon;
GRANT ALL ON FUNCTION public.save_expense_with_settlement(p_id uuid, p_exp_date date, p_main_category text, p_sub_contractor text, p_site_ref text, p_creditor_account text, p_description text, p_payee_name text, p_payment_method text, p_payment_account text, p_employee_name text, p_quantity numeric, p_unit_price numeric, p_vat_amount numeric, p_discount_amount numeric, p_discount_account text, p_notes text, p_invoice_image text, p_lines_data jsonb, p_is_auto_distributed boolean, p_payee_id uuid, p_job_order_id uuid, p_is_deducted_from_contractor boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_expense_with_settlement(p_id uuid, p_exp_date date, p_main_category text, p_sub_contractor text, p_site_ref text, p_creditor_account text, p_description text, p_payee_name text, p_payment_method text, p_payment_account text, p_employee_name text, p_quantity numeric, p_unit_price numeric, p_vat_amount numeric, p_discount_amount numeric, p_discount_account text, p_notes text, p_invoice_image text, p_lines_data jsonb, p_is_auto_distributed boolean, p_payee_id uuid, p_job_order_id uuid, p_is_deducted_from_contractor boolean) TO service_role;


--
-- Name: FUNCTION unapprove_inventory_transaction(p_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.unapprove_inventory_transaction(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.unapprove_inventory_transaction(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.unapprove_inventory_transaction(p_id uuid) TO service_role;


--
-- Name: TABLE accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE cash_flows; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cash_flows TO anon;
GRANT ALL ON TABLE public.cash_flows TO authenticated;
GRANT ALL ON TABLE public.cash_flows TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE financial_periods; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financial_periods TO anon;
GRANT ALL ON TABLE public.financial_periods TO authenticated;
GRANT ALL ON TABLE public.financial_periods TO service_role;


--
-- Name: TABLE financial_plans; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financial_plans TO anon;
GRANT ALL ON TABLE public.financial_plans TO authenticated;
GRANT ALL ON TABLE public.financial_plans TO service_role;


--
-- Name: TABLE fleet_operations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fleet_operations TO anon;
GRANT ALL ON TABLE public.fleet_operations TO authenticated;
GRANT ALL ON TABLE public.fleet_operations TO service_role;


--
-- Name: TABLE fleet_vehicles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.fleet_vehicles TO anon;
GRANT ALL ON TABLE public.fleet_vehicles TO authenticated;
GRANT ALL ON TABLE public.fleet_vehicles TO service_role;


--
-- Name: TABLE inventory_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_items TO anon;
GRANT ALL ON TABLE public.inventory_items TO authenticated;
GRANT ALL ON TABLE public.inventory_items TO service_role;


--
-- Name: TABLE inventory_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.inventory_transactions TO anon;
GRANT ALL ON TABLE public.inventory_transactions TO authenticated;
GRANT ALL ON TABLE public.inventory_transactions TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: TABLE job_orders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.job_orders TO anon;
GRANT ALL ON TABLE public.job_orders TO authenticated;
GRANT ALL ON TABLE public.job_orders TO service_role;


--
-- Name: TABLE journal_errors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_errors TO anon;
GRANT ALL ON TABLE public.journal_errors TO authenticated;
GRANT ALL ON TABLE public.journal_errors TO service_role;


--
-- Name: TABLE journal_headers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_headers TO anon;
GRANT ALL ON TABLE public.journal_headers TO authenticated;
GRANT ALL ON TABLE public.journal_headers TO service_role;


--
-- Name: TABLE journal_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.journal_lines TO anon;
GRANT ALL ON TABLE public.journal_lines TO authenticated;
GRANT ALL ON TABLE public.journal_lines TO service_role;


--
-- Name: TABLE labor_daily_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.labor_daily_logs TO anon;
GRANT ALL ON TABLE public.labor_daily_logs TO authenticated;
GRANT ALL ON TABLE public.labor_daily_logs TO service_role;


--
-- Name: TABLE manual_journals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.manual_journals TO anon;
GRANT ALL ON TABLE public.manual_journals TO authenticated;
GRANT ALL ON TABLE public.manual_journals TO service_role;


--
-- Name: TABLE material_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.material_items TO anon;
GRANT ALL ON TABLE public.material_items TO authenticated;
GRANT ALL ON TABLE public.material_items TO service_role;


--
-- Name: TABLE messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.messages TO anon;
GRANT ALL ON TABLE public.messages TO authenticated;
GRANT ALL ON TABLE public.messages TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE partners; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.partners TO anon;
GRANT ALL ON TABLE public.partners TO authenticated;
GRANT ALL ON TABLE public.partners TO service_role;


--
-- Name: TABLE payment_vouchers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payment_vouchers TO anon;
GRANT ALL ON TABLE public.payment_vouchers TO authenticated;
GRANT ALL ON TABLE public.payment_vouchers TO service_role;


--
-- Name: TABLE payroll_slips; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.payroll_slips TO anon;
GRANT ALL ON TABLE public.payroll_slips TO authenticated;
GRANT ALL ON TABLE public.payroll_slips TO service_role;


--
-- Name: TABLE pos_shifts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pos_shifts TO anon;
GRANT ALL ON TABLE public.pos_shifts TO authenticated;
GRANT ALL ON TABLE public.pos_shifts TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE receipt_vouchers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.receipt_vouchers TO anon;
GRANT ALL ON TABLE public.receipt_vouchers TO authenticated;
GRANT ALL ON TABLE public.receipt_vouchers TO service_role;


--
-- Name: TABLE service_operations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_operations TO anon;
GRANT ALL ON TABLE public.service_operations TO authenticated;
GRANT ALL ON TABLE public.service_operations TO service_role;


--
-- Name: TABLE sys_financial_reports; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sys_financial_reports TO anon;
GRANT ALL ON TABLE public.sys_financial_reports TO authenticated;
GRANT ALL ON TABLE public.sys_financial_reports TO service_role;


--
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;


--
-- Name: TABLE user_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_requests TO anon;
GRANT ALL ON TABLE public.user_requests TO authenticated;
GRANT ALL ON TABLE public.user_requests TO service_role;


--
-- Name: TABLE user_tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.user_tasks TO anon;
GRANT ALL ON TABLE public.user_tasks TO authenticated;
GRANT ALL ON TABLE public.user_tasks TO service_role;


--
-- Name: TABLE vehicle_inventory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.vehicle_inventory TO anon;
GRANT ALL ON TABLE public.vehicle_inventory TO authenticated;
GRANT ALL ON TABLE public.vehicle_inventory TO service_role;


--
-- Name: TABLE violations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.violations TO anon;
GRANT ALL ON TABLE public.violations TO authenticated;
GRANT ALL ON TABLE public.violations TO service_role;


--
-- Name: TABLE warehouse_inventory; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouse_inventory TO anon;
GRANT ALL ON TABLE public.warehouse_inventory TO authenticated;
GRANT ALL ON TABLE public.warehouse_inventory TO service_role;


--
-- Name: TABLE warehouses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.warehouses TO anon;
GRANT ALL ON TABLE public.warehouses TO authenticated;
GRANT ALL ON TABLE public.warehouses TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


