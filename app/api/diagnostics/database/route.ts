import 'server-only';

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { DIAGNOSTIC_MIGRATIONS, SYNC_IDEMPOTENT_RPCS } from '@/lib/diagnostics/contracts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  });
}

function classifyDatabaseError(error: unknown): string {
  const code = String((error as { code?: unknown } | null)?.code || '');
  if (code === '28P01' || code === '28000') return 'readonly_database_auth_failed';
  if (code === '3D000') return 'database_name_not_found';
  if (code === '42501') return 'readonly_database_permission_denied';
  if (code === '57014') return 'database_query_timeout';
  if (code.startsWith('08')) return 'database_connection_failed';
  return 'database_query_failed';
}

export async function GET(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1];
  if (!token || token.length > 8192) {
    return jsonResponse({ available: false, code: 'authentication_required' }, 401);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse({ available: false, code: 'public_supabase_config_missing' }, 503);
  }

  const userClient = createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal || AbortSignal.timeout(8000),
      }),
    },
  });

  let authData: Awaited<ReturnType<typeof userClient.auth.getUser>>['data'];
  let authError: Awaited<ReturnType<typeof userClient.auth.getUser>>['error'];
  try {
    const authResult = await userClient.auth.getUser(token);
    authData = authResult.data;
    authError = authResult.error;
  } catch {
    return jsonResponse({ available: false, code: 'supabase_auth_unreachable' }, 503);
  }
  if (authError || !authData.user) {
    return jsonResponse({ available: false, code: 'authentication_invalid_or_expired' }, 401);
  }

  let profile: { role: string | null; is_admin: boolean | null } | null = null;
  let profileError: unknown = null;
  try {
    const profileResult = await userClient
      .from('profiles')
      .select('role, is_admin')
      .eq('id', authData.user.id)
      .maybeSingle();
    profile = profileResult.data;
    profileError = profileResult.error;
  } catch {
    return jsonResponse({ available: false, code: 'admin_profile_unavailable' }, 503);
  }

  if (profileError) {
    return jsonResponse({ available: false, code: 'admin_profile_unavailable' }, 503);
  }
  const allowedRoles = ['admin', 'super_admin', 'manager', 'مدير', 'مدير النظام'];
  if (!profile || (!allowedRoles.includes(String(profile.role || '').toLowerCase()) && profile.is_admin !== true)) {
    return jsonResponse({ available: false, code: 'administrator_required' }, 403);
  }

  const databaseUrl = process.env.SUPABASE_READONLY_DATABASE_URL;
  if (!databaseUrl) {
    return jsonResponse({ available: false, code: 'readonly_database_url_missing' });
  }

  let sql: ReturnType<typeof postgres>;
  try {
    sql = postgres(databaseUrl, {
      max: 1,
      idle_timeout: 10,
      connect_timeout: 15,
      prepare: false,
      ssl: 'require',
    });
  } catch {
    return jsonResponse({ available: false, code: 'database_connection_failed' });
  }

  try {
    const snapshot = await sql.begin('read only', async (tx) => {
      await tx`SET LOCAL statement_timeout = '15000ms'`;

      const [transactionMode] = await tx`
        SELECT current_setting('transaction_read_only') AS value
      `;
      if (transactionMode?.value !== 'on') {
        throw Object.assign(new Error('readonly_transaction_not_enforced'), { code: 'READONLY_NOT_ENFORCED' });
      }

      const [migrationRelation] = await tx`
        SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS relation_exists
      `;
      const migrationTableExists = Boolean(migrationRelation?.relation_exists);
      let migrationTableReadable = false;
      let appliedMigrations: Array<{ version: string; name: string }> = [];

      if (migrationTableExists) {
        const [migrationAccess] = await tx`
          SELECT COALESCE(
            has_table_privilege(current_user, to_regclass('supabase_migrations.schema_migrations'), 'SELECT'),
            FALSE
          ) AS can_read
        `;
        migrationTableReadable = Boolean(migrationAccess?.can_read);

        if (migrationTableReadable) {
          const migrationRows = await tx`
            SELECT version::text AS version, COALESCE(name::text, '') AS name
            FROM supabase_migrations.schema_migrations
            ORDER BY version::text
          ` as Array<{ version: string; name: string }>;
          appliedMigrations = migrationRows.filter((migration) =>
            DIAGNOSTIC_MIGRATIONS.some((expected) => expected.version === migration.version),
          );
        }
      }

      const [privateSchemaRow] = await tx`
        SELECT
          n.oid,
          EXISTS (
            SELECT 1 FROM aclexplode(COALESCE(n.nspacl, acldefault('n', n.nspowner))) acl
            WHERE acl.grantee = 0 AND acl.privilege_type = 'USAGE'
          ) AS public_usage
        FROM pg_catalog.pg_namespace n
        WHERE n.nspname = 'offline_sync_private'
      ` as Array<{ oid: number; public_usage: boolean }>;
      const privateSchemaExists = Boolean(privateSchemaRow);
      let privateTableExists = false;
      let privateRoleAccess = {
        publicUsage: Boolean(privateSchemaRow?.public_usage),
        anonUsage: false,
        authenticatedUsage: false,
        serviceRoleUsage: false,
        publicSelect: false,
        anonSelect: false,
        authenticatedSelect: false,
        serviceRoleSelect: false,
      };

      if (privateSchemaExists) {
        const [schemaAccess] = await tx`
          SELECT
            has_schema_privilege('anon', n.oid, 'USAGE') AS anon_usage,
            has_schema_privilege('authenticated', n.oid, 'USAGE') AS authenticated_usage,
            has_schema_privilege('service_role', n.oid, 'USAGE') AS service_role_usage
          FROM pg_catalog.pg_namespace n
          WHERE n.nspname = 'offline_sync_private'
        `;
        privateRoleAccess = {
          ...privateRoleAccess,
          anonUsage: Boolean(schemaAccess?.anon_usage),
          authenticatedUsage: Boolean(schemaAccess?.authenticated_usage),
          serviceRoleUsage: Boolean(schemaAccess?.service_role_usage),
        };

        const [privateTable] = await tx`
          SELECT
            EXISTS (
              SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
              WHERE acl.grantee = 0 AND acl.privilege_type = 'SELECT'
            ) AS public_select,
            has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
            has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select,
            has_table_privilege('service_role', c.oid, 'SELECT') AS service_role_select
          FROM pg_catalog.pg_class c
          JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'offline_sync_private'
            AND c.relname = 'operation_results'
            AND c.relkind IN ('r', 'p')
        `;

        privateTableExists = Boolean(privateTable);
        privateRoleAccess = {
          ...privateRoleAccess,
          publicSelect: Boolean(privateTable?.public_select),
          anonSelect: Boolean(privateTable?.anon_select),
          authenticatedSelect: Boolean(privateTable?.authenticated_select),
          serviceRoleSelect: Boolean(privateTable?.service_role_select),
        };
      }

      const postgrestSettings = await tx`
        SELECT configs.setting AS value, role.rolname AS role_name,
               settings.setrole = 0 AS database_level
        FROM pg_catalog.pg_db_role_setting settings
        LEFT JOIN pg_catalog.pg_roles role ON role.oid = settings.setrole
        CROSS JOIN LATERAL unnest(settings.setconfig) AS configs(setting)
        WHERE configs.setting LIKE 'pgrst.db_schemas=%'
          AND (role.rolname = 'authenticator' OR settings.setrole = 0)
          AND settings.setdatabase IN (
            0,
            (SELECT oid FROM pg_catalog.pg_database WHERE datname = current_database())
          )
        ORDER BY role.rolname NULLS FIRST
      ` as Array<{ value: string; role_name: string | null; database_level: boolean }>;
      const authenticatorSettings = postgrestSettings.filter((setting) => setting.role_name === 'authenticator');
      const effectivePostgrestSettings = authenticatorSettings.length
        ? authenticatorSettings
        : postgrestSettings.filter((setting) => setting.database_level);
      const exposedSchemas = effectivePostgrestSettings
        .map(({ value }) => value.slice(value.indexOf('=') + 1))
        .flatMap((value) => value.replace(/^['"]|['"]$/g, '').split(',').map((schema) => schema.trim()).filter(Boolean));

      const rpcRows = await tx`
        SELECT
          p.proname AS name,
          p.pronargs::int AS argument_count,
          p.proargnames[1] AS first_argument,
          pg_get_function_identity_arguments(p.oid) AS signature_arguments,
          p.proargtypes[0] = 'jsonb'::regtype AS single_jsonb_argument,
          pg_get_function_result(p.oid) AS result_type,
          pg_get_userbyid(p.proowner) AS owner,
          p.prosecdef AS security_definer,
          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
            'rpc_close_pos_shift',
            'rpc_process_receipt_voucher',
            'rpc_process_payment_voucher',
            'rpc_process_stock_transfer',
            'rpc_process_inventory_adjustment',
            'rpc_settle_fleet_trip',
            'rpc_process_sales_invoice',
            'rpc_process_purchase_invoice',
            'rpc_close_financial_period'
          )
        ORDER BY p.proname, p.oid
      ` as Array<{
        name: string;
        argument_count: number;
        first_argument: string | null;
        signature_arguments: string;
        single_jsonb_argument: boolean;
        result_type: string;
        owner: string;
        security_definer: boolean;
        anon_execute: boolean;
        authenticated_execute: boolean;
      }>;

      return {
        readonlyTransaction: true,
        migrations: {
          tableExists: migrationTableExists,
          readable: migrationTableReadable,
          expected: DIAGNOSTIC_MIGRATIONS,
          appliedVersions: appliedMigrations.map((migration) => migration.version),
        },
        privateSync: {
          schemaExists: privateSchemaExists,
          tableExists: privateTableExists,
          roleAccess: privateRoleAccess,
        },
        postgrest: {
          configurationFound: effectivePostgrestSettings.length > 0,
          exposedSchemas,
        },
        rpcs: rpcRows.map((rpc) => ({
          ...rpc,
          expectedContract: rpc.argument_count === 1
            && rpc.first_argument === 'p_data'
            && rpc.single_jsonb_argument
            && rpc.result_type.toLowerCase() === 'jsonb'
            && rpc.security_definer,
        })),
        expectedRpcNames: SYNC_IDEMPOTENT_RPCS,
      };
    });

    return jsonResponse({ available: true, snapshot });
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    return jsonResponse({
      available: false,
      code: code === 'READONLY_NOT_ENFORCED'
        ? 'readonly_transaction_not_enforced'
        : classifyDatabaseError(error),
    });
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}
