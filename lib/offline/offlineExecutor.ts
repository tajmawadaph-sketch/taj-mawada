// ============================================================================
// 🔌 منفذ العمليات دون اتصال (Offline Executor) 
// يغلف أوامر الكاشير (دفع فاتورة) بحيث تتجه لـ Supabase إن كان متصلاً، 
// أو إلى IndexedDB إن كان مفصولاً، دون أن يلاحظ الكاشير الفرق.
// ============================================================================

import { enqueueSyncItem } from './syncStore';

/**
 * دالة فحص الاتصال بالإنترنت محلياً
 */
function isUserOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

interface OfflineExecutionParams<T> {
  // الدالة التي ستتصل بالسيرفر مباشرة
  cloudOperation: () => Promise<T>;
  
  // بيانات العملية التي سيتم تخزينها إذا فشل الاتصال بالسيرفر
  offlineBackup: {
    type: 'invoice' | 'inventory_transaction' | 'customer';
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
  
  // إذا كان الجهاز مقطوعاً من الإنترنت صراحة
  if (!isUserOnline() && fallbackToOfflineQueue) {
    console.log('📶 الجهاز غير متصل، جاري حفظ العملية في الطابور المحلي...');
    const localId = await enqueueSyncItem(offlineBackup);
    
    // إرجاع نجاح وهمي (Optimistic Success) ليتمكن الكاشير من طباعة الفاتورة للعميل
    return { success: true, isOffline: true, data: { id: localId, ...offlineBackup.payload } as any };
  }

  // محاولة التنفيذ الحقيقي على السيرفر
  try {
    const result = await cloudOperation();
    return { success: true, data: result, isOffline: false };
  } catch (error: any) {
    // التقاط أخطاء الشبكة فقط (Failed to fetch أو أخطاء Timeout)
    const isNetworkError = 
      error.message?.includes('fetch') || 
      error.message?.includes('network') ||
      error.code === 'ECONNRESET';

    if (isNetworkError && fallbackToOfflineQueue) {
      console.log('⚠️ انقطع الاتصال فجأة أثناء التنفيذ، جاري الحفظ في الطابور...');
      const localId = await enqueueSyncItem(offlineBackup);
      return { success: true, isOffline: true, data: { id: localId, ...offlineBackup.payload } as any };
    }

    // إذا كان خطأ برمجي أو خطأ قواعد بيانات (ليس خطأ إنترنت)، نرميه كما هو
    console.error('❌ فشل تنفيذ العملية السحابية (خطأ غير شبكي):', error);
    throw error;
  }
}
