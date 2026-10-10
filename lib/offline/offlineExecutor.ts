// ============================================================================
// 🔌 منفذ العمليات دون اتصال (Offline Executor) 
// يغلف أوامر الكاشير (دفع فاتورة) بحيث تتجه لـ Supabase إن كان متصلاً، 
// أو إلى IndexedDB إن كان مفصولاً، دون أن يلاحظ الكاشير الفرق.
// ============================================================================

import { createSyncOperationId, enqueueSyncItem } from './syncStore';

export class SyncOperationAcknowledgementError extends Error {
  readonly code = 'SYNC_OPERATION_ACK_MISMATCH';
}

/**
 * دالة فحص الاتصال بالإنترنت محلياً
 */
function isUserOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

interface OfflineExecutionParams<T> {
  // الدالة التي ستتصل بالسيرفر مباشرة
  cloudOperation: (context: { operationId: string }) => Promise<T>;
  
  // بيانات العملية التي سيتم تخزينها إذا فشل الاتصال بالسيرفر
  offlineBackup: {
    type: string;
    table?: string;
    action: 'insert' | 'update' | 'delete';
    payload: any;
  };
  
  // هل نتجاهل الخطأ ونحفظ في الأوفلاين دائماً في حالة عدم وجود نت؟
  fallbackToOfflineQueue?: boolean;
}

/**
 * منفذ العمليات الذكي
 * 1. يحاول التنفيذ على السيرفر (Supabase).
 * 2. إذا لم يكن هناك إنترنت أو انقطع أثناء العملية، يحفظ في الطابور المحلي ويعتبرها "نجاحاً محلياً".
 */
export async function executeWithOfflineSync<T>({
  cloudOperation,
  offlineBackup,
  fallbackToOfflineQueue = true
}: OfflineExecutionParams<T>): Promise<{ success: boolean; data?: T; isOffline: boolean }> {
  // The same key is sent to the first cloud attempt and retained by any queued retry.
  const operationId = createSyncOperationId();
  
  // إذا كان الجهاز مقطوعاً من الإنترنت صراحة
  if (!isUserOnline() && fallbackToOfflineQueue) {
    console.log('📶 الجهاز غير متصل، جاري حفظ العملية في الطابور المحلي...');
    const localId = await enqueueSyncItem(offlineBackup, operationId);
    
    // إرجاع نجاح وهمي (Optimistic Success) ليتمكن الكاشير من طباعة الفاتورة للعميل
    return { success: true, isOffline: true, data: { id: localId, ...offlineBackup.payload } as any };
  }

  // محاولة التنفيذ الحقيقي على السيرفر
  try {
    const result = await cloudOperation({ operationId });
    return { success: true, data: result, isOffline: false };
  } catch (error: any) {
    const errorMsg = (error?.message || '').toLowerCase();
    const isNetworkError = 
      !isUserOnline() ||
      errorMsg.includes('fetch') || 
      errorMsg.includes('network') ||
      errorMsg.includes('err_name_not_resolved') ||
      errorMsg.includes('failed to load') ||
      errorMsg.includes('load failed') ||
      errorMsg.includes('timeout') ||
      error?.code === 'ECONNRESET';
    const isUnconfirmedOperation = error?.code === 'SYNC_OPERATION_ACK_MISMATCH';

    if ((isNetworkError || isUnconfirmedOperation) && fallbackToOfflineQueue) {
      console.log('⚠️ [Offline Executor] انقطع الاتصال فجأة أو تعذر الوصول للسيرفر، جاري الحفظ المحلي في الطابور...');
      const localId = await enqueueSyncItem(offlineBackup, operationId);
      return { success: true, isOffline: true, data: { id: localId, ...offlineBackup.payload } as any };
    }

    // إذا كان خطأ برمجي صريح، نرميه
    console.error('❌ فشل تنفيذ العملية السحابية:', error);
    throw error;
  }
}
