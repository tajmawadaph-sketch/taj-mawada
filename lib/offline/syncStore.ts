// ============================================================================
// 🗄️ محرك قاعدة بيانات المتصفح وطابور المزامنة المحلي (Local Sync Store)
// يدعم نمط Local-First Architecture لحفظ العمليات أثناء انقطاع الإنترنت
// ============================================================================

import { openDB, DBSchema } from 'idb';

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'completed';

export interface SyncItem {
  id: string; // معرّف ثابت للعملية؛ قد يكون UUID أو معرّفًا قديمًا محفوظًا من IndexedDB
  table?: string; // الجدول المستهدف (invoices, inventory_transactions, partners, ...)
  type?: 'invoice' | 'inventory_transaction' | 'customer' | string;
  action: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE';
  payload?: any;
  data?: any; // للتوافق المزدوج مع payload و data
  status: SyncStatus;
  retry_count?: number;
  created_at: string;
  error_message?: string;
}

interface TajMawadahDB extends DBSchema {
  tables_cache: {
    key: string; 
    value: {
      id: string;
      data: any[];
      updated_at: number;
    };
  };
  sync_queue: {
    key: string;
    value: SyncItem;
    indexes: { 'by-status': string; 'by-date': string };
  };
}

const DB_NAME = 'tajmawadah_offline_db';
const DB_VERSION = 2;

const SYNC_TABLE_BY_TYPE: Record<string, string> = {
  invoice: 'invoices',
  sales_invoice: 'invoices',
  purchase_invoice: 'purchases',
  inventory_transaction: 'inventory_transactions',
  inventory_adjustment: 'inventory_adjustments',
  stock_transfer: 'stock_transfers',
  customer: 'partners',
  pos_shift: 'pos_shifts',
  pos_shifts: 'pos_shifts',
  receipt_voucher: 'receipt_vouchers',
  payment_voucher: 'payment_vouchers',
  fleet_trip_settlement: 'fleet_trip_settlements',
  financial_period_closing: 'financial_periods',
};

function getDesktopQueueApi(): TajDesktopAPI | null {
  if (typeof window === 'undefined' || !window.tajDesktop?.isDesktop) return null;
  return window.tajDesktop;
}

function resolveQueueTable(type?: string, explicitTable?: string): string {
  if (explicitTable) return explicitTable;
  if (!type) return 'invoices';
  return SYNC_TABLE_BY_TYPE[type] || type;
}

/** Create the durable operation key before any cloud attempt begins. */
export function createSyncOperationId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `sync_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * فتح وتهيئة قاعدة بيانات المتصفح IndexedDB مع Fallback آمن
 */
async function getDB() {
  return openDB<TajMawadahDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains('tables_cache')) {
        db.createObjectStore('tables_cache', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'id' });
        queueStore.createIndex('by-status', 'status');
        queueStore.createIndex('by-date', 'created_at');
      }
    },
  });
}

// ============================================================================
// 📦 1. كاش الجداول المحلية (Local Tables Cache - للقراءة دون اتصال)
// ============================================================================

export async function saveTableLocally(tableName: string, data: any[]) {
  try {
    const db = await getDB();
    await db.put('tables_cache', {
      id: tableName,
      data,
      updated_at: Date.now()
    });
  } catch (error) {
    console.warn(`⚠️ تعذر حفظ الجدول ${tableName} في IndexedDB، جاري الحفظ في LocalStorage كبديل:`, error);
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(`tbl_cache_${tableName}`, JSON.stringify({ data, updated_at: Date.now() }));
      }
    } catch (e) {}
  }
}

export async function getTableLocally<T>(tableName: string): Promise<T[] | null> {
  try {
    const db = await getDB();
    const record = await db.get('tables_cache', tableName);
    if (record) return record.data as T[];
  } catch (error) {
    console.warn(`⚠️ فشل قراءة الجدول ${tableName} من IndexedDB، جاري الفحص في LocalStorage:`, error);
  }

  // Fallback to LocalStorage
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(`tbl_cache_${tableName}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed.data as T[];
      }
    } catch (e) {}
  }

  return null;
}

// ============================================================================
// 🛒 2. طابور العمليات المعلقة (Offline Sync Queue)
// ============================================================================

/**
 * إضافة عملية جديدة إلى طابور المزامنة (الاسم المعياري addToSyncQueue)
 */
export async function addToSyncQueue(
  table: string,
  action: 'insert' | 'update' | 'delete' | 'INSERT' | 'UPDATE' | 'DELETE',
  data: any,
  typeOverride?: string,
  operationId?: string
): Promise<string> {
  const id = operationId || createSyncOperationId();

  const item: SyncItem = {
    id,
    table,
    type: typeOverride || (table === 'invoices' ? 'invoice' : table === 'inventory_transactions' ? 'inventory_transaction' : table),
    action: action.toUpperCase() as any,
    payload: data,
    data: data,
    status: 'pending',
    retry_count: 0,
    created_at: new Date().toISOString()
  };

  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    const result = await desktopQueue.syncQueueAdd(item);
    if (!result?.success) throw new Error('تعذر حفظ العملية في طابور SQLite المحلي');
  } else {
    const db = await getDB();
    await db.put('sync_queue', item);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: await getPendingSyncCount() } }));
  }

  return id;
}

/**
 * التوافقية العكسية مع enqueueSyncItem
 */
export async function enqueueSyncItem(
  item: Omit<SyncItem, 'id' | 'status' | 'created_at'>,
  operationId?: string
): Promise<string> {
  const targetTable = resolveQueueTable(item.type, item.table);
  const payloadData = item.payload ?? item.data;
  return addToSyncQueue(targetTable, item.action, payloadData, item.type || targetTable, operationId);
}

async function migrateLegacyBrowserQueueToDesktop(desktopQueue: TajDesktopAPI): Promise<void> {
  let db: Awaited<ReturnType<typeof getDB>>;
  try {
    db = await getDB();
  } catch (error) {
    console.warn('تعذر فتح طابور IndexedDB القديم لنقله إلى SQLite:', error);
    return;
  }
  let legacyItems: SyncItem[];
  try {
    legacyItems = await db.getAll('sync_queue');
  } catch (error) {
    console.error('تعذر قراءة طابور IndexedDB القديم لنقله إلى SQLite:', error);
    return;
  }

  for (const legacyItem of legacyItems) {
    const legacyId = legacyItem?.id ?? 'غير معروف';
    try {
      const payload = legacyItem.payload ?? legacyItem.data;
      const looksLikeShiftClose = payload?.status === 'closed'
        && payload?.actual_cash !== undefined
        && payload?.closed_at
        && payload?.bottles_sold !== undefined;
      const itemType = looksLikeShiftClose ? 'pos_shift' : legacyItem.type;
      const table = looksLikeShiftClose
        ? 'pos_shifts'
        : resolveQueueTable(itemType, legacyItem.table);
      const migratedItem: SyncItem = {
        ...legacyItem,
        table,
        type: itemType || table,
        action: legacyItem.action,
        payload,
        data: payload,
        status: legacyItem.status === 'syncing' ? 'pending' : legacyItem.status,
      };

      const result = await desktopQueue.syncQueueAdd(migratedItem);
      if (!result?.success || result.id !== legacyItem.id) {
        throw new Error(`SQLite لم يؤكد حفظ العملية بالمعرّف نفسه (${legacyId})`);
      }

      // Keep the IndexedDB copy unless SQLite confirms this exact operation first.
      await db.delete('sync_queue', legacyItem.id);
    } catch (error) {
      console.error(`تعذر ترحيل العملية ${legacyId} من IndexedDB إلى SQLite؛ ستبقى محفوظة لإعادة المحاولة:`, error);
    }
  }
}

/**
 * جلب جميع السجلات المعلقة أو التي فشلت لإعادة إرسالها (FIFO)
 */
export async function getPendingSyncItems(): Promise<SyncItem[]> {
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    await migrateLegacyBrowserQueueToDesktop(desktopQueue);
    return desktopQueue.syncQueueListPending();
  }

  try {
    const db = await getDB();
    const tx = db.transaction('sync_queue', 'readonly');
    const index = tx.store.index('by-date');
    const all = await index.getAll();
    return all.filter(item => item.status === 'pending' || item.status === 'failed');
  } catch (error) {
    console.warn('⚠️ فشل جلب عناصر الطابور:', error);
    return [];
  }
}

/**
 * الحصول على عدد السجلات المعلقة اللحظي
 */
export async function getPendingSyncCount(): Promise<number> {
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    try {
      await migrateLegacyBrowserQueueToDesktop(desktopQueue);
      return await desktopQueue.syncQueueCountPending();
    } catch (error) {
      console.error('تعذر قراءة عدد العمليات من طابور SQLite المحلي:', error);
      return 0;
    }
  }

  try {
    const items = await getPendingSyncItems();
    return items.length;
  } catch {
    return 0;
  }
}

/**
 * وضع علامة نجاح وحذف العملية من الطابور
 */
export async function markItemCompleted(id: string) {
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    const result = await desktopQueue.syncQueueRemove(id);
    if (!result?.success) throw new Error(`العملية ${id} غير موجودة في طابور SQLite المحلي`);
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: await getPendingSyncCount() } }));
    return;
  }

  try {
    const db = await getDB();
    await db.delete('sync_queue', id);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: await getPendingSyncCount() } }));
    }
  } catch (error) {
    console.error(`❌ خطأ في حذف العملية المكتملة ${id}:`, error);
    throw error;
  }
}

/**
 * التوافقية العكسية مع removeSyncItem
 */
export const removeSyncItem = markItemCompleted;

/**
 * وضع علامة فشل مع زيادة عداد المحاولات (Exponential Backoff support)
 */
export async function markItemFailed(id: string, errorMessage?: string) {
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    const result = await desktopQueue.syncQueueMarkFailed({ id, errorMessage });
    if (!result?.success) throw new Error(`تعذر تحديث العملية ${id} في طابور SQLite المحلي`);
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: await getPendingSyncCount() } }));
    return;
  }

  try {
    const db = await getDB();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.status = 'failed';
      item.retry_count = (item.retry_count || 0) + 1;
      item.error_message = errorMessage || 'فشل الاتصال بالخادم';
      await db.put('sync_queue', item);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: await getPendingSyncCount() } }));
      }
    }
  } catch (error) {
    console.error(`❌ خطأ في تحديث حالة الفشل للعملية ${id}:`, error);
  }
}

/**
 * تحديث حالة العملية يدويًا
 */
export async function updateSyncItemStatus(id: string, status: SyncStatus, error_message?: string) {
  if (status === 'completed') {
    return markItemCompleted(id);
  }
  if (status === 'failed') {
    return markItemFailed(id, error_message);
  }
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    const result = await desktopQueue.syncQueueSetStatus({ id, status });
    if (!result?.success) throw new Error(`تعذر تحديث حالة العملية ${id} في طابور SQLite المحلي`);
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed'));
    return;
  }

  try {
    const db = await getDB();
    const item = await db.get('sync_queue', id);
    if (item) {
      item.status = status;
      await db.put('sync_queue', item);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed'));
      }
    }
  } catch (e) {}
}

/**
 * تفريغ كامل طابور المزامنة (عند الضرورة أو الطوارئ)
 */
export async function clearSyncQueue(): Promise<void> {
  const desktopQueue = getDesktopQueueApi();
  if (desktopQueue) {
    const result = await desktopQueue.syncQueueClear();
    if (!result?.success) throw new Error('تعذر مسح طابور SQLite المحلي');
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: 0 } }));
    return;
  }

  try {
    const db = await getDB();
    await db.clear('sync_queue');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed', { detail: { count: 0 } }));
    }
  } catch (error) {
    console.error('❌ خطأ في مسح طابور المزامنة:', error);
  }
}
