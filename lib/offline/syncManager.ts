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
let syncRequestedWhileBusy = false;
let queuedSyncRequestSilent = true;

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

function withSyncOperationId(payload: any, operationId: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('حمولة RPC غير صالحة لإرفاق معرّف عملية المزامنة');
  }
  return { ...payload, _sync_operation_id: operationId };
}

function assertRpcAccepted(
  rpcName: string,
  result: { data: any; error: any },
  operationId: string
) {
  if (result.error) throw result.error;
  if (result.data?.success !== true) {
    throw new Error(`لم يؤكد ${rpcName} نجاح العملية`);
  }

  if (result.data?._sync_operation_id !== operationId
    || typeof result.data?._sync_replayed !== 'boolean') {
    throw new Error(
      `لم تُعِد ${rpcName} تأكيد معرّف العملية ${operationId} وعلامة الاسترجاع؛ أُبقيت العملية في الطابور للمراجعة.`
    );
  }

  const duplicateWasReported = result.data?.duplicate_prevented === true
    || result.data?.already_closed === true;
  if (duplicateWasReported) {
    throw new Error(
      `وجد ${rpcName} سجل أعمال سابقًا خارج سجل مفتاح العملية؛ لا يمكن اعتباره إعادة للعملية نفسها. أُبقيت العملية في الطابور للمراجعة.`
    );
  }
}

/**
 * معالجة طابور المزامنة ورفع السجلات تباعاً إلى قاعدة بيانات Supabase
 */
export async function processSyncQueue(options: { silent?: boolean } = {}) {
  // منع المزامنة إذا كانت هناك عملية جارية أو لا يوجد اتصال بالإنترنت
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { success: false, syncedCount: 0, reason: 'offline_or_busy' };
  }
  if (isSyncing) {
    // Coalesce concurrent startup/reconnect requests into one trailing pass.
    syncRequestedWhileBusy = true;
    queuedSyncRequestSilent = queuedSyncRequestSilent && Boolean(options.silent);
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
      let cloudOperationSucceeded = false;

      try {
        const targetTable = item.table || SYNC_TABLE_BY_TYPE[item.type || ''] || item.type || 'invoices';
        const rawAction = (item.action || 'insert').toLowerCase();
        const payloadData = item.payload || item.data;

        // تنفيذ الاستعلام المناسب على Supabase مع دعم الـ RPCs الذرية
        if ((item.type === 'pos_shift' || targetTable === 'pos_shifts') && payloadData?.status === 'closed') {
          const rpcResult = await supabase.rpc('rpc_close_pos_shift', {
            p_data: {
              _sync_operation_id: item.id,
              shift_id: payloadData.id,
              actual_cash: payloadData.actual_cash,
              actual_bottles: payloadData.actual_bottles ?? payloadData.bottles_returned,
              total_sales: payloadData.total_sales,
              total_cash_sales: payloadData.total_cash_sales,
              total_card_sales: payloadData.total_card_sales,
              total_credit_sales: payloadData.total_credit_sales,
              total_expenses: payloadData.total_expenses,
              cash_expenses: payloadData.cash_expenses,
              bottles_sold: payloadData.bottles_sold,
              bottles_returned: payloadData.bottles_returned,
              notes: payloadData.closing_notes || 'مزامنة تقفيل الوردية من الطابور المحلي'
            }
          });
          assertRpcAccepted('rpc_close_pos_shift', rpcResult, item.id);
        } else if ((item.type === 'receipt_voucher' || targetTable === 'receipt_vouchers') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_receipt_voucher', {
            p_data: {
              ...withSyncOperationId(payloadData, item.id),
              auto_allocate: true
            }
          });
          assertRpcAccepted('rpc_process_receipt_voucher', rpcResult, item.id);
        } else if ((item.type === 'payment_voucher' || targetTable === 'payment_vouchers') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_payment_voucher', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_process_payment_voucher', rpcResult, item.id);
        } else if ((item.type === 'stock_transfer' || targetTable === 'stock_transfers') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_stock_transfer', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_process_stock_transfer', rpcResult, item.id);
        } else if ((item.type === 'inventory_adjustment' || targetTable === 'inventory_adjustments') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_inventory_adjustment', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_process_inventory_adjustment', rpcResult, item.id);
        } else if ((item.type === 'fleet_trip_settlement' || targetTable === 'fleet_trip_settlements') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_settle_fleet_trip', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_settle_fleet_trip', rpcResult, item.id);
        } else if ((item.type === 'sales_invoice' || targetTable === 'sales_invoices') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_sales_invoice', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_process_sales_invoice', rpcResult, item.id);
        } else if ((item.type === 'purchase_invoice' || targetTable === 'purchase_invoices' || targetTable === 'purchases') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_process_purchase_invoice', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_process_purchase_invoice', rpcResult, item.id);
        } else if ((item.type === 'financial_period_closing' || targetTable === 'financial_periods') && rawAction === 'insert') {
          const rpcResult = await supabase.rpc('rpc_close_financial_period', {
            p_data: withSyncOperationId(payloadData, item.id)
          });
          assertRpcAccepted('rpc_close_financial_period', rpcResult, item.id);
        } else {
          throw new Error(
            `العملية ${item.id} تستخدم مسار CRUD/HTTP مباشرًا بلا سجل ذري لمعرّف المزامنة؛ أُبقيت في الطابور للمراجعة.`
          );
        }

        cloudOperationSucceeded = true;
        // نجحت العملية: تُحذف فوراً من الطابور المحلي
        await markItemCompleted(item.id);
        successCount++;
        console.log(`✅ [Sync Engine] تمت مزامنة السجل (${item.id}) في جدول (${targetTable})`);

      } catch (err: any) {
        if (cloudOperationSucceeded) {
          try {
            // Retry only the local acknowledgement; never immediately replay an accepted cloud mutation.
            await markItemCompleted(item.id);
            successCount++;
            console.warn(`تم قبول العملية ${item.id} سحابياً وحذفها من الطابور المحلي بعد إعادة المحاولة`);
          } catch (ackError) {
            failCount++;
            console.error(
              `تم قبول العملية ${item.id} سحابياً لكن تعذر تأكيد حذفها محلياً؛ ستبقى بحالة syncing للاستعادة لاحقاً:`,
              ackError || err
            );
          }
          continue;
        }

        failCount++;
        console.error(`❌ [Sync Engine] فشل مزامنة السجل (${item.id}):`, err);
        await markItemFailed(item.id, err.message || 'خطأ غير معروف في السيرفر');
      }
    }

    // إبطال كاش الذاكرة الحية لجميع الجداول المتأثرة
    invalidateTags(['inventory_items', 'invoices', 'inventory_transactions', 'partners', 'accounts', 'financial_periods']);

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
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tajmawadah-sync-finished', { detail: { successCount, failCount } }));
    }
    isSyncing = false;

    const shouldRunAgain = syncRequestedWhileBusy
      && (typeof navigator === 'undefined' || navigator.onLine);
    const silent = queuedSyncRequestSilent;
    syncRequestedWhileBusy = false;
    queuedSyncRequestSilent = true;
    if (shouldRunAgain) {
      void processSyncQueue({ silent }).catch((error) => {
        console.error('تعذر إكمال مرور المزامنة المؤجل:', error);
      });
    }
  }
}
