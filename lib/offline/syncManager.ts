// ============================================================================
// 🔄 معالج الطابور والربط السحابي (Sync Manager Engine)
// يعمل بنظام FIFO (First In First Out) لضمان صحة التسلسل المحاسبي والمخزني
// ============================================================================

import { supabase } from '@/lib/supabase';
import { 
  getPendingSyncItems, 
  updateSyncItemStatus, 
  markItemCompleted, 
  markItemFailed 
} from './syncStore';
import { invalidateTags } from '../cache/dataCache';
import { toast } from 'react-hot-toast';

let isSyncing = false; // حماية ضد التنفيذ المتزامن أو التكرار

/**
 * معالجة طابور المزامنة ورفع السجلات تباعاً إلى قاعدة بيانات Supabase
 */
export async function processSyncQueue(options: { silent?: boolean } = {}) {
  // منع المزامنة إذا كانت هناك عملية جارية أو لا يوجد اتصال بالإنترنت
  if (isSyncing || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { success: false, syncedCount: 0, reason: 'offline_or_busy' };
  }

  isSyncing = true;
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('tajmawadah-sync-started'));
  }

  let successCount = 0;
  let failCount = 0;

  try {
    const pendingItems = await getPendingSyncItems();
    if (pendingItems.length === 0) {
      return { success: true, syncedCount: 0 };
    }

    console.log(`🔄 [Sync Engine] بدء مزامنة ${pendingItems.length} عملية بنظام FIFO...`);

    // ترتيب العمليات تصاعدياً بالوقت لضمان التسلسل الصحيح (FIFO)
    pendingItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    for (const item of pendingItems) {
      // إذا تجاوزت العملية 5 محاولات فاشلة، نتخطاها مؤقتاً لتفادي تجميد الطابور
      if ((item.retry_count || 0) >= 6) {
        continue;
      }

      await updateSyncItemStatus(item.id, 'syncing');

      try {
        const targetTable = item.table || (item.type === 'invoice' ? 'invoices' : item.type === 'inventory_transaction' ? 'inventory_transactions' : 'invoices');
        const rawAction = (item.action || 'insert').toLowerCase();
        const payloadData = item.payload || item.data;

        // تنفيذ الاستعلام المناسب على Supabase
        if (rawAction === 'insert') {
          const { error } = await supabase.from(targetTable).insert(payloadData);
          if (error) throw error;
        } else if (rawAction === 'update') {
          if (!payloadData?.id) throw new Error('معرف السجل مفقود في عملية التحديث');
          const { error } = await supabase.from(targetTable).update(payloadData).eq('id', payloadData.id);
          if (error) throw error;
        } else if (rawAction === 'delete') {
          const targetId = payloadData?.id || payloadData;
          const { error } = await supabase.from(targetTable).delete().eq('id', targetId);
          if (error) throw error;
        }

        // نجحت العملية: تُحذف فوراً من الطابور المحلي
        await markItemCompleted(item.id);
        successCount++;
        console.log(`✅ [Sync Engine] تمت مزامنة السجل (${item.id}) في جدول (${targetTable})`);

      } catch (err: any) {
        failCount++;
        console.error(`❌ [Sync Engine] فشل مزامنة السجل (${item.id}):`, err);
        await markItemFailed(item.id, err.message || 'خطأ غير معروف في السيرفر');
      }
    }

    // إبطال كاش الذاكرة الحية لجميع الجداول المتأثرة
    invalidateTags(['inventory_items', 'invoices', 'inventory_transactions', 'partners', 'accounts']);

    // إطلاق إشعار Toast ملكي فاخر عند نجاح ترحيل العمليات
    if (successCount > 0 && !options.silent) {
      toast.success(
        `تمت مزامنة وترحيل ${successCount} عملية معلقة إلى السحابة بنجاح! 🚀`,
        {
          duration: 4000,
          position: 'bottom-center',
          style: {
            background: '#1E130B',
            color: '#FDFBF7',
            border: '1px solid rgba(194, 155, 98, 0.4)',
            borderRadius: '14px',
            fontSize: '13.5px',
            fontWeight: 800,
            boxShadow: '0 10px 30px rgba(30, 19, 11, 0.25)',
            direction: 'rtl'
          },
          iconTheme: {
            primary: '#C29B62',
            secondary: '#1E130B'
          }
        }
      );
    }

    return { success: true, syncedCount: successCount, failedCount: failCount };

  } finally {
    isSyncing = false;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-finished', { detail: { successCount, failCount } }));
    }
  }
}
