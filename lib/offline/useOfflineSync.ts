// ============================================================================
// 🎣 خطاف واجهة المستخدم للمزامنة (React Hook)
// يربط واجهة "الزجاج الصحراوي" (Desert Glassmorphism) بحالة الطابور المحلي
// ============================================================================

import { useState, useEffect } from 'react';
import { getPendingSyncCount } from './syncStore';
import { processSyncQueue } from './syncManager';

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // تحديث حالة الشبكة وعدد الفواتير المعلقة
  const updateStatus = async () => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    const count = await getPendingSyncCount();
    setPendingCount(count);
  };

  useEffect(() => {
    // الفحص المبدئي عند تحميل الصفحة
    updateStatus();

    // مستمعات عودة وانقطاع الإنترنت
    const handleOnline = () => {
      setIsOnline(true);
      // بمجرد عودة النت، شغل المزامنة تلقائياً بالخلفية
      processSyncQueue();
    };
    const handleOffline = () => setIsOnline(false);

    // مستمعات طابور المزامنة المخصصة
    const handleQueueChange = () => updateStatus();
    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncFinish = () => {
      setIsSyncing(false);
      updateStatus(); 
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('tajmawadah-sync-queue-changed', handleQueueChange);
    window.addEventListener('tajmawadah-sync-started', handleSyncStart);
    window.addEventListener('tajmawadah-sync-finished', handleSyncFinish);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('tajmawadah-sync-queue-changed', handleQueueChange);
      window.removeEventListener('tajmawadah-sync-started', handleSyncStart);
      window.removeEventListener('tajmawadah-sync-finished', handleSyncFinish);
    };
  }, []);

  // دالة تُستدعى يدوياً إذا أراد الكاشير فرض المزامنة
  const triggerSync = async () => {
    if (!isOnline) {
      alert('الجهاز غير متصل بالإنترنت حالياً، سيتم الرفع تلقائياً فور عودة الاتصال.');
      return;
    }
    await processSyncQueue();
  };

  return {
    isOnline,       // هل الكاشير متصل بالنت الآن؟
    isSyncing,      // هل جاري ترحيل الفواتير للسحابة؟
    pendingCount,   // عدد الفواتير المعلقة لطباعتها في الواجهة
    triggerSync     // زر التحديث اليدوي
  };
}
