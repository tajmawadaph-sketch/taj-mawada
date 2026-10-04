// ============================================================================
// 🔄 محرك المزامنة التلقائية بالخلفية (Background Sync Manager) - المرحلة الثالثة
// يعالج طابور العمليات المعلقة عند عودة الاتصال بالإنترنت
// ============================================================================

import { supabase } from '@/lib/supabase';
import { getPendingSyncItems, updateSyncItemStatus, removeSyncItem } from './syncStore';
import { invalidateTags } from '../cache/dataCache';

let isSyncing = false; // لمنع تشغيل دالتين مزامنة في نفس اللحظة

/**
 * معالجة الطابور: سحب الفواتير ورفعها للسحابة
 */
export async function processSyncQueue() {
  // لا تقم بشيء إذا كان هناك مزامنة جارية بالفعل أو لا يوجد نت
  if (isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return;
  }

  isSyncing = true;
  // تنبيه الواجهة بأن المزامنة بدأت (لتدوير أيقونة التحميل)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-started'));
  }

  try {
    const pendingItems = await getPendingSyncItems();
    if (pendingItems.length === 0) return; // لا يوجد شيء للمزامنة

    console.log(`🔄 بدء مزامنة ${pendingItems.length} عملية معلقة بالسحابة...`);

    // الترتيب الزمني (الأقدم أولاً - FIFO) لضمان صحة التسلسل المحاسبي
    pendingItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const item of pendingItems) {
      await updateSyncItemStatus(item.id, 'syncing');

      try {
        // تنفيذ العملية بناءً على نوعها
        if (item.type === 'invoice' && item.action === 'insert') {
          const { error } = await supabase.from('invoices').insert(item.payload);
          if (error) throw error;
        } 
        else if (item.type === 'inventory_transaction' && item.action === 'insert') {
          const { error } = await supabase.from('inventory_transactions').insert(item.payload);
          if (error) throw error;
        }
        // يمكن إضافة المزيد من الأنواع هنا مستقبلاً (عملاء، دفعات، الخ...)

        // عند النجاح: نحذف الفاتورة من الطابور المحلي للأبد
        await removeSyncItem(item.id);
        console.log(`✅ تمت مزامنة العملية ${item.id} بنجاح`);
      } catch (err: any) {
        // في حالة الفشل (مثلا خلل في البيانات)، نتركها في الطابور ونعلمها كفاشلة لئلا تعيق باقي الفواتير
        console.error(`❌ فشل في مزامنة العملية ${item.id}`, err);
        await updateSyncItemStatus(item.id, 'failed', err.message || 'Unknown error');
      }
    }

    // إبطال كاش الأصناف والفواتير لتتحدث أرصدة المستودع بالأرقام الجديدة بعد رفع الفواتير
    invalidateTags(['inventory_items', 'invoices', 'inventory_transactions']);

  } finally {
    isSyncing = false;
    // تنبيه الواجهة بانتهاء المزامنة
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-finished'));
    }
  }
}
