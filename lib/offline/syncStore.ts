// ============================================================================
// 🗄️ محرك قاعدة بيانات المتصفح (IndexedDB Engine) - المرحلة الثانية
// لتخزين الأصناف والفواتير محلياً للعمل دون اتصال (Offline-First)
// ============================================================================

import { openDB, DBSchema } from 'idb';

export type SyncStatus = 'pending' | 'syncing' | 'failed' | 'completed';

export interface SyncItem {
  id: string; // معرف فريد يتم توليده محلياً (UUID)
  type: 'invoice' | 'inventory_transaction' | 'customer'; // نوع العملية
  action: 'insert' | 'update' | 'delete'; // الإجراء
  payload: any; // البيانات المرسلة (الفاتورة أو الحركة)
  status: SyncStatus;
  created_at: string;
  error_message?: string;
}

interface TajMawadahDB extends DBSchema {
  // 1. مخزن لنسخ الجداول (للقراءة فقط وقت انقطاع النت مثل قائمة الأصناف)
  tables_cache: {
    key: string; 
    value: {
      id: string;
      data: any[];
      updated_at: number;
    };
  };
  // 2. طابور العمليات المعلقة (الفواتير التي ستُرفع لاحقاً)
  sync_queue: {
    key: string;
    value: SyncItem;
    indexes: { 'by-status': string, 'by-date': string };
  };
}

const DB_NAME = 'tajmawadah_offline_db';
const DB_VERSION = 1;

/**
 * فتح وتجهيز قاعدة البيانات المحلية
 */
async function getDB() {
  return openDB<TajMawadahDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
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
// 📦 1. دوال تخزين جداول النظام (Read-Only Data Cache)
// ============================================================================

export async function saveTableLocally(tableName: string, data: any[]) {
  const db = await getDB();
  await db.put('tables_cache', {
    id: tableName,
    data,
    updated_at: Date.now()
  });
}

export async function getTableLocally<T>(tableName: string): Promise<T[] | null> {
  try {
    const db = await getDB();
    const record = await db.get('tables_cache', tableName);
    return record ? (record.data as T[]) : null;
  } catch (error) {
    console.warn(`⚠️ فشل قراءة الجدول ${tableName} من IndexedDB`, error);
    return null;
  }
}

// ============================================================================
// 🛒 2. دوال طابور المزامنة (Offline Invoices & Mutations Queue)
// ============================================================================

/**
 * إدراج فاتورة أو حركة جديدة في الطابور عند انقطاع الإنترنت
 */
export async function enqueueSyncItem(item: Omit<SyncItem, 'id' | 'status' | 'created_at'>) {
  const db = await getDB();
  const id = crypto.randomUUID(); // توليد معرف محلي فريد للعملية
  const fullItem: SyncItem = {
    ...item,
    id,
    status: 'pending',
    created_at: new Date().toISOString()
  };
  
  await db.add('sync_queue', fullItem);
  
  // إطلاق حدث لتحديث مؤشر الواجهة الزجاجية عند الكاشير
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed'));
  }
  
  return id;
}

/**
 * جلب جميع الفواتير والحركات المعلقة التي يجب رفعها للسيرفر
 */
export async function getPendingSyncItems(): Promise<SyncItem[]> {
  const db = await getDB();
  const tx = db.transaction('sync_queue', 'readonly');
  const index = tx.store.index('by-date');
  const allItems = await index.getAll();
  // نجلب العمليات المعلقة أو التي فشلت في محاولة سابقة ليتم إعادة محاولتها
  return allItems.filter(item => item.status === 'pending' || item.status === 'failed');
}

/**
 * جلب عدد العمليات المعلقة (لإظهاره في أيقونة التنبيه للكاشير)
 */
export async function getPendingSyncCount(): Promise<number> {
  const items = await getPendingSyncItems();
  return items.length;
}

/**
 * تحديث حالة الفاتورة (جاري الرفع -> نجح -> فشل)
 */
export async function updateSyncItemStatus(id: string, status: SyncStatus, error_message?: string) {
  const db = await getDB();
  const item = await db.get('sync_queue', id);
  if (item) {
    item.status = status;
    if (error_message !== undefined) item.error_message = error_message;
    await db.put('sync_queue', item);
    
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed'));
    }
  }
}

/**
 * إزالة الفاتورة من الطابور نهائياً بعد وصولها لقاعدة Supabase بنجاح
 */
export async function removeSyncItem(id: string) {
  const db = await getDB();
  await db.delete('sync_queue', id);
  
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-queue-changed'));
  }
}
