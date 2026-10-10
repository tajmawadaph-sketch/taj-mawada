-- Durable idempotency for the offline queue's existing operation IDs.
-- The public RPC names/signatures and their existing grants remain unchanged.

DO $preflight$ DECLARE
    v_rpc_name TEXT;
    v_impl_name TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'offline_sync_private'
    ) THEN
        RAISE EXCEPTION 'Cannot install sync idempotency: schema offline_sync_private already exists';
    END IF;

    FOR v_rpc_name, v_impl_name IN
        SELECT * FROM (VALUES
            ('rpc_close_pos_shift', 'rpc_close_pos_shift__sync_impl'),
            ('rpc_process_receipt_voucher', 'rpc_process_receipt_voucher__sync_impl'),
            ('rpc_process_payment_voucher', 'rpc_process_payment_voucher__sync_impl'),
            ('rpc_process_stock_transfer', 'rpc_process_stock_transfer__sync_impl'),
            ('rpc_process_inventory_adjustment', 'rpc_process_inventory_adjustment__sync_impl'),
            ('rpc_settle_fleet_trip', 'rpc_settle_fleet_trip__sync_impl'),
            ('rpc_process_sales_invoice', 'rpc_process_sales_invoice__sync_impl'),
            ('rpc_process_purchase_invoice', 'rpc_process_purchase_invoice__sync_impl'),
            ('rpc_close_financial_period', 'rpc_close_financial_period__sync_impl')
        ) AS rpc_functions(rpc_name, impl_name)
    LOOP
        IF to_regprocedure(format('public.%I(jsonb)', v_rpc_name)) IS NULL THEN
            RAISE EXCEPTION 'Cannot install sync idempotency: public.% (jsonb) is missing', v_rpc_name;
        END IF;
        IF to_regprocedure(format('public.%I(jsonb)', v_impl_name)) IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot install sync idempotency: implementation public.% already exists', v_impl_name;
        END IF;
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc p
            WHERE p.oid = to_regprocedure(format('public.%I(jsonb)', v_rpc_name))
              AND p.pronargs = 1
              AND p.proargnames[1] = 'p_data'
              AND p.prorettype = 'jsonb'::regtype
              AND p.prosecdef
        ) THEN
            RAISE EXCEPTION 'Cannot install sync idempotency: public.% has an unexpected signature or security mode', v_rpc_name;
        END IF;
    END LOOP;
END;
$preflight$;

CREATE TEMP TABLE _phase3_sync_rpc_acl_snapshot (
    rpc_name TEXT NOT NULL,
    owner_oid OID NOT NULL,
    grantee_oid OID NOT NULL,
    privilege_type TEXT NOT NULL,
    is_grantable BOOLEAN NOT NULL
);

DO $rename$ DECLARE
    v_rpc_name TEXT;
    v_impl_name TEXT;
    v_owner_oid OID;
    v_acl ACLITEM[];
    v_acl_entry RECORD;
    v_grantee TEXT;
BEGIN
    FOR v_rpc_name, v_impl_name IN
        SELECT * FROM (VALUES
            ('rpc_close_pos_shift', 'rpc_close_pos_shift__sync_impl'),
            ('rpc_process_receipt_voucher', 'rpc_process_receipt_voucher__sync_impl'),
            ('rpc_process_payment_voucher', 'rpc_process_payment_voucher__sync_impl'),
            ('rpc_process_stock_transfer', 'rpc_process_stock_transfer__sync_impl'),
            ('rpc_process_inventory_adjustment', 'rpc_process_inventory_adjustment__sync_impl'),
            ('rpc_settle_fleet_trip', 'rpc_settle_fleet_trip__sync_impl'),
            ('rpc_process_sales_invoice', 'rpc_process_sales_invoice__sync_impl'),
            ('rpc_process_purchase_invoice', 'rpc_process_purchase_invoice__sync_impl'),
            ('rpc_close_financial_period', 'rpc_close_financial_period__sync_impl')
        ) AS rpc_functions(rpc_name, impl_name)
    LOOP
        IF to_regprocedure(format('public.%I(jsonb)', v_rpc_name)) IS NULL THEN
            RAISE EXCEPTION 'Cannot install sync idempotency: public.% (jsonb) is missing', v_rpc_name;
        END IF;
        IF to_regprocedure(format('public.%I(jsonb)', v_impl_name)) IS NOT NULL THEN
            RAISE EXCEPTION 'Cannot install sync idempotency: implementation public.% already exists', v_impl_name;
        END IF;

        SELECT p.proowner, COALESCE(p.proacl, acldefault('f', p.proowner))
        INTO v_owner_oid, v_acl
        FROM pg_catalog.pg_proc p
        WHERE p.oid = to_regprocedure(format('public.%I(jsonb)', v_rpc_name));

        INSERT INTO pg_temp._phase3_sync_rpc_acl_snapshot (
            rpc_name, owner_oid, grantee_oid, privilege_type, is_grantable
        )
        SELECT v_rpc_name, v_owner_oid, grant_entry.grantee,
               grant_entry.privilege_type, grant_entry.is_grantable
        FROM aclexplode(v_acl) AS grant_entry;

        EXECUTE format('ALTER FUNCTION public.%I(jsonb) RENAME TO %I', v_rpc_name, v_impl_name);
        FOR v_acl_entry IN
            SELECT DISTINCT grant_entry.grantee, grantee_role.rolname
            FROM aclexplode(v_acl) AS grant_entry
            LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = grant_entry.grantee
            WHERE grant_entry.privilege_type = 'EXECUTE'
              AND grant_entry.grantee <> v_owner_oid
        LOOP
            v_grantee := CASE
                WHEN v_acl_entry.grantee = 0 THEN 'PUBLIC'
                ELSE quote_ident(v_acl_entry.rolname)
            END;
            EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM %s', v_impl_name, v_grantee);
        END LOOP;
        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO %I',
            v_impl_name,
            current_user
        );
    END LOOP;
END;
$rename$;

CREATE SCHEMA offline_sync_private;
REVOKE ALL ON SCHEMA offline_sync_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE offline_sync_private.operation_results (
    operation_id TEXT PRIMARY KEY
        CHECK (length(operation_id) BETWEEN 1 AND 512 AND operation_id = btrim(operation_id)),
    rpc_name TEXT NOT NULL CHECK (rpc_name IN (
        'rpc_close_pos_shift',
        'rpc_process_receipt_voucher',
        'rpc_process_payment_voucher',
        'rpc_process_stock_transfer',
        'rpc_process_inventory_adjustment',
        'rpc_settle_fleet_trip',
        'rpc_process_sales_invoice',
        'rpc_process_purchase_invoice',
        'rpc_close_financial_period'
    )),
    actor_id UUID,
    actor_role TEXT NOT NULL,
    request_hash TEXT NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
    request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
    response_payload JSONB CHECK (response_payload IS NULL OR jsonb_typeof(response_payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    CHECK ((response_payload IS NULL) = (completed_at IS NULL))
);

COMMENT ON TABLE offline_sync_private.operation_results IS
    'Durable results for offline sync operation IDs. Keep successful rows until a separately reviewed retention policy exists.';

ALTER TABLE offline_sync_private.operation_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE offline_sync_private.operation_results FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION offline_sync_private.run_operation(
    p_rpc_name TEXT,
    p_data JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
    v_operation_id TEXT;
    v_request_payload JSONB;
    v_request_hash TEXT;
    v_actor_id UUID;
    v_actor_role TEXT;
    v_impl_name TEXT;
    v_response JSONB;
    v_existing offline_sync_private.operation_results%ROWTYPE;
    v_claimed BOOLEAN;
BEGIN
    IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
       OR NOT (p_data ? '_sync_operation_id')
       OR jsonb_typeof(p_data->'_sync_operation_id') <> 'string' THEN
        RAISE EXCEPTION 'A non-empty _sync_operation_id string is required for keyed RPC execution';
    END IF;

    v_operation_id := p_data->>'_sync_operation_id';
    IF length(v_operation_id) NOT BETWEEN 1 AND 512
       OR v_operation_id <> btrim(v_operation_id) THEN
        RAISE EXCEPTION 'Invalid _sync_operation_id';
    END IF;

    v_impl_name := CASE p_rpc_name
        WHEN 'rpc_close_pos_shift' THEN 'rpc_close_pos_shift__sync_impl'
        WHEN 'rpc_process_receipt_voucher' THEN 'rpc_process_receipt_voucher__sync_impl'
        WHEN 'rpc_process_payment_voucher' THEN 'rpc_process_payment_voucher__sync_impl'
        WHEN 'rpc_process_stock_transfer' THEN 'rpc_process_stock_transfer__sync_impl'
        WHEN 'rpc_process_inventory_adjustment' THEN 'rpc_process_inventory_adjustment__sync_impl'
        WHEN 'rpc_settle_fleet_trip' THEN 'rpc_settle_fleet_trip__sync_impl'
        WHEN 'rpc_process_sales_invoice' THEN 'rpc_process_sales_invoice__sync_impl'
        WHEN 'rpc_process_purchase_invoice' THEN 'rpc_process_purchase_invoice__sync_impl'
        WHEN 'rpc_close_financial_period' THEN 'rpc_close_financial_period__sync_impl'
        ELSE NULL
    END;
    IF v_impl_name IS NULL THEN
        RAISE EXCEPTION 'RPC % is not enabled for offline idempotency', p_rpc_name;
    END IF;

    v_request_payload := p_data - '_sync_operation_id';
    v_request_hash := encode(sha256(convert_to(v_request_payload::TEXT, 'UTF8')), 'hex');
    v_actor_id := auth.uid();
    v_actor_role := COALESCE(auth.role(), 'unknown');

    INSERT INTO offline_sync_private.operation_results (
        operation_id,
        rpc_name,
        actor_id,
        actor_role,
        request_hash,
        request_payload
    ) VALUES (
        v_operation_id,
        p_rpc_name,
        v_actor_id,
        v_actor_role,
        v_request_hash,
        v_request_payload
    )
    ON CONFLICT (operation_id) DO NOTHING;
    v_claimed := FOUND;

    IF NOT v_claimed THEN
        SELECT * INTO v_existing
        FROM offline_sync_private.operation_results
        WHERE operation_id = v_operation_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Unable to read the existing idempotency record for operation %', v_operation_id;
        END IF;
        IF v_existing.rpc_name IS DISTINCT FROM p_rpc_name
           OR v_existing.actor_id IS DISTINCT FROM v_actor_id
           OR v_existing.actor_role IS DISTINCT FROM v_actor_role
           OR v_existing.request_hash IS DISTINCT FROM v_request_hash
           OR v_existing.request_payload IS DISTINCT FROM v_request_payload THEN
            RAISE EXCEPTION 'Operation ID % was already used with a different RPC, actor, or payload', v_operation_id;
        END IF;
        IF v_existing.response_payload IS NULL THEN
            RAISE EXCEPTION 'Operation ID % has no committed RPC result', v_operation_id;
        END IF;

        RETURN v_existing.response_payload || jsonb_build_object(
            '_sync_operation_id', v_operation_id,
            '_sync_replayed', TRUE
        );
    END IF;

    EXECUTE format('SELECT public.%I($1)', v_impl_name)
        INTO v_response
        USING v_request_payload;

    IF jsonb_typeof(v_response) <> 'object' OR v_response->'success' IS DISTINCT FROM 'true'::JSONB THEN
        RAISE EXCEPTION 'RPC % did not return a successful result for operation %', p_rpc_name, v_operation_id;
    END IF;

    -- Business-key duplicate guards do not prove that the prior row is this operation.
    -- Leave the local queue item for review instead of recording such a response as success.
    IF v_response->'duplicate_prevented' = 'true'::JSONB
       OR v_response->'already_closed' = 'true'::JSONB THEN
        RAISE EXCEPTION 'RPC % found an existing business record without a matching operation key', p_rpc_name;
    END IF;

    UPDATE offline_sync_private.operation_results
    SET response_payload = v_response,
        completed_at = clock_timestamp()
    WHERE operation_id = v_operation_id;

    RETURN v_response || jsonb_build_object(
        '_sync_operation_id', v_operation_id,
        '_sync_replayed', FALSE
    );
END;
$function$;

REVOKE ALL ON FUNCTION offline_sync_private.run_operation(TEXT, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_close_pos_shift(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_close_pos_shift', p_data);
    END IF;
    RETURN public.rpc_close_pos_shift__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_receipt_voucher(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_receipt_voucher', p_data);
    END IF;
    RETURN public.rpc_process_receipt_voucher__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_payment_voucher(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_payment_voucher', p_data);
    END IF;
    RETURN public.rpc_process_payment_voucher__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_stock_transfer(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_stock_transfer', p_data);
    END IF;
    RETURN public.rpc_process_stock_transfer__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_inventory_adjustment(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_inventory_adjustment', p_data);
    END IF;
    RETURN public.rpc_process_inventory_adjustment__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_settle_fleet_trip(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_settle_fleet_trip', p_data);
    END IF;
    RETURN public.rpc_settle_fleet_trip__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_sales_invoice(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_sales_invoice', p_data);
    END IF;
    RETURN public.rpc_process_sales_invoice__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_process_purchase_invoice(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_process_purchase_invoice', p_data);
    END IF;
    RETURN public.rpc_process_purchase_invoice__sync_impl(p_data);
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_close_financial_period(p_data JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
BEGIN
    IF p_data ? '_sync_operation_id' THEN
        RETURN offline_sync_private.run_operation('rpc_close_financial_period', p_data);
    END IF;
    RETURN public.rpc_close_financial_period__sync_impl(p_data);
END;
$function$;

-- New wrapper functions inherit the migration role's default ACL. Remove it,
-- then copy each original function's effective EXECUTE grantees and grant options.
DO $copy_acl$ DECLARE
    v_rpc_name TEXT;
    v_original_owner OID;
    v_original_owner_name TEXT;
    v_migration_owner OID;
    v_wrapper_owner OID;
    v_wrapper_acl ACLITEM[];
    v_acl_entry RECORD;
    v_grantee TEXT;
    v_grant_option TEXT;
BEGIN
    SELECT oid INTO v_migration_owner
    FROM pg_catalog.pg_roles
    WHERE rolname = current_user;

    FOR v_rpc_name IN
        SELECT DISTINCT rpc_name FROM pg_temp._phase3_sync_rpc_acl_snapshot
    LOOP
        SELECT DISTINCT owner_oid
        INTO v_original_owner
        FROM pg_temp._phase3_sync_rpc_acl_snapshot
        WHERE rpc_name = v_rpc_name;

        SELECT rolname INTO v_original_owner_name
        FROM pg_catalog.pg_roles
        WHERE oid = v_original_owner;

        EXECUTE format(
            'ALTER FUNCTION public.%I(jsonb) OWNER TO %I',
            v_rpc_name,
            v_original_owner_name
        );

        IF v_original_owner <> v_migration_owner THEN
            EXECUTE format('GRANT USAGE ON SCHEMA offline_sync_private TO %I', v_original_owner_name);
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION offline_sync_private.run_operation(text, jsonb) TO %I',
                v_original_owner_name
            );
        END IF;

        SELECT p.proowner, COALESCE(p.proacl, acldefault('f', p.proowner))
        INTO v_wrapper_owner, v_wrapper_acl
        FROM pg_catalog.pg_proc p
        WHERE p.oid = to_regprocedure(format('public.%I(jsonb)', v_rpc_name));

        FOR v_acl_entry IN
            SELECT DISTINCT grant_entry.grantee, grantee_role.rolname
            FROM aclexplode(v_wrapper_acl) AS grant_entry
            LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = grant_entry.grantee
            WHERE grant_entry.privilege_type = 'EXECUTE'
              AND grant_entry.grantee <> v_wrapper_owner
        LOOP
            v_grantee := CASE
                WHEN v_acl_entry.grantee = 0 THEN 'PUBLIC'
                ELSE quote_ident(v_acl_entry.rolname)
            END;
            EXECUTE format('REVOKE ALL ON FUNCTION public.%I(jsonb) FROM %s', v_rpc_name, v_grantee);
        END LOOP;

        FOR v_acl_entry IN
            SELECT snapshot.grantee_oid, snapshot.owner_oid, snapshot.is_grantable,
                   grantee_role.rolname
            FROM pg_temp._phase3_sync_rpc_acl_snapshot snapshot
            LEFT JOIN pg_catalog.pg_roles grantee_role ON grantee_role.oid = snapshot.grantee_oid
            WHERE snapshot.rpc_name = v_rpc_name
              AND snapshot.privilege_type = 'EXECUTE'
              AND snapshot.grantee_oid <> v_wrapper_owner
            GROUP BY snapshot.grantee_oid, snapshot.owner_oid, snapshot.is_grantable, grantee_role.rolname
        LOOP
            v_grantee := CASE
                WHEN v_acl_entry.grantee_oid = 0 THEN 'PUBLIC'
                ELSE quote_ident(v_acl_entry.rolname)
            END;
            v_grant_option := CASE WHEN v_acl_entry.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END;
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION public.%I(jsonb) TO %s%s',
                v_rpc_name,
                v_grantee,
                v_grant_option
            );
        END LOOP;
    END LOOP;
END;
$copy_acl$;

DROP TABLE pg_temp._phase3_sync_rpc_acl_snapshot;
