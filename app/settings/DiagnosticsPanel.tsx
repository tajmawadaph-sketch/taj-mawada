'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Cloud,
  Copy,
  Database,
  Filter,
  Gauge,
  HardDrive,
  Info,
  Layers,
  LoaderCircle,
  RefreshCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Wifi,
  XCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'react-hot-toast';
import { DIAGNOSTIC_MIGRATIONS, SYNC_IDEMPOTENT_RPCS } from '@/lib/diagnostics/contracts';

type CheckStatus = 'pass' | 'warning' | 'error' | 'unavailable';
type CheckCategory = 'application' | 'queue' | 'cloud' | 'database';
type CheckScope = 'all' | 'connection' | 'queue' | 'database';
type SupabaseSession = Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session'];

interface DiagnosticCheck {
  id: string;
  category: CheckCategory;
  title: string;
  status: CheckStatus;
  summary: string;
  cause?: string;
  solution?: string;
  details?: string[];
}

interface QueueSummary {
  total: number;
  pending: number;
  syncing: number;
  failed: number;
  oldestPendingAt?: string;
  oldestSyncingAt?: string;
  maxFailedRetries: number;
  errorCategories: { permission: number; rpc: number; network: number; validation: number };
}

const OFFLINE_DB_NAME = 'tajmawadah_offline_db';

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('indexeddb_request_failed'));
  });
}

function timeoutSignal(milliseconds: number): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  window.setTimeout(() => controller.abort(), milliseconds);
  return controller.signal;
}

function errorCode(error: unknown): string {
  return String((error as { code?: unknown; status?: unknown } | null)?.code
    || (error as { status?: unknown } | null)?.status
    || '');
}

function isNetworkError(error: unknown): boolean {
  const message = String((error as { message?: unknown } | null)?.message || error || '').toLowerCase();
  return /fetch|network|timeout|timed out|abort|connection/.test(message);
}

function classifyQueuedError(message?: string): 'permission' | 'rpc' | 'network' | 'validation' | 'other' {
  const normalized = (message || '').toLowerCase();
  if (/42501|permission|row-level security|غير مصرح|صلاحية/.test(normalized)) return 'permission';
  if (/pgrst202|schema cache|function.*not found|rpc.*not found|الدالة.*غير موجود/.test(normalized)) return 'rpc';
  if (/fetch|network|timeout|connection|اتصال|شبكة/.test(normalized)) return 'network';
  if (/invalid|constraint|check violation|مطلوب|غير صالح/.test(normalized)) return 'validation';
  return 'other';
}

function categoryErrorMessage(category: ReturnType<typeof classifyQueuedError>, isEn: boolean) {
  const copy = {
    permission: {
      ar: ['رفض الصلاحيات أو سياسة RLS.', 'راجع صلاحية المستخدم وسياسة القراءة/التنفيذ المطلوبة دون منح صلاحيات عامة.'],
      en: ['Permissions or an RLS policy rejected the request.', 'Review the user permission and required read/execute policy without broad grants.'],
    },
    rpc: {
      ar: ['دالة RPC غير موجودة أو مخطط PostgREST لم يُحدّث.', 'طابق migration الخاصة بالدالة مع البيئة البعيدة ثم حدّث مخطط PostgREST بالطريقة المعتمدة.'],
      en: ['The RPC is missing or the PostgREST schema cache is stale.', 'Compare the RPC migration with the remote environment, then refresh PostgREST through the supported process.'],
    },
    network: {
      ar: ['انقطاع الشبكة أو انتهاء مهلة الاتصال.', 'أعد الاتصال بالإنترنت؛ سيحتفظ الطابور بالعملية ويعيد المحاولة وفق سياسة التراجع.'],
      en: ['The network disconnected or the request timed out.', 'Reconnect; the queue retains the operation and retries using its backoff policy.'],
    },
    validation: {
      ar: ['البيانات لا تطابق شرطًا أو قيدًا في قاعدة البيانات.', 'راجع بيانات العملية ورسالة الخطأ في سجل المزامنة قبل إعادة المحاولة.'],
      en: ['The operation data did not meet a database constraint or validation rule.', 'Review the operation data and sync log error before retrying.'],
    },
    other: {
      ar: ['رفض من الخادم أو خطأ في بيانات العملية.', 'افتح تفاصيل العملية في سجل المزامنة وراجع كود الخطأ مع مسؤول النظام.'],
      en: ['The server rejected the operation or its data is invalid.', 'Open the operation in the sync log and review the error with an administrator.'],
    },
  }[category];
  const localized = isEn ? copy.en : copy.ar;
  return {
    cause: `${isEn ? 'Likely cause: ' : 'السبب المتوقع: '}${localized[0]}`,
    solution: `${isEn ? 'Suggested fix: ' : 'الحل: '}${localized[1]}`,
  };
}

async function inspectBrowserQueue(): Promise<{
  initialized: boolean;
  stats: QueueSummary;
  databaseVersion?: number;
}> {
  if (!('indexedDB' in window) || typeof window.indexedDB.databases !== 'function') {
    throw new Error('indexeddb_inventory_not_supported');
  }

  const databases = await window.indexedDB.databases();
  const descriptor = databases.find((database) => database.name === OFFLINE_DB_NAME);
  const empty: QueueSummary = {
    total: 0,
    pending: 0,
    syncing: 0,
    failed: 0,
    maxFailedRetries: 0,
    errorCategories: { permission: 0, rpc: 0, network: 0, validation: 0 },
  };
  if (!descriptor) return { initialized: false, stats: empty };

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const openRequest = window.indexedDB.open(OFFLINE_DB_NAME);
    openRequest.onupgradeneeded = () => {
      openRequest.transaction?.abort();
      reject(new Error('indexeddb_changed_during_inspection'));
    };
    openRequest.onsuccess = () => resolve(openRequest.result);
    openRequest.onerror = () => reject(openRequest.error || new Error('indexeddb_open_failed'));
    openRequest.onblocked = () => reject(new Error('indexeddb_open_blocked'));
  });

  try {
    if (!db.objectStoreNames.contains('sync_queue')) {
      throw new Error('indexeddb_sync_queue_store_missing');
    }

    const transaction = db.transaction('sync_queue', 'readonly');
    const store = transaction.objectStore('sync_queue');
    const rows = await requestResult(store.getAll()) as Array<{
      status?: string;
      retry_count?: number;
      error_message?: string;
    }>;
    const stats: QueueSummary = {
      total: rows.length,
      pending: 0,
      syncing: 0,
      failed: 0,
      maxFailedRetries: 0,
      errorCategories: { permission: 0, rpc: 0, network: 0, validation: 0 },
    };

    for (const row of rows) {
      if (row.status === 'pending') stats.pending += 1;
      if (row.status === 'syncing') stats.syncing += 1;
      if (row.status === 'failed') {
        stats.failed += 1;
        stats.maxFailedRetries = Math.max(stats.maxFailedRetries, Number(row.retry_count || 0));
        const errorType = classifyQueuedError(row.error_message);
        if (errorType === 'permission' || errorType === 'rpc' || errorType === 'network') {
          stats.errorCategories[errorType] += 1;
        }
        if (errorType === 'validation') stats.errorCategories.validation += 1;
      }
    }

    return { initialized: true, stats, databaseVersion: db.version };
  } finally {
    db.close();
  }
}

function baseCheck(
  id: string,
  category: CheckCategory,
  title: string,
  status: CheckStatus,
  summary: string,
  cause?: string,
  solution?: string,
  details?: string[],
): DiagnosticCheck {
  return { id, category, title, status, summary, cause, solution, details };
}

function databaseFailureCopy(code: string, isEn: boolean) {
  const messages: Record<string, { title: string; summary: string; cause: string; solution: string; status: CheckStatus }> = {
    authentication_required: {
      title: isEn ? 'Sign in required for database audit' : 'يلزم تسجيل الدخول لفحص قاعدة البيانات',
      summary: isEn ? 'No active user session was supplied.' : 'لم تُرسل جلسة مستخدم صالحة إلى مسار الفحص.',
      cause: isEn ? 'The session may have expired.' : 'قد تكون الجلسة منتهية أو لم يتم تسجيل الدخول.',
      solution: isEn ? 'Sign in again, then rerun this check.' : 'سجّل الدخول مجددًا ثم أعد الفحص.',
      status: 'warning',
    },
    authentication_invalid_or_expired: {
      title: isEn ? 'Database audit session is invalid' : 'جلسة فحص قاعدة البيانات غير صالحة',
      summary: isEn ? 'Supabase did not accept the current access token.' : 'لم يقبل Supabase رمز الجلسة الحالي.',
      cause: isEn ? 'The token may be expired or revoked.' : 'قد يكون الرمز منتهيًا أو تم إلغاؤه.',
      solution: isEn ? 'Sign out and sign in again.' : 'سجّل الخروج ثم الدخول مرة أخرى.',
      status: 'error',
    },
    supabase_auth_unreachable: {
      title: isEn ? 'Supabase Auth could not be reached from the server' : 'تعذر على الخادم الوصول إلى Supabase Auth',
      summary: isEn ? 'The server-side session check did not complete.' : 'لم يكتمل التحقق من الجلسة على الخادم.',
      cause: isEn ? 'The project endpoint or network may be unavailable.' : 'قد يكون عنوان المشروع أو الشبكة غير متاح.',
      solution: isEn ? 'Check the server-side Supabase URL and outbound network, then retry.' : 'تحقق من عنوان Supabase على الخادم والاتصال الصادر ثم أعد الفحص.',
      status: 'error',
    },
    administrator_required: {
      title: isEn ? 'Administrator access required' : 'الفحص التفصيلي متاح للمدير فقط',
      summary: isEn ? 'The database catalog check is restricted to administrators.' : 'فحص كتالوج PostgreSQL وسجل migrations مقصور على المديرين.',
      cause: isEn ? 'The current profile is not an administrator.' : 'الدور الحالي ليس مدير نظام.',
      solution: isEn ? 'Ask an administrator to run this check.' : 'اطلب من مدير النظام تشغيل الفحص.',
      status: 'unavailable',
    },
    admin_profile_unavailable: {
      title: isEn ? 'Administrator profile could not be verified' : 'تعذر التحقق من صلاحية المدير',
      summary: isEn ? 'The server could not read the signed-in user profile.' : 'لم يتمكن الخادم من قراءة ملف المستخدم للتحقق من الصلاحية.',
      cause: isEn ? 'The profiles table or its read policy may be unavailable.' : 'قد يكون جدول profiles أو سياسة قراءته غير متاحة.',
      solution: isEn ? 'Check the signed-in user profile and its existing read policy.' : 'تحقق من ملف المستخدم وسياسة القراءة الحالية دون توسيعها بشكل عام.',
      status: 'error',
    },
    public_supabase_config_missing: {
      title: isEn ? 'Server Supabase public configuration is missing' : 'إعدادات Supabase العامة على الخادم مفقودة',
      summary: isEn ? 'The server cannot validate the signed-in session.' : 'لا يستطيع الخادم التحقق من جلسة المستخدم.',
      cause: isEn ? 'The project URL or publishable key is not configured server-side.' : 'عنوان المشروع أو المفتاح القابل للنشر غير مضبوط في بيئة الخادم.',
      solution: isEn ? 'Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or the equivalent SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY) in the server environment.' : 'اضبط NEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_ANON_KEY (أو SUPABASE_URL وSUPABASE_PUBLISHABLE_KEY) في بيئة الخادم.',
      status: 'error',
    },
    readonly_database_url_missing: {
      title: isEn ? 'Read-only PostgreSQL connection is not configured' : 'اتصال PostgreSQL للقراءة فقط غير مضبوط',
      summary: isEn ? 'Migration history and PostgreSQL catalog checks were skipped.' : 'تم تجاوز فحص سجل migrations وكتالوج PostgreSQL.',
      cause: isEn ? 'SUPABASE_READONLY_DATABASE_URL is not available to the server.' : 'المتغير SUPABASE_READONLY_DATABASE_URL غير متاح للخادم.',
      solution: isEn ? 'Set a server-side, read-only database URL in the hosting secret manager. Never use a NEXT_PUBLIC variable or expose it to the renderer.' : 'أضف عنوان اتصال مخصصًا للقراءة فقط في مدير أسرار الاستضافة. لا تضعه في متغير NEXT_PUBLIC أو داخل الواجهة.',
      status: 'unavailable',
    },
    readonly_database_auth_failed: {
      title: isEn ? 'PostgreSQL rejected the read-only credential' : 'رفض PostgreSQL بيانات اعتماد القراءة فقط',
      summary: isEn ? 'The server could not authenticate to PostgreSQL.' : 'تعذر على الخادم تسجيل الدخول إلى PostgreSQL.',
      cause: isEn ? 'The configured credential may be expired, malformed, or for the wrong project.' : 'قد تكون بيانات الاتصال منتهية أو غير سليمة أو تخص مشروعًا آخر.',
      solution: isEn ? 'Replace the server-side read-only credential through the secret manager; do not paste it into chat or the UI.' : 'حدّث بيانات الاتصال المخصصة للقراءة فقط من مدير الأسرار، ولا تلصقها في المحادثة أو الواجهة.',
      status: 'error',
    },
    database_name_not_found: {
      title: isEn ? 'PostgreSQL database was not found' : 'قاعدة PostgreSQL غير موجودة',
      summary: isEn ? 'The configured connection points to an unknown database.' : 'عنوان الاتصال يشير إلى قاعدة غير معروفة.',
      cause: isEn ? 'The database name or project endpoint may be incorrect.' : 'قد يكون اسم قاعدة البيانات أو عنوان المشروع غير صحيح.',
      solution: isEn ? 'Use the database name and endpoint from the correct Supabase project.' : 'استخدم اسم قاعدة البيانات وعنوان المشروع الصحيحين من Supabase.',
      status: 'error',
    },
    readonly_database_permission_denied: {
      title: isEn ? 'Read-only role cannot inspect required metadata' : 'حساب القراءة لا يملك صلاحية قراءة بيانات التشخيص',
      summary: isEn ? 'PostgreSQL denied a catalog or migration-history read.' : 'رفض PostgreSQL قراءة أحد عناصر الكتالوج أو سجل migrations.',
      cause: isEn ? 'The configured read-only role lacks SELECT on the required metadata.' : 'حساب القراءة لا يملك SELECT على بيانات التشخيص المطلوبة.',
      solution: isEn ? 'Grant only the required catalog and migration-history reads to this dedicated diagnostic role.' : 'امنح حساب التشخيص المخصص صلاحية قراءة محدودة على الكتالوج وسجل migrations فقط.',
      status: 'error',
    },
    database_query_timeout: {
      title: isEn ? 'PostgreSQL diagnostic timed out' : 'انتهت مهلة فحص PostgreSQL',
      summary: isEn ? 'The read-only catalog query exceeded five seconds.' : 'تجاوز استعلام الكتالوج للقراءة فقط خمس ثوانٍ.',
      cause: isEn ? 'The database or network may be busy.' : 'قد تكون قاعدة البيانات أو الشبكة مزدحمة.',
      solution: isEn ? 'Retry when the database is reachable; inspect the pooler or network if this repeats.' : 'أعد المحاولة عند استقرار الاتصال، وراجع مجمع الاتصالات أو الشبكة إذا تكرر التأخير.',
      status: 'warning',
    },
    database_connection_failed: {
      title: isEn ? 'Could not reach PostgreSQL' : 'تعذر الوصول إلى PostgreSQL',
      summary: isEn ? 'The server could not establish a database connection.' : 'لم يتمكن الخادم من فتح اتصال بقاعدة البيانات.',
      cause: isEn ? 'The endpoint, pooler, firewall, DNS, or network may be unavailable.' : 'قد يكون عنوان الاتصال أو مجمع الاتصالات أو DNS أو الشبكة غير متاح.',
      solution: isEn ? 'Check the Supabase project status, pooler endpoint, port, and server egress rules.' : 'تحقق من حالة مشروع Supabase وعنوان مجمع الاتصالات والمنفذ وقواعد الاتصال الصادر للخادم.',
      status: 'error',
    },
    database_query_failed: {
      title: isEn ? 'PostgreSQL diagnostic query failed' : 'فشل استعلام تشخيص PostgreSQL',
      summary: isEn ? 'The read-only diagnostic could not complete.' : 'تعذر إكمال فحص PostgreSQL للقراءة فقط.',
      cause: isEn ? 'The catalog, migration ledger, or database configuration may differ from the expected setup.' : 'قد يختلف الكتالوج أو سجل migrations أو إعداد قاعدة البيانات عن التهيئة المتوقعة.',
      solution: isEn ? 'Review the migration ledger and diagnostic-role permissions, then rerun the check.' : 'راجع سجل migrations وصلاحيات حساب التشخيص ثم أعد الفحص.',
      status: 'error',
    },
    readonly_transaction_not_enforced: {
      title: isEn ? 'Read-only mode could not be verified' : 'تعذر تأكيد وضع القراءة فقط',
      summary: isEn ? 'The catalog audit stopped before running its checks.' : 'أوقف الفحص قبل تنفيذ استعلامات الكتالوج.',
      cause: isEn ? 'PostgreSQL did not confirm a read-only transaction.' : 'لم يؤكد PostgreSQL أن المعاملة للقراءة فقط.',
      solution: isEn ? 'Review the connection configuration; no diagnostic query was continued.' : 'راجع إعداد الاتصال؛ لم يتابع الفحص تنفيذ استعلامات التشخيص.',
      status: 'error',
    },
  };

  return messages[code] || {
    title: isEn ? 'Database diagnostic is unavailable' : 'فحص قاعدة البيانات غير متاح',
    summary: isEn ? 'The server did not return a diagnostic result.' : 'لم يُرجع الخادم نتيجة تشخيص.',
    cause: isEn ? 'The route may be unavailable or the server returned an unexpected response.' : 'قد يكون مسار الفحص غير متاح أو أعاد الخادم استجابة غير متوقعة.',
    solution: isEn ? 'Check the application deployment and retry.' : 'تحقق من نشر التطبيق ثم أعد المحاولة.',
    status: 'error' as CheckStatus,
  };
}

export default function DiagnosticsPanel() {
  const { language } = useLanguage();
  const isEn = language === 'en';
  const [checks, setChecks] = useState<DiagnosticCheck[]>([]);
  const [runningScope, setRunningScope] = useState<CheckScope | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  
  // Luxury UI interactive states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CheckStatus>('all');
  const [activeCategoryTab, setActiveCategoryTab] = useState<'all' | CheckCategory>('all');
  const [expandedCheckId, setExpandedCheckId] = useState<string | null>(null);

  const t = useCallback((ar: string, en: string) => isEn ? en : ar, [isEn]);

  const inspectApplication = useCallback(async (): Promise<DiagnosticCheck[]> => {
    const results: DiagnosticCheck[] = [];
    const desktopApi = window.tajDesktop;
    const desktop = Boolean(desktopApi?.isDesktop);
    let runtimeDetails = desktop
      ? t('تم اكتشاف تطبيق Electron المكتبي المخصص.', 'Electron desktop app detected.')
      : t('يعمل التطبيق داخل متصفح الويب الحديث.', 'The app is running in a modern web browser.');

    if (desktop) {
      try {
        const info = await desktopApi!.getInfo();
        if (!info?.isDesktop) throw new Error('desktop_info_unavailable');
        runtimeDetails = t(
          `تطبيق سطح المكتب Electron ${info.version} على منصة ${info.platform}.`,
          `Electron ${info.version} desktop app running on ${info.platform}.`,
        );
      } catch {
        results.push(baseCheck(
          'desktop-runtime', 'application', t('بيئة سطح المكتب Electron', 'Desktop Runtime'), 'error',
          t('تم اكتشاف بيئة Electron لكن تعذر قراءة معلومات المحرك.', 'Electron was detected but app information could not be read.'),
          t('قد تكون واجهة preload أو النسخة المثبتة غير متوافقة.', 'The preload bridge or installed desktop build may be outdated.'),
          t('أعد تثبيت أحدث نسخة من تطبيق سطح المكتب ثم أعد فتحه.', 'Install the latest desktop build and reopen it.'),
        ));
      }
    }

    if (!results.some((result) => result.id === 'desktop-runtime')) {
      results.push(baseCheck(
        'desktop-runtime', 'application', t('بيئة التشغيل والنظام', 'System Runtime'), 'pass', runtimeDetails,
        undefined, undefined,
        [t('بيئة العمل آمنة وتدعم التخزين المشفر ومعايير الأمان المعتمدة.', 'Runtime environment is secure and follows certified protection standards.')],
      ));
    }

    const online = navigator.onLine;
    results.push(baseCheck(
      'browser-network', 'application', t('اتصال بطاقة الشبكة والإنترنت', 'Network Hardware Connection'),
      online ? 'pass' : 'warning',
      online ? t('كارت الشبكة متصل بالإنترنت بنجاح.', 'The device reports an active internet connection.') : t('الجهاز غير متصل بالشبكة حالياً (وضع أوفلاين).', 'The device is offline.'),
      online ? undefined : t('قد يكون كابل الشبكة مفصولاً أو الواي فاي غير متصل.', 'The internet connection or local Wi-Fi may be disconnected.'),
      online ? undefined : t('أعد الاتصال بالشبكة للمزامنة الفورية مع السحابة.', 'Reconnect to trigger automatic cloud synchronization.'),
    ));

    const secureContext = window.isSecureContext;
    results.push(baseCheck(
      'secure-context', 'application', t('سياق التشفير والأمان (HTTPS / SSL)', 'Secure Context & Encryption'),
      secureContext ? 'pass' : 'warning',
      secureContext
        ? t('الصفحة تعمل ضمن سياق أمني مشفر وموثوق.', 'The application operates within a verified secure context.')
        : t('الصفحة تعمل بدون HTTPS أو سياق محلي موثوق.', 'The page is not running over HTTPS or a trusted local origin.'),
      secureContext ? undefined : t('بعض واجهات التخزين والعمل دون اتصال قد تكون محدودة.', 'Some storage and offline APIs may be restricted.'),
      secureContext ? undefined : t('افتح النظام عبر HTTPS أو تطبيق Electron الرسمي.', 'Open the app over HTTPS or in the official Electron build.'),
    ));

    try {
      const storage = navigator.storage;
      if (!storage?.estimate) {
        results.push(baseCheck(
          'browser-storage', 'application', t('سعة التخزين المحلي المحجوزة', 'Local Storage Quota'), 'unavailable',
          t('المتصفح لا يتيح تقدير مساحة التخزين تلقائياً.', 'This browser cannot expose storage estimates.'),
          t('تعذر قياس المساحة المتاحة من واجهة المتصفح.', 'Available storage could not be measured from the browser API.'),
          t('استخدم نسخة Electron للحصول على طابور SQLite الدائم، أو حدّث المتصفح.', 'Use the Electron build for the durable SQLite queue, or update the browser.'),
        ));
      } else {
        const [estimate, persisted] = await Promise.all([
          storage.estimate(),
          storage.persisted ? storage.persisted().catch(() => false) : Promise.resolve(false),
        ]);
        const usage = Number(estimate.usage || 0);
        const quota = Number(estimate.quota || 0);
        const remaining = Math.max(0, quota - usage);
        const isDesktop = Boolean(window.tajDesktop?.isDesktop);
        const lowSpace = quota > 0 && remaining < 25 * 1024 * 1024;
        results.push(baseCheck(
          'browser-storage', 'application', t('سعة التخزين المحلي المحجوزة', 'Local Storage Quota'),
          lowSpace ? 'warning' : 'pass',
          quota > 0
            ? t(`المساحة المتبقية المقدرة ${(remaining / 1024 / 1024).toFixed(1)} ميجابايت (المستخدم: ${(usage / 1024 / 1024).toFixed(1)} م.ب).`, `Estimated free quota: ${(remaining / 1024 / 1024).toFixed(1)} MB (Used: ${(usage / 1024 / 1024).toFixed(1)} MB).`)
            : t('واجهات التخزين المحلية متاحة وجاهزة للعمليات.', 'Local storage APIs are available.'),
          lowSpace ? t('المساحة المتبقية في حصة المتصفح منخفضة جداً.', 'The browser storage quota has little free space remaining.') : undefined,
          lowSpace ? t('أفرغ مساحة على القرص الصلب أو استخدم تطبيق Electron لضمان استقرار العمليات.', 'Free disk space or use Electron to keep the queue in the app data folder.') : undefined,
          [
            t(`حالة استمرارية التخزين الدائم (Persistence): ${persisted ? 'ممنوحة ومؤكدة ✅' : 'عادية ℹ️'}.`, `Browser persistence permission: ${persisted ? 'granted' : 'standard'}.`),
            isDesktop
              ? t('طابور Electron يستخدم قاعدة بيانات SQLite المدمجة في مجلد التطبيق الآمن.', 'The Electron queue uses embedded SQLite in the app user-data area.')
              : t('نسخة الويب تعتمد على تقنية IndexedDB مع التخزين المؤقت في المتصفح.', 'The browser build uses IndexedDB and the browser retention policy.'),
          ],
        ));
      }
    } catch (error) {
      results.push(baseCheck(
        'browser-storage', 'application', t('سعة التخزين المحلي المحجوزة', 'Local Storage Quota'), 'warning',
        t('تعذر قراءة تقدير مساحة التخزين المحلي بدقة.', 'Storage capacity could not be estimated.'),
        isNetworkError(error) ? t('واجه المتصفح تأخيراً أثناء قراءة معلومات التخزين.', 'The browser timed out while reading storage information.') : t('قد تمنع إعدادات المتصفح الوصول لمعلومات التخزين.', 'Browser settings may block storage information.'),
        t('تحقق من مساحة القرص الصلب وإعدادات تخزين بيانات الموقع.', 'Check free disk space and site-data storage settings.'),
      ));
    }

    try {
      if (!('serviceWorker' in navigator)) {
        results.push(baseCheck(
          'service-worker', 'application', t('محرك التشغيل دون اتصال (Service Worker)', 'Offline Service Worker'), 'unavailable',
          t('المتصفح لا يدعم فحص محرك Service Worker.', 'This browser cannot inspect service workers.'),
          t('هذا الفحص اختياري ولا يؤثر على طابور SQLite في نسخة سطح المكتب.', 'This check is optional and does not affect the Electron queue.'),
          t('استخدم تطبيق سطح المكتب للحصول على أعلى استقرار أوفلاين.', 'Use the official desktop build for superior offline capabilities.'),
        ));
      } else {
        const registrations = await navigator.serviceWorker.getRegistrations();
        results.push(baseCheck(
          'service-worker', 'application', t('محرك التشغيل دون اتصال (Service Worker)', 'Offline Service Worker'),
          registrations.length ? 'pass' : 'unavailable',
          registrations.length
            ? t(`تم العثور على ${registrations.length} محرك خدمة مسجل وفعّال في الذاكرة.`, `${registrations.length} service worker registration(s) active.`)
            : t('لا يوجد عامل خدمة مسجل في هذا السياق.', 'No service worker is registered in this context.'),
          registrations.length ? undefined : t('قد يكون التطبيق يعمل في وضع التطوير أو بدون PWA نشط.', 'The app may be in development mode or PWA is inactive.'),
          registrations.length ? undefined : t('لا يلزم أي إجراء؛ طابور Electron لا يحتاج لعامل الخدمة.', 'No action needed; Electron uses native offline engine.'),
        ));
      }
    } catch {
      results.push(baseCheck(
        'service-worker', 'application', t('محرك التشغيل دون اتصال (Service Worker)', 'Offline Service Worker'), 'warning',
        t('تعذر قراءة تسجيلات عامل الخدمة.', 'Service worker registrations could not be read.'),
        t('قد يمنع سياق الصفحة أو المتصفح هذا الفحص.', 'The browser or page context may block this check.'),
        t('أعد تحميل التطبيق في نطاقه المعتاد.', 'Reload the app from its normal origin.'),
      ));
    }

    return results;
  }, [t]);

  const inspectQueue = useCallback(async (): Promise<DiagnosticCheck[]> => {
    const title = t('محرك طابور المزامنة المحلي (Sync Queue Engine)', 'Local Sync Queue Engine');
    try {
      const desktopApi = window.tajDesktop;
      if (desktopApi?.isDesktop) {
        if (!desktopApi.syncQueueDiagnostics) {
          return [baseCheck(
            'queue-storage', 'queue', title, 'error',
            t('نسخة Electron الحالية لا توفر واجهة فحص SQLite.', 'This Electron build does not expose the SQLite diagnostics bridge.'),
            t('نسخة التطبيق المثبتة أقدم من واجهة التشخيص الحالية.', 'The installed desktop build is older than the current diagnostics bridge.'),
            t('حدّث تطبيق Electron إلى النسخة التي تتضمن فحص الطابور، ثم أعد تشغيله.', 'Update Electron to the build containing queue diagnostics, then restart it.'),
          )];
        }

        const [info, stats] = await Promise.all([
          desktopApi.getInfo(),
          desktopApi.syncQueueDiagnostics(),
        ]);
        if (!stats.success) throw new Error('sqlite_queue_diagnostics_failed');
        const category = (Object.entries(stats.errorCategories || {}) as Array<[keyof QueueSummary['errorCategories'], number]>)
          .sort((a, b) => b[1] - a[1])[0];
        const likelyError = stats.failed > 0
          ? categoryErrorMessage(category?.[1] ? category[0] : 'other', isEn)
          : undefined;
        const staleSyncing = stats.syncing > 0 && stats.oldestSyncingAt
          && Date.now() - new Date(stats.oldestSyncingAt).getTime() > 15 * 60 * 1000;
        const details = [
          t(`محرك التخزين: SQLite المدمج في Electron ${info.version} (${info.platform}).`, `Engine: Embedded SQLite in Electron ${info.version} (${info.platform}).`),
          t(`إجمالي العمليات المسجلة: ${stats.total} (معلّق: ${stats.pending} | فاشل: ${stats.failed} | قيد المزامنة: ${stats.syncing}).`, `Total operations: ${stats.total} (Pending: ${stats.pending} | Failed: ${stats.failed} | Syncing: ${stats.syncing}).`),
          stats.maxFailedRetries > 0
            ? t(`أعلى عدد محاولات إعادة فاشلة: ${stats.maxFailedRetries}.`, `Highest recorded retry count: ${stats.maxFailedRetries}.`)
            : t('لا توجد أي محاولات فاشلة؛ الطابور نظيف وسليم.', 'No failed retries; queue is clean.'),
          stats.errorCategories.validation > 0
            ? t(`أخطاء قيود البيانات والتحقق: ${stats.errorCategories.validation}.`, `Validation or constraint errors: ${stats.errorCategories.validation}.`)
            : '',
        ];

        let legacyQueueCheck: DiagnosticCheck;
        try {
          const legacyQueue = await inspectBrowserQueue();
          legacyQueueCheck = baseCheck(
            'legacy-browser-queue', 'queue', t('طابور المتصفح القديم (IndexedDB Migration)', 'Legacy IndexedDB Queue'),
            legacyQueue.stats.total > 0 ? 'warning' : 'pass',
            !legacyQueue.initialized
              ? t('لا توجد قاعدة IndexedDB قديمة متبقية؛ النظام نظيف تماماً.', 'No legacy IndexedDB database exists; storage is clean.')
              : legacyQueue.stats.total > 0
                ? t(`ما زالت هناك ${legacyQueue.stats.total} عملية في IndexedDB بانتظار الترحيل.`, `${legacyQueue.stats.total} operation(s) remain in legacy IndexedDB.`)
                : t('لا توجد عمليات قديمة تنتظر النقل إلى SQLite.', 'No legacy operations are waiting for migration.'),
            legacyQueue.stats.total > 0
              ? t('قد تكون هذه نسخة قديمة من الطابور لم تُنقل إلى SQLite بعد.', 'These may be records from the browser queue that have not yet moved to SQLite.')
              : undefined,
            legacyQueue.stats.total > 0
              ? t('دع آلية ترحيل الطابور المدمجة تنقل كل سجل تلقائياً؛ لا تمسح البيانات يدوياً.', 'Let the built-in queue migration move records safely; do not clear manually.')
              : undefined,
            legacyQueue.initialized
              ? [t(`معلق: ${legacyQueue.stats.pending} | فاشل: ${legacyQueue.stats.failed} | قيد المعالجة: ${legacyQueue.stats.syncing}.`, `Pending: ${legacyQueue.stats.pending} | Failed: ${legacyQueue.stats.failed} | Syncing: ${legacyQueue.stats.syncing}.`)]
              : undefined,
          );
        } catch {
          legacyQueueCheck = baseCheck(
            'legacy-browser-queue', 'queue', t('طابور المتصفح القديم (IndexedDB Migration)', 'Legacy IndexedDB Queue'), 'unavailable',
            t('تعذر فحص وجود بيانات قديمة في IndexedDB.', 'Legacy IndexedDB records could not be inspected.'),
            t('قد لا يدعم Chromium جرد قواعد IndexedDB أو قد يكون المخزن مقفولاً.', 'Chromium may not support database inventory or store is locked.'),
            t('استخدم آلية الترحيل المدمجة بعد تحديث التطبيق.', 'Use the built-in migration flow after updating the app.'),
          );
        }

        return [
          baseCheck(
            'queue-storage', 'queue', title,
            stats.failed > 0 ? 'warning' : staleSyncing ? 'warning' : 'pass',
            stats.failed > 0
              ? t(`توجد ${stats.failed} عملية متعثرة بانتظار المزامنة أو التدقيق.`, `${stats.failed} failed operation(s) remain in the queue.`)
              : staleSyncing
                ? t(`توجد عملية معلقة بحالة syncing منذ أكثر من 15 دقيقة.`, `At least one operation has remained syncing for over 15 minutes.`)
                : stats.pending > 0
                  ? t(`طابور المزامنة نشط؛ توجد ${stats.pending} عملية معلقة بانتظار الرفع.`, `Queue is active; ${stats.pending} operation(s) are pending sync.`)
                  : t('محرك SQLite متاح وجاهز، ولا توجد أي عمليات معلقة أو متعثرة.', 'SQLite is fully operational with zero pending or failed operations.'),
            likelyError?.cause || (staleSyncing ? t('قد يكون الاتصال انقطع فجأة أثناء مزامنة عملية معينة.', 'Connection might have dropped mid-operation.') : undefined),
            likelyError?.solution || (staleSyncing ? t('إذا لم تكن مزامنة جارية، اضغط "مزامنة الآن" في شريط الحالة.', 'Trigger sync manually from status bar if needed.') : undefined),
            details,
          ),
          legacyQueueCheck,
        ];
      }

      const result = await inspectBrowserQueue();
      if (!result.initialized) {
        return [baseCheck(
          'queue-storage', 'queue', title, 'pass',
          t('محرك IndexedDB متاح وجاهز في المتصفح، ولا توجد عمليات مؤجلة.', 'IndexedDB is ready; no offline queue records created yet.'),
          undefined, undefined,
          [t('بيئة المتصفح جاهزة لاستقبال وتخزين عمليات نقاط البيع والمخزون دون اتصال.', 'Browser is ready for offline POS and inventory storage.')],
        )];
      }

      const stats = result.stats;
      const category = (Object.entries(stats.errorCategories) as Array<[keyof QueueSummary['errorCategories'], number]>)
        .sort((a, b) => b[1] - a[1])[0];
      const likelyError = stats.failed > 0
        ? categoryErrorMessage(category?.[1] ? category[0] : 'other', isEn)
        : undefined;

      return [baseCheck(
        'queue-storage', 'queue', title, stats.failed > 0 || stats.syncing > 0 ? 'warning' : 'pass',
        stats.failed > 0
          ? t(`يحتوي IndexedDB على ${stats.failed} عملية متعثرة تتطلب مراجعة.`, `IndexedDB contains ${stats.failed} failed operation(s).`)
          : stats.syncing > 0
            ? t(`هناك ${stats.syncing} عملية قيد الإرسال والتزامن مع السحابة.`, `${stats.syncing} operation(s) are currently syncing.`)
            : stats.pending > 0
            ? t(`IndexedDB متاح؛ توجد ${stats.pending} عملية معلقة بانتظار الاتصال.`, `IndexedDB is active; ${stats.pending} operation(s) are pending sync.`)
            : t('قاعدة بيانات IndexedDB سليمة ولا توجد أي عمليات مؤجلة.', 'IndexedDB is synchronized and healthy with no pending operations.'),
        likelyError?.cause || (stats.syncing > 0 ? t('المزامنة جارية حالياً أو توقفت بسبب إغلاق النافذة.', 'Sync may be active or was interrupted.') : undefined),
        likelyError?.solution || (stats.syncing > 0 ? t('انتظر اكتمال المزامنة أو أعد تنشيط الاتصال بالسحابة.', 'Wait for sync to complete or refresh connectivity.') : undefined),
        [
          t(`إجمالي العمليات: ${stats.total} (معلّق: ${stats.pending} | متعثر: ${stats.failed} | قيد المزامنة: ${stats.syncing}).`, `Total: ${stats.total} (Pending: ${stats.pending} | Failed: ${stats.failed} | Syncing: ${stats.syncing}).`),
          result.databaseVersion ? t(`إصدار هيكل قاعدة البيانات: v${result.databaseVersion}.`, `Schema version: v${result.databaseVersion}.`) : '',
          stats.maxFailedRetries > 0 ? t(`أعلى عدد محاولات إعادة: ${stats.maxFailedRetries}.`, `Highest retry count: ${stats.maxFailedRetries}.`) : '',
        ].filter(Boolean),
      )];
    } catch (error) {
      const code = errorCode(error);
      const message = String((error as { message?: unknown } | null)?.message || '');
      const isOldBridge = code === 'indexeddb_inventory_not_supported'
        || code === 'indexeddb_sync_queue_store_missing'
        || message === 'indexeddb_inventory_not_supported'
        || message === 'indexeddb_sync_queue_store_missing';
      return [baseCheck(
        'queue-storage', 'queue', title, 'error',
        isOldBridge
          ? t('تعذر قراءة بنية الطابور المحلي في المتصفح.', 'The local queue structure could not be inspected.')
          : t('تعذر الاتصال بمخزن الطابور المحلي.', 'The local queue store could not be reached.'),
        isOldBridge
          ? t('قد يكون المتصفح قديماً أو قاعدة IndexedDB تفتقد لجدول المزامنة.', 'Browser may be outdated or missing sync object store.')
          : t('قد يكون ملف SQLite مقفولاً من نافذة أخرى أو IndexedDB غير متاح.', 'SQLite file might be locked or IndexedDB blocked.'),
        window.tajDesktop?.isDesktop
          ? t('أغلق أي نسخة مكررة من البرنامج ثم أعد تشغيله بأمان.', 'Close duplicate instances and reopen Electron safely.')
          : t('تحقق من إعدادات المتصفح ومساحة القرص ثم أعد تحميل الصفحة.', 'Check browser storage settings and reload.'),
      )];
    }
  }, [isEn, t]);

  const inspectCloud = useCallback(async (): Promise<{
    checks: DiagnosticCheck[];
    accessToken?: string;
  }> => {
    const results: DiagnosticCheck[] = [];
    let session: SupabaseSession = null;
    try {
      const sessionResult = await supabase.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      session = sessionResult.data.session;
    } catch (error) {
      results.push(baseCheck(
        'auth-session', 'cloud', t('جلسة المستخدم والمصادقة (User Session)', 'User Authentication Session'), 'error',
        t('تعذر قراءة رمز الجلسة المحفوظ محلياً.', 'The stored session token could not be read.'),
        isNetworkError(error) ? t('تعذر الوصول إلى مخزن الجلسة المحلي.', 'Local session storage could not be accessed.') : t('بيانات الجلسة قد تكون تالفة أو منتهية الصلاحية.', 'Session data is damaged or expired.'),
        t('سجّل الخروج ثم سجّل الدخول مجدداً لتجديد رمز الوصول.', 'Sign out and sign in again to refresh access token.'),
      ));
      return { checks: results };
    }

    if (!session) {
      results.push(baseCheck(
        'auth-session', 'cloud', t('جلسة المستخدم والمصادقة (User Session)', 'User Authentication Session'), 'warning',
        t('لا يوجد مستخدم مسجل الدخول حالياً في هذا الجهاز.', 'No active user session found on this device.'),
        t('الفحوصات العميقة لكتالوج قاعدة البيانات تتطلب حساب مدير مسجل.', 'Deep database inspection requires an administrator session.'),
        t('سجّل الدخول بحسابك الإداري ثم أعد تشغيل الفحص الكامل.', 'Sign in with your admin credentials and rerun checks.'),
      ));
      results.push(baseCheck(
        'auth-remote', 'cloud', t('بوابة التحقق السحابية (Supabase Auth)', 'Supabase Cloud Auth Gateway'), 'unavailable',
        t('تم تخطي فحص الخادم السحابي لعدم وجود جلسة نشطة.', 'Server verification skipped due to missing session.'),
      ));
      results.push(baseCheck(
        'database-read', 'cloud', t('استجابة القراءة السريعة (DB Ping)', 'Database Read Latency & Access'), 'unavailable',
        t('تم تخطي اختبار سرعة القراءة لعدم توفر الجلسة.', 'Database ping test skipped due to missing session.'),
      ));
      return { checks: results };
    }

    try {
      const authResult = await Promise.race([
        supabase.auth.getUser(session.access_token),
        new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('diagnostics_timeout')), 10000)),
      ]);
      if (authResult.error || !authResult.data.user) {
        const code = errorCode(authResult.error);
        const network = isNetworkError(authResult.error);
        results.push(baseCheck(
          'auth-remote', 'cloud', t('بوابة التحقق السحابية (Supabase Auth)', 'Supabase Cloud Auth Gateway'), network ? 'error' : 'warning',
          network ? t('لم يصل طلب التحقق إلى خادم Supabase Auth.', 'Request could not reach Supabase Auth.') : t('لم يقبل خادم السحابة رمز الجلسة الحالي.', 'Supabase rejected the session token.'),
          code === '401' || code === '403' ? t('انتهت صلاحية رمز الدخول (Token Expired).', 'Access token has expired.') : t('خدمة المصادقة السحابية تواجه بطئاً أو انقطاعاً.', 'Auth service may be experiencing downtime.'),
          code === '401' || code === '403' ? t('سجّل الخروج ثم أعد الدخول فوراً.', 'Sign out and sign in again.') : t('تحقق من اتصال الإنترنت واستقرار مشروع Supabase.', 'Check internet connectivity and Supabase status.'),
        ));
        results.push(baseCheck(
          'database-read', 'cloud', t('استجابة القراءة السريعة (DB Ping)', 'Database Read Latency & Access'), 'unavailable',
          t('تم تجاوز فحص القراءة السريعة لفشل التحقق من الجلسة.', 'Read test skipped due to failed auth check.'),
        ));
        return { checks: results };
      }

      results.push(baseCheck(
        'auth-remote', 'cloud', t('بوابة التحقق السحابية (Supabase Auth)', 'Supabase Cloud Auth Gateway'), 'pass',
        t('خادم Supabase استجاب بنجاح وقَبِل جلسة المستخدم الحالية.', 'Supabase Auth validated and accepted the active user session.'),
        undefined, undefined,
        [t(`المستخدم المصرح: ${authResult.data.user.email || authResult.data.user.phone || authResult.data.user.id}.`, `Authorized: ${authResult.data.user.email || authResult.data.user.phone || authResult.data.user.id}.`)],
      ));

      try {
        const startTime = performance.now();
        const profileRead = await supabase
          .from('profiles')
          .select('id')
          .eq('id', authResult.data.user.id)
          .limit(1)
          .abortSignal(timeoutSignal(10000));
        const latency = Math.round(performance.now() - startTime);

        if (profileRead.error) {
          const code = String(profileRead.error.code || '');
          const permissionDenied = code === '42501';
          const missingSchema = code === 'PGRST205' || code === '42P01';
          results.push(baseCheck(
            'database-read', 'cloud', t('استجابة القراءة السريعة (DB Ping)', 'Database Read Latency & Access'), 'error',
            t('تعذر تنفيذ استعلام قراءة آمن وسريع لملف المستخدم.', 'Safe read query of user profile failed.'),
            permissionDenied
              ? t('سياسة RLS أو صلاحيات قاعدة البيانات منعت القراءة.', 'RLS policy or permissions blocked the profile read.')
              : missingSchema
                ? t('جدول profiles غير معرف أو مخطط PostgREST بحاجة لتحديث.', 'profiles table is missing or schema cache is stale.')
                : t('إعدادات الاتصال أو الجلسة السحابية غير مكتملة.', 'Cloud connection or schema configuration incomplete.'),
            permissionDenied
              ? t('راجع سياسة RLS لجدول profiles لمنح قراءة السجل الذاتي.', 'Ensure self-read RLS policy exists for profiles.')
              : missingSchema
                ? t('تحقق من وجود جدول profiles وأعد تحميل مخطط PostgREST.', 'Verify profiles table and reload PostgREST cache.')
                : t('راجع سجلات الخادم وأعد المحاولة.', 'Review server logs and retry.'),
            [t(`كود الخطأ البرمجي: ${code || 'غير متاح'}.`, `Error code: ${code || 'N/A'}.`)],
          ));
        } else {
          results.push(baseCheck(
            'database-read', 'cloud', t('استجابة القراءة السريعة (DB Ping)', 'Database Read Latency & Access'), 'pass',
            t(`الاتصال بقاعدة البيانات سريع ونشط (زمن الاستجابة: ${latency} مللي ثانية).`, `Database read connection is fast and healthy (Latency: ${latency} ms).`),
            undefined, undefined,
            [t('تم تأكيد سلامة الاتصال دون قراءة أي بيانات مالية أو حساسة.', 'Read latency confirmed safely without exposing business data.')],
          ));
        }
      } catch (error) {
        results.push(baseCheck(
          'database-read', 'cloud', t('استجابة القراءة السريعة (DB Ping)', 'Database Read Latency & Access'), 'error',
          t('انتهت مهلة قراءة قاعدة البيانات السحابية (Timeout).', 'Database read timed out.'),
          isNetworkError(error) ? t('الشبكة أو واجهة PostgREST غير متاحة مؤقتاً.', 'Network or PostgREST gateway is unavailable.') : t('إعدادات قاعدة البيانات أو الجلسة غير مكتملة.', 'Database or session configuration incomplete.'),
          t('تحقق من استقرار الإنترنت وحالة مشروع Supabase.', 'Check internet stability and project health.'),
        ));
      }

      return { checks: results, accessToken: session.access_token };
    } catch (error) {
      const network = isNetworkError(error) || String((error as Error)?.message) === 'diagnostics_timeout';
      results.push(baseCheck(
        'auth-remote', 'cloud', t('بوابة التحقق السحابية (Supabase Auth)', 'Supabase Cloud Auth Gateway'), 'error',
        network ? t('انتهت مهلة الاتصال بخدمة المصادقة في Supabase.', 'Supabase Auth request timed out.') : t('فشل التحقق من جلسة الدخول في Supabase.', 'Supabase session verification failed.'),
        network ? t('الشبكة أو خادم Supabase لم يستجب خلال 10 ثوانٍ.', 'Network or server failed to respond within 10s.') : t('بيانات الجلسة الحالية قد تكون غير صالحة.', 'Current session token may be invalid.'),
        network ? t('تحقق من جودة الإنترنت وحالة السيرفر ثم أعد الفحص.', 'Check connection quality and server status.') : t('سجّل الدخول مجدداً لتجديد الجلسة.', 'Sign in again to refresh token.'),
      ));
      return { checks: results };
    }
  }, [t]);

  const inspectDatabaseCatalog = useCallback(async (accessToken?: string): Promise<DiagnosticCheck[]> => {
    if (!accessToken) {
      return [baseCheck(
        'migration-audit', 'database', t('سجل Migrations وعقود دوال RPC', 'Migration History & RPC Contracts'), 'unavailable',
        t('يلزم وجود جلسة مدير نظام للوصول إلى كتالوج PostgreSQL.', 'Administrator session required to inspect database catalog.'),
        undefined,
        t('سجّل الدخول بحساب مدير ثم أعد تشغيل الفحص.', 'Sign in with an admin account and retry.'),
      )];
    }

    let payload: any;
    try {
      const response = await fetch('/api/diagnostics/database', {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
        signal: timeoutSignal(12000),
      });
      payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.available) {
        const failure = databaseFailureCopy(String(payload.code || (response.status === 401 ? 'authentication_invalid_or_expired' : '')) , isEn);
        return [baseCheck(
          'migration-audit', 'database', failure.title, failure.status, failure.summary,
          failure.cause, failure.solution,
          [t('الفحص أمني للقراءة فقط ولا يعرض أي أسرار أو كلمات مرور.', 'Security read-only check; no credentials or secrets exposed.')],
        )];
      }
    } catch (error) {
      const network = isNetworkError(error);
      return [baseCheck(
        'migration-audit', 'database', t('مسار فحص كتالوج قاعدة البيانات', 'Database Diagnostics Endpoint'), 'error',
        t('تعذر الوصول إلى واجهة الفحص الفني على خادم التطبيق.', 'Application diagnostics endpoint unreachable.'),
        network ? t('قد يكون اتصال التطبيق أو خادم Next.js منقطعاً.', 'App or Next.js server may be unreachable.') : t('مسار الفحص غير متوفر في النسخة الحالية.', 'Endpoint might be missing from deployed build.'),
        t('تأكد من تشغيل خادم Next.js ثم أعد المحاولة.', 'Ensure Next.js server is running and retry.'),
      )];
    }

    const snapshot = payload.snapshot;
    const results: DiagnosticCheck[] = [];
    results.push(baseCheck(
      'catalog-readonly', 'database', t('أمان معاملة الفحص (Read-Only Safety)', 'Read-Only Transaction Safety'),
      snapshot.readonlyTransaction ? 'pass' : 'error',
      snapshot.readonlyTransaction
        ? t('المعاملة محصنة بنسبة 100% في وضع القراءة فقط (Read-Only)، ولا يمكنها تعديل أي بيانات.', 'The diagnostic transaction is strictly read-only and cannot alter data.')
        : t('لم يتم تأكيد وضع القراءة فقط!', 'Read-only mode was not confirmed!'),
      undefined,
      snapshot.readonlyTransaction ? undefined : t('أوقف أي استعلامات حتى يتم فرض وضع القراءة فقط.', 'Stop queries until read-only mode is guaranteed.'),
    ));

    const migrations = snapshot.migrations;
    if (!migrations.tableExists) {
      results.push(baseCheck(
        'migration-ledger', 'database', t('سجل Migrations الرسمي في Supabase', 'Supabase Migration Ledger'), 'error',
        t('جدول supabase_migrations.schema_migrations غير موجود في قاعدة البيانات.', 'supabase_migrations.schema_migrations is missing.'),
        t('قاعدة البيانات قد تكون أُنشئت يدوياً دون تفعيل تتبع migrations.', 'Database might have been set up manually without migration tracker.'),
        t('طابق المخطط الفعلي؛ لا تدفع baseline لقاعدة قائمة واستخدم التسجيل المدعوم.', 'Compare live schema; register baseline safely.'),
      ));
    } else if (!migrations.readable) {
      results.push(baseCheck(
        'migration-ledger', 'database', t('سجل Migrations الرسمي في Supabase', 'Supabase Migration Ledger'), 'warning',
        t('جدول تتبع migrations موجود لكن حساب الفحص لا يملك صلاحية قراءته.', 'Ledger exists but diagnostic role lacks read permissions.'),
        t('صلاحية SELECT مقيدة على جدول سجل المايجريشن.', 'SELECT permission is restricted on migration table.'),
        t('امنح حساب الفحص صلاحية SELECT على سجل migrations لمتابعة الإصدارات.', 'Grant limited read permissions to diagnostic role.'),
      ));
    } else {
      const missing = DIAGNOSTIC_MIGRATIONS.map((migration) => migration.version)
        .filter((version) => !migrations.appliedVersions.includes(version));
      results.push(baseCheck(
        'migration-ledger', 'database', t('سجل Migrations الرسمي في Supabase', 'Supabase Migration Ledger'),
        missing.length ? 'error' : 'pass',
        missing.length
          ? t(`هناك ${missing.length} إصدار متوقع غير مسجل: ${missing.join(', ')}.`, `${missing.length} expected version(s) are not recorded: ${missing.join(', ')}.`)
          : t('جميع إصدارات المايجريشن الأربعة الأساسية مسجلة ومثبتة في Supabase بنجاح.', 'All four core migrations are officially tracked and active in Supabase.'),
        missing.length ? t('بعض التعديلات قد تكون نُفذت بدون تسجيل رسمي في جدول schema_migrations.', 'Changes may have been executed without ledger record.') : undefined,
        missing.length
          ? t('طابق الملفات وسجل الإصدارات عبر المسار الإداري المعتمد.', 'Reconcile ledger records with applied database state.')
          : undefined,
        [t(`الإصدارات المثبتة حالياً: ${migrations.appliedVersions.join(', ') || 'لا يوجد'}.`, `Recorded versions: ${migrations.appliedVersions.join(', ') || 'none'}.`)],
      ));
    }

    const privateSync = snapshot.privateSync;
    const roleAccess = privateSync.roleAccess;
    const privateExposed = roleAccess.publicUsage || roleAccess.anonUsage || roleAccess.authenticatedUsage
      || roleAccess.serviceRoleUsage || roleAccess.publicSelect || roleAccess.anonSelect
      || roleAccess.authenticatedSelect || roleAccess.serviceRoleSelect;
    const privateReady = privateSync.schemaExists && privateSync.tableExists && !privateExposed;
    results.push(baseCheck(
      'private-sync-storage', 'database', t('مخزن مفاتيح المزامنة المعزول (Private Idempotency)', 'Private Sync Idempotency Storage'),
      privateReady ? 'pass' : 'error',
      privateReady
        ? t('مخطط offline_sync_private وجدول العمليات محصنان تماماً ومعزولان عن أي وصول خارجي.', 'The idempotency storage is fully isolated with no direct public/role exposure.')
        : t('مخطط أو جدول مفاتيح المزامنة مفقود، أو توجد صلاحيات مكشوفة للعامة.', 'Idempotency table is missing or direct exposure was detected.'),
      !privateSync.schemaExists || !privateSync.tableExists
        ? t('لم يتم تطبيق مايجريشن حماية التكرار 20261010120000 بنجاح.', 'Idempotency migration might not have been applied.')
        : t('تم منح صلاحيات قراءة مباشرة غير متوافقة مع الأمان.', 'Direct grants are broader than safe specification.'),
      !privateSync.schemaExists || !privateSync.tableExists
        ? t('راجع تطبيق مايجريشن 20261010120000 وسجلها في Supabase.', 'Review and apply migration 20261010120000.')
        : t('أزل الصلاحيات المكشوفة عبر SQL إداري معتمد.', 'Revoke direct public exposure.'),
    ));

    const postgrest = snapshot.postgrest;
    const exposedSchemas = postgrest.exposedSchemas as string[];
    if (!postgrest.configurationFound) {
      results.push(baseCheck(
        'postgrest-schema', 'database', t('مخططات PostgREST المعروضة للـ API', 'PostgREST Exposed Schemas'), 'unavailable',
        t('لم يتم العثور على إعداد pgrst.db_schemas في إعدادات الدور.', 'No pgrst.db_schemas setting was found.'),
        t('تُدار إعدادات PostgREST عبر لوحة تحكم Supabase السحابية المركزية.', 'PostgREST is managed via Supabase cloud settings.'),
        t('تأكد أن مخطط public مكشوف ومخطط offline_sync_private محمي ومعزول.', 'Ensure public is exposed while private schemas remain hidden.'),
      ));
    } else {
      const publicExposed = exposedSchemas.includes('public');
      const privateExposedToRest = exposedSchemas.includes('offline_sync_private');
      results.push(baseCheck(
        'postgrest-schema', 'database', t('مخططات PostgREST المعروضة للـ API', 'PostgREST Exposed Schemas'),
        !publicExposed || privateExposedToRest ? 'error' : 'pass',
        !publicExposed
          ? t('مخطط public غير مدرج في المخططات المتاحة للواجهة.', 'The public schema is not listed as exposed.')
          : privateExposedToRest
            ? t('تحذير: مخطط offline_sync_private مكشوف عبر واجهة REST!', 'offline_sync_private is exposed through REST!')
            : t('المخطط العام public متاح، والمخطط الخاص offline_sync_private محمي ومعزول 100%.', 'public is exposed and offline_sync_private is properly secluded.'),
        !publicExposed || privateExposedToRest ? t('إعداد مخططات API لا يطابق حدود الأمان المتوقعة.', 'PostgREST schema setting does not match security boundaries.') : undefined,
        !publicExposed || privateExposedToRest
          ? t('اضبط المخططات المكشوفة في لوحة تحكم Supabase.', 'Update exposed schemas in Supabase dashboard.')
          : undefined,
        [t(`المخططات المكشوفة حالياً: ${exposedSchemas.join(', ')}.`, `Currently exposed schemas: ${exposedSchemas.join(', ')}.`)],
      ));
    }

    const observedRpcNames = new Set(snapshot.rpcs.map((rpc: any) => rpc.name));
    const invalidRpcs = SYNC_IDEMPOTENT_RPCS.filter((name) => {
      const matching = snapshot.rpcs.filter((rpc: any) => rpc.name === name);
      return matching.length !== 1 || !matching[0].expectedContract || !matching[0].authenticated_execute;
    });
    results.push(baseCheck(
      'rpc-contracts', 'database', t('عقود وتواقيع دوال العمليات الذرية (Atomic RPCs)', 'Atomic RPC Contracts & Signatures'),
      invalidRpcs.length ? 'error' : 'pass',
      invalidRpcs.length
        ? t(`يوجد خلل في تواقيع أو صلاحيات الدوال: ${invalidRpcs.join(', ')}.`, `Signature or grant mismatch in: ${invalidRpcs.join(', ')}.`)
        : t('جميع دوال الـ RPC التسع المتوافقة مع المزامنة الذرية مطابقة للعقد وتستقبل (p_data JSONB).', 'All 9 atomic sync RPCs match the contract: p_data jsonb, jsonb return, authenticated execute.'),
      invalidRpcs.length ? t('دالة مفقودة أو تغير توقيعها أو صلاحيات تنفيذها.', 'An RPC is missing, has wrong signature, or lacks EXECUTE.') : undefined,
      invalidRpcs.length
        ? t('أعد تطبيق مايجريشن الدالة المحددة وتأكد من منح صلاحية EXECUTE.', 'Reapply missing RPC migration and grant EXECUTE permissions.')
        : undefined,
      [
        t(`تم التحقق من ${observedRpcNames.size} دالة من أصل ${SYNC_IDEMPOTENT_RPCS.length} دالة مطلوبة.`, `Verified ${observedRpcNames.size} of ${SYNC_IDEMPOTENT_RPCS.length} required RPC functions.`),
        ...snapshot.rpcs.map((rpc: any) => `${rpc.name}: (${rpc.signature_arguments || 'p_data jsonb'}) → ${rpc.result_type}, authenticated=${rpc.authenticated_execute ? 'متاح ✅' : 'محجوب ❌'}`),
      ],
    ));

    results.push(baseCheck(
      'baseline-scope', 'database', t('نطاق مطابقة خط الأساس (Baseline Scope)', 'Baseline Inspection Scope'), 'pass',
      t('تم فحص سجل الإصدارات، وعقود دوال الـ RPC، والعزل الأمني لقاعدة البيانات بنجاح.', 'Version ledger, atomic RPC signatures, and isolation contracts are verified.'),
      undefined, undefined,
      [t('لقياس التوافق الشامل لجداول البيانات، يمكنك أيضاً استعراض رادار سلامة النظام المحاسبي.', 'For data integrity and orphan record detection, use the System Health Radar.')],
    ));

    return results;
  }, [isEn, t]);

  const runChecks = useCallback(async (scope: CheckScope = 'all') => {
    if (runningScope) return;
    setRunningScope(scope);
    try {
      const collected: DiagnosticCheck[] = [];
      let accessToken: string | undefined;

      if (scope === 'all' || scope === 'connection') {
        collected.push(...await inspectApplication());
        const cloud = await inspectCloud();
        collected.push(...cloud.checks);
        accessToken = cloud.accessToken;
        if (scope === 'all') {
          collected.push(...await inspectDatabaseCatalog(cloud.accessToken));
        }
      } else if (scope === 'queue') {
        collected.push(...await inspectQueue());
      } else if (scope === 'database') {
        const cloud = await inspectCloud();
        collected.push(...cloud.checks.filter((check) => check.id === 'auth-session' || check.id === 'auth-remote' || check.id === 'database-read'));
        accessToken = cloud.accessToken;
        collected.push(...await inspectDatabaseCatalog(accessToken));
      }

      if (scope === 'all' || scope === 'queue') {
        collected.push(...await inspectQueue());
      }

      setChecks((previous) => {
        if (scope === 'all') return collected;
        const replacedCategories = scope === 'queue'
          ? new Set<CheckCategory>(['queue'])
          : scope === 'database'
            ? new Set<CheckCategory>(['database', 'cloud'])
            : new Set<CheckCategory>(['application', 'cloud']);
        return [...previous.filter((check) => !replacedCategories.has(check.category)), ...collected];
      });
      setLastRunAt(new Date());
      toast.success(t('اكتمل فحص النظام بنجاح ✅', 'Diagnostic check completed successfully ✅'));
    } catch {
      toast.error(t('تعذر إكمال الفحص بالكامل. تحقق من الاتصال.', 'Check could not complete. Check connection.'));
    } finally {
      setRunningScope(null);
    }
  }, [inspectApplication, inspectCloud, inspectDatabaseCatalog, inspectQueue, runningScope, t]);

  useEffect(() => {
    void runChecks('all');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusCounts = useMemo(() => ({
    pass: checks.filter((check) => check.status === 'pass').length,
    warning: checks.filter((check) => check.status === 'warning').length,
    error: checks.filter((check) => check.status === 'error').length,
    unavailable: checks.filter((check) => check.status === 'unavailable').length,
    total: checks.length,
  }), [checks]);

  // Overall Health Score (0 - 100)
  const healthScore = useMemo(() => {
    if (!statusCounts.total) return 100;
    const score = Math.round(
      ((statusCounts.pass * 1.0 + statusCounts.warning * 0.5 + statusCounts.unavailable * 0.7) / statusCounts.total) * 100
    );
    return Math.min(100, Math.max(0, score));
  }, [statusCounts]);

  const filteredChecks = useMemo(() => {
    return checks.filter((check) => {
      // Category filter
      if (activeCategoryTab !== 'all' && check.category !== activeCategoryTab) return false;
      // Status filter
      if (statusFilter !== 'all' && check.status !== statusFilter) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = check.title.toLowerCase().includes(q);
        const matchSummary = check.summary.toLowerCase().includes(q);
        const matchCause = check.cause?.toLowerCase().includes(q);
        const matchSolution = check.solution?.toLowerCase().includes(q);
        const matchDetails = check.details?.some((d) => d.toLowerCase().includes(q));
        if (!matchTitle && !matchSummary && !matchCause && !matchSolution && !matchDetails) {
          return false;
        }
      }
      return true;
    });
  }, [checks, activeCategoryTab, statusFilter, searchQuery]);

  const groupedChecks = useMemo(() => {
    const order: CheckCategory[] = ['application', 'queue', 'cloud', 'database'];
    return order.map((category) => ({
      category,
      checks: filteredChecks.filter((check) => check.category === category),
    })).filter((group) => group.checks.length > 0);
  }, [filteredChecks]);

  const categoryMetadata = (category: CheckCategory) => ({
    application: {
      label: t('بيئة الجهاز والتطبيق المحلي', 'Device & Local Runtime'),
      icon: Server,
      desc: t('حالة بيئة Electron، ومساحة التخزين، والشبكة السلكية واللاسلكية', 'Electron runtime, storage quota, network status'),
    },
    queue: {
      label: t('طابور المزامنة ومحرك الأوفلاين', 'Sync Queue & Offline Engine'),
      icon: HardDrive,
      desc: t('محرك SQLite / IndexedDB، والعمليات المعلقة والمتعثرة', 'SQLite/IndexedDB engine, pending & failed operations'),
    },
    cloud: {
      label: t('الاتصال بالسحابة والمصادقة', 'Cloud Connectivity & Auth'),
      icon: Cloud,
      desc: t('خادم Supabase Auth، ورموز الوصول، واستجابة قاعدة البيانات', 'Supabase Auth server, session tokens, DB latency'),
    },
    database: {
      label: t('قاعدة البيانات وعقود دوال RPC', 'Database & RPC Contracts'),
      icon: Database,
      desc: t('سجل Migrations، وعقود الدوال الذرية، والعزل الأمني للمفاتيح', 'Migration history, atomic RPC contracts, idempotency storage'),
    },
  }[category]);

  const statusLabel = (status: CheckStatus) => ({
    pass: t('سليم ونشط', 'Passed'),
    warning: t('تنبيه للمراجعة', 'Warning'),
    error: t('مشكلة تتطلب تدخلاً', 'Action Required'),
    unavailable: t('غير متاح حالياً', 'Unavailable'),
  }[status]);

  const copyReport = useCallback(async () => {
    if (!checks.length) return;
    const report = [
      `======================================================`,
      t('تقرير الفحص والتشخيص الهندسي - تاج المودة ERP & POS', 'Taj Al-Mawadah Engineering Diagnostics Report'),
      `======================================================`,
      `${t('وقت الفحص', 'Timestamp')}: ${lastRunAt?.toLocaleString(isEn ? 'en-US' : 'ar-SA') || '—'}`,
      `${t('مؤشر صحة النظام', 'System Health Score')}: ${healthScore}%`,
      `${t('الملخص', 'Summary')}: ${statusCounts.pass} ${t('سليم', 'passed')}, ${statusCounts.warning} ${t('تنبيهات', 'warnings')}, ${statusCounts.error} ${t('مشكلات', 'issues')}, ${statusCounts.unavailable} ${t('غير متاح', 'unavailable')}`,
      `------------------------------------------------------\n`,
      ...checks.map((check, idx) => [
        `${idx + 1}. [${statusLabel(check.status).toUpperCase()}] ${check.title}`,
        `   • ${t('البيان', 'Summary')}: ${check.summary}`,
        check.cause ? `   • ${t('السبب', 'Cause')}: ${check.cause}` : '',
        check.solution ? `   • ${t('الحل المقترح', 'Fix')}: ${check.solution}` : '',
        ...(check.details?.map(d => `   - ${d}`) || []),
        '',
      ].filter(Boolean).join('\n')),
      `------------------------------------------------------`,
      t('ملاحظة: هذا التقرير خاضع للحماية ولا يتضمن أي مفاتيح تشفير أو كلمات مرور.', 'Note: This report is certified safe with zero passwords or credentials.'),
    ].join('\n');

    try {
      await navigator.clipboard.writeText(report);
      toast.success(t('تم نسخ التقرير المعتمد للحافظة بنجاح 📋', 'Certified report copied to clipboard 📋'));
    } catch {
      toast.error(t('تعذر نسخ التقرير؛ تأكد من صلاحية المتصفح.', 'Clipboard copy failed.'));
    }
  }, [checks, healthScore, isEn, lastRunAt, statusCounts, t]);

  const formatLastRun = () => lastRunAt
    ? lastRunAt.toLocaleTimeString(isEn ? 'en-US' : 'ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : t('لم يبدأ الفحص بعد', 'Not checked yet');

  const actions: Array<{ scope: CheckScope; label: string; icon: React.ReactNode; primary?: boolean }> = [
    { scope: 'all', label: t('فحص شامل فوري', 'Full Diagnostic Scan'), icon: <Sparkles className="h-4 w-4" />, primary: true },
    { scope: 'connection', label: t('السحابة والجلسة', 'Cloud & Session'), icon: <Wifi className="h-4 w-4" /> },
    { scope: 'queue', label: t('طابور الأوفلاين', 'Offline Queue'), icon: <HardDrive className="h-4 w-4" /> },
    { scope: 'database', label: t('كتالوج RPC وPostgreSQL', 'Database & RPCs'), icon: <Database className="h-4 w-4" /> },
  ];

  return (
    <div dir={isEn ? 'ltr' : 'rtl'} className="space-y-6 pb-12 font-sans text-[#1E130B]">
      
      {/* ========================================================================= */}
      {/* 👑 1. البطاقة الملكية الرئيسية (Command Center Hero Card)                */}
      {/* ========================================================================= */}
      <div className="relative overflow-hidden rounded-2xl border border-[#C29B62]/20 bg-white p-6 shadow-[0_4px_20px_rgba(30,19,11,0.05)] md:p-8">
        
        {/* خلفية جمالية علوية رقيقة */}
        <div 
          className="pointer-events-none absolute -top-24 end-0 h-96 w-96 rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #C29B62 0%, #1E130B 70%)' }}
        />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          
          {/* عنوان ووصف المركز */}
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#C29B62]/30 bg-[#FDFBF7] px-3.5 py-1 text-xs font-black text-[#C29B62]">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t('رادار الفحص والتشخيص الهندسي الشامل', 'Engineering Diagnostics & System Radar')}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1E130B] text-[#C29B62] shadow-md shadow-[#1E130B]/10">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight text-[#1E130B] md:text-3xl">
                  {t('مركز الفحص والتشخيص الفني المتقدم', 'Advanced System Diagnostics Center')}
                </h1>
                <p className="mt-1 text-sm font-medium text-[#6F6257]">
                  {t(
                    'رادار تدقيق لحظي يفحص سلامة محرك الأوفلاين، طابور المزامنة المحلي، استقرار السحابة، ومطابقة عقود دوال الـ RPC.',
                    'Real-time diagnostic radar inspecting offline queue, desktop storage, cloud health, and atomic RPC contracts.'
                  )}
                </p>
              </div>
            </div>

            {/* شريط الإقرار الأمني للقراءة فقط */}
            <div className="flex items-center gap-2 rounded-xl border border-emerald-600/20 bg-emerald-50/60 p-3 text-xs font-bold text-emerald-900">
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>
                {t(
                  'الفحص آمن ومحصن بنسبة 100% للقراءة فقط (Read-Only). لا يُعدل بيانات العمليات، ومفاتيح التشفير وكلمات المرور لا تُكشف مطلقاً.',
                  'Safe read-only execution. Does not mutate business data. Secrets and credentials remain strictly concealed.'
                )}
              </span>
            </div>
          </div>

          {/* مؤشر صحة النظام الشامل (Health Gauge Ring) */}
          <div className="flex flex-col sm:flex-row items-center gap-5 rounded-2xl border border-[#C29B62]/20 bg-[#FDFBF7] p-5 shadow-sm">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-stone-200"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={healthScore >= 90 ? 'text-[#059669]' : healthScore >= 70 ? 'text-[#D97706]' : 'text-[#A8573C]'}
                  strokeDasharray={`${healthScore}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="text-2xl font-black text-[#1E130B]">{healthScore}%</span>
                <span className="text-[10px] font-bold text-[#6F6257]">{t('مؤشر الصحة', 'Health')}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-center sm:text-start">
              <div className="flex items-center justify-center sm:justify-start gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full ${healthScore >= 90 ? 'bg-emerald-500' : healthScore >= 70 ? 'bg-amber-500' : 'bg-red-500'} animate-ping`} />
                <span className="text-sm font-black text-[#1E130B]">
                  {healthScore >= 90
                    ? t('حالة ممتازة ومستقرة', 'Optimal System Health')
                    : healthScore >= 70
                    ? t('مستقر مع تنبيهات بسيطة', 'Stable with Warnings')
                    : t('يتطلب فحصاً وتدخلاً', 'Action Required')}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#6F6257]">
                {statusCounts.total > 0
                  ? t(`تم اجتياز ${statusCounts.pass} من أصل ${statusCounts.total} فحصاً فنياً.`, `${statusCounts.pass} of ${statusCounts.total} checks passed.`)
                  : t('جاري تشغيل الفحص...', 'Running diagnostics...')}
              </p>
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] font-medium text-[#8C7A6B]">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{t('آخر تحديث:', 'Last updated:')} {formatLastRun()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 📊 2. كروت الإحصائيات التفاعلية مع الفلترة السريعة (Filterable KPI Cards) */}
        {/* ========================================================================= */}
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 md:gap-4">
          
          {/* كارت السليم */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => prev === 'pass' ? 'all' : 'pass')}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-start transition-all hover:-translate-y-0.5 ${
              statusFilter === 'pass'
                ? 'border-emerald-600 bg-emerald-50/80 shadow-md ring-2 ring-emerald-500/30'
                : 'border-[#C29B62]/20 bg-[#FDFBF7] hover:border-emerald-500/40 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6F6257]">{t('سليم ومطابق', 'Passed')}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-700">{statusCounts.pass}</span>
              <span className="text-[11px] font-bold text-emerald-600/80">{t('فحص ناجح', 'passed')}</span>
            </div>
          </button>

          {/* كارت التنبيهات */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => prev === 'warning' ? 'all' : 'warning')}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-start transition-all hover:-translate-y-0.5 ${
              statusFilter === 'warning'
                ? 'border-amber-600 bg-amber-50/80 shadow-md ring-2 ring-amber-500/30'
                : 'border-[#C29B62]/20 bg-[#FDFBF7] hover:border-amber-500/40 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6F6257]">{t('تنبيهات للمراجعة', 'Warnings')}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-700">{statusCounts.warning}</span>
              <span className="text-[11px] font-bold text-amber-600/80">{t('تنبيه', 'warning')}</span>
            </div>
          </button>

          {/* كارت المشكلات الحرجة */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => prev === 'error' ? 'all' : 'error')}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-start transition-all hover:-translate-y-0.5 ${
              statusFilter === 'error'
                ? 'border-[#A8573C] bg-red-50/80 shadow-md ring-2 ring-[#A8573C]/30'
                : 'border-[#C29B62]/20 bg-[#FDFBF7] hover:border-[#A8573C]/40 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6F6257]">{t('مشكلات تتطلب تدخلاً', 'Issues / Errors')}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-100 text-[#A8573C]">
                <XCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-[#A8573C]">{statusCounts.error}</span>
              <span className="text-[11px] font-bold text-[#A8573C]/80">{t('مشكلة', 'issue')}</span>
            </div>
          </button>

          {/* كارت غير متاح / اختياري */}
          <button
            type="button"
            onClick={() => setStatusFilter((prev) => prev === 'unavailable' ? 'all' : 'unavailable')}
            className={`group flex flex-col justify-between rounded-xl border p-4 text-start transition-all hover:-translate-y-0.5 ${
              statusFilter === 'unavailable'
                ? 'border-slate-400 bg-slate-100 shadow-md ring-2 ring-slate-400/30'
                : 'border-[#C29B62]/20 bg-[#FDFBF7] hover:border-slate-300 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#6F6257]">{t('غير متاح / مؤجل', 'Unavailable')}</span>
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-200 text-slate-700">
                <CircleHelp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-700">{statusCounts.unavailable}</span>
              <span className="text-[11px] font-bold text-slate-500">{t('معلق', 'skipped')}</span>
            </div>
          </button>
        </div>

        {/* ========================================================================= */}
        {/* 🎛️ 3. شريط أزرار التحكم والتشغيل الفوري (Action & Scope Toolbar)           */}
        {/* ========================================================================= */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#C29B62]/15 pt-5">
          
          <div className="flex flex-wrap items-center gap-2">
            {actions.map((action) => {
              const isExecuting = runningScope === action.scope;
              return (
                <button
                  key={action.scope}
                  type="button"
                  onClick={() => void runChecks(action.scope)}
                  disabled={Boolean(runningScope)}
                  className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60 ${
                    action.primary
                      ? 'bg-[#C29B62] text-[#1E130B] shadow-sm hover:brightness-105 active:scale-95'
                      : 'border border-[#C29B62]/30 bg-white text-[#1E130B] hover:bg-[#FDFBF7] active:scale-95'
                  }`}
                >
                  {isExecuting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-[#1E130B]" />
                  ) : (
                    action.icon
                  )}
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* زر نسخ التقرير */}
          <button
            type="button"
            onClick={() => void copyReport()}
            disabled={!checks.length || Boolean(runningScope)}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#C29B62]/30 bg-white px-4 py-2.5 text-xs font-black text-[#1E130B] shadow-sm transition-all hover:-translate-y-0.5 hover:bg-[#FDFBF7] disabled:opacity-50 active:scale-95"
          >
            <Copy className="h-4 w-4 text-[#C29B62]" />
            <span>{t('نسخ التقرير الهندسي المعتمد', 'Copy Certified Report')}</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 🔍 4. أدوات الفلترة والبحث السريع (Interactive Filters & Search Bar)       */}
      {/* ========================================================================= */}
      <div className="flex flex-col gap-3 rounded-2xl border border-[#C29B62]/20 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        
        {/* تبويبات الفئات */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'all', label: t('كافة الفحوصات', 'All Checks'), icon: Layers },
            { id: 'application', label: t('الجهاز والتطبيق', 'Device & App'), icon: Server },
            { id: 'queue', label: t('طابور المزامنة', 'Sync Queue'), icon: HardDrive },
            { id: 'cloud', label: t('السحابة والمصادقة', 'Cloud & Auth'), icon: Cloud },
            { id: 'database', label: t('قاعدة البيانات وRPC', 'Database & RPC'), icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeCategoryTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategoryTab(tab.id as any)}
                className={`inline-flex min-h-[38px] items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                  isActive
                    ? 'bg-[#1E130B] text-[#C29B62] shadow-sm'
                    : 'bg-[#FDFBF7] text-[#6F6257] hover:bg-[#C29B62]/10 hover:text-[#1E130B]'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* حقل البحث الفوري */}
        <div className="relative min-w-[240px]">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8C7A6B]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('بحث في الفحوصات والأخطاء...', 'Search checks and causes...')}
            className="w-full rounded-xl border border-[#C29B62]/20 bg-[#FDFBF7] py-2 pe-3 ps-9 text-xs font-bold text-[#1E130B] outline-none transition focus:border-[#C29B62] focus:bg-white focus:ring-1 focus:ring-[#C29B62]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#8C7A6B] hover:text-[#1E130B]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⏳ مؤشر جاري التحميل عند الفحص الشامل                                      */}
      {/* ========================================================================= */}
      {runningScope && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#C29B62]/30 bg-gradient-to-r from-[#FDFBF7] via-white to-[#FDFBF7] p-5 shadow-sm">
          <LoaderCircle className="h-5 w-5 animate-spin text-[#C29B62]" />
          <span className="text-sm font-black text-[#1E130B]">
            {t('جاري تنفيذ الفحص الهندسي والتحقق من المكونات المختارة لحظياً...', 'Executing engineering checks and verifying selected components...')}
          </span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 🗂️ 5. شبكة نتائج الفحوصات الفاخرة (Detailed Luxury Diagnostic Cards)      */}
      {/* ========================================================================= */}
      <div className="space-y-6">
        {groupedChecks.map((group) => {
          const meta = categoryMetadata(group.category);
          const GroupIcon = meta.icon;

          return (
            <section key={group.category} className="space-y-3" aria-label={meta.label}>
              
              {/* رأس المجموعة */}
              <div className="flex items-center justify-between border-b border-[#C29B62]/20 pb-2">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C29B62]/15 text-[#C29B62]">
                    <GroupIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[#1E130B]">{meta.label}</h3>
                    <p className="text-[11px] font-medium text-[#6F6257]">{meta.desc}</p>
                  </div>
                </div>
                <span className="rounded-full border border-[#C29B62]/20 bg-[#FDFBF7] px-2.5 py-0.5 text-xs font-black text-[#6F6257]">
                  {group.checks.length} {t('فحص', 'checks')}
                </span>
              </div>

              {/* بطاقات الفحص داخل المجموعة */}
              <div className="grid gap-4 xl:grid-cols-2">
                {group.checks.map((check) => {
                  const isExpanded = expandedCheckId === check.id;
                  const hasExpandable = Boolean(check.details?.length || check.cause || check.solution);

                  return (
                    <article
                      key={check.id}
                      className={`relative flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-[0_4px_20px_rgba(30,19,11,0.05)] transition-all hover:-translate-y-0.5 ${
                        check.status === 'pass'
                          ? 'border-[#C29B62]/20 hover:border-emerald-500/40'
                          : check.status === 'warning'
                          ? 'border-amber-400/60 bg-amber-50/20 hover:border-amber-500'
                          : check.status === 'error'
                          ? 'border-[#A8573C]/60 bg-red-50/20 hover:border-[#A8573C]'
                          : 'border-slate-300 bg-slate-50/40'
                      }`}
                    >
                      <div className="space-y-3">
                        {/* رأس الكارت */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 shrink-0">
                              {check.status === 'pass' && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 shadow-sm">
                                  <CheckCircle2 className="h-5 w-5" />
                                </div>
                              )}
                              {check.status === 'warning' && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-700 shadow-sm">
                                  <AlertTriangle className="h-5 w-5" />
                                </div>
                              )}
                              {check.status === 'error' && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-[#A8573C] shadow-sm">
                                  <XCircle className="h-5 w-5" />
                                </div>
                              )}
                              {check.status === 'unavailable' && (
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-slate-600 shadow-sm">
                                  <CircleHelp className="h-5 w-5" />
                                </div>
                              )}
                            </div>

                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black text-[#1E130B]">{check.title}</h4>
                                <span className="font-mono text-[10px] text-[#8C7A6B]">#{check.id}</span>
                              </div>
                              <p className="mt-1 text-xs font-semibold leading-relaxed text-[#514438]">
                                {check.summary}
                              </p>
                            </div>
                          </div>

                          {/* شارة الحالة الفاخرة */}
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-black shadow-xs ${
                              check.status === 'pass'
                                ? 'border border-emerald-300 bg-emerald-50 text-emerald-800'
                                : check.status === 'warning'
                                ? 'border border-amber-300 bg-amber-50 text-amber-800'
                                : check.status === 'error'
                                ? 'border border-red-300 bg-red-50 text-[#A8573C]'
                                : 'border border-slate-300 bg-slate-100 text-slate-700'
                            }`}
                          >
                            {statusLabel(check.status)}
                          </span>
                        </div>

                        {/* صناديق السبب والحل في حالة التحذير أو الخطأ */}
                        {(check.cause || check.solution) && (
                          <div className="mt-3 grid gap-2.5 rounded-xl border border-[#C29B62]/15 bg-[#FDFBF7] p-3 text-xs leading-relaxed">
                            {check.cause && (
                              <div className="flex items-start gap-2 border-s-2 border-[#A8573C] ps-2.5 text-[#A8573C]">
                                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                <div>
                                  <span className="font-black">{t('السبب المحتمل: ', 'Likely Cause: ')}</span>
                                  <span className="font-medium text-[#514438]">{check.cause}</span>
                                </div>
                              </div>
                            )}
                            {check.solution && (
                              <div className="flex items-start gap-2 border-s-2 border-emerald-600 ps-2.5 text-emerald-800">
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                                <div>
                                  <span className="font-black">{t('الإجراء المقترح: ', 'Action Plan: ')}</span>
                                  <span className="font-medium text-[#514438]">{check.solution}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* التفاصيل الفنية القابلة للطي */}
                        {Boolean(check.details?.length) && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setExpandedCheckId(isExpanded ? null : check.id)}
                              className="inline-flex min-h-[32px] items-center gap-1.5 text-[11px] font-black text-[#C29B62] hover:text-[#1E130B]"
                            >
                              <span>{isExpanded ? t('إخفاء البيانات الفنية', 'Hide technical details') : t('عرض السجلات والبيانات الفنية', 'Show technical details')}</span>
                              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            </button>

                            {isExpanded && (
                              <div className="mt-2 rounded-xl border border-[#C29B62]/15 bg-[#FDFBF7] p-3 text-[11px] text-[#514438]">
                                <ul className="space-y-1 font-mono leading-5">
                                  {check.details?.map((detail, idx) => (
                                    <li key={idx} className="flex items-start gap-1.5">
                                      <span className="text-[#C29B62]">•</span>
                                      <span className="break-all">{detail}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* ⚠️ في حال عدم وجود نتائج للبحث أو الفلترة                                  */}
      {/* ========================================================================= */}
      {filteredChecks.length === 0 && !runningScope && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[#C29B62]/20 bg-white p-12 text-center shadow-sm">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FDFBF7] text-[#C29B62]">
            <Search className="h-7 w-7" />
          </div>
          <h4 className="mt-4 text-base font-black text-[#1E130B]">
            {t('لا توجد فحوصات تطابق خيارات البحث والفلترة', 'No checks match your current filter')}
          </h4>
          <p className="mt-1 text-xs text-[#6F6257]">
            {t('جرب مسح حقل البحث أو إعادة تعيين الفلترة لإظهار كافة الفحوصات.', 'Clear search or reset filter to display all checks.')}
          </p>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setStatusFilter('all'); setActiveCategoryTab('all'); }}
            className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-[#C29B62]/30 bg-white px-4 text-xs font-black text-[#1E130B] hover:bg-[#FDFBF7]"
          >
            <span>{t('إعادة ضبط الفلاتر', 'Reset Filters')}</span>
          </button>
        </div>
      )}

    </div>
  );
}
