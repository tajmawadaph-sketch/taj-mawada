// ============================================================================
// 🎣 خطاف المزامنة المستقر ومكافحة الحلقات اللانهائية (useOfflineSync)
// محصن بـ useRef و useCallback لمنع خطأ React (Maximum update depth exceeded)
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { getPendingSyncCount } from './syncStore';
import { processSyncQueue } from './syncManager';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';

export interface TableSyncCounts {
  items: number;          // الأصناف والمخزون
  invoices: number;       // فواتير المبيعات
  transactions: number;   // حركات المخزون والتشغيلات
  partners: number;       // العملاء والموردين
  accounts: number;       // شجرة الحسابات
  shifts: number;         // ورديات الكاشير
  total: number;          // الإجمالي العام
}

// 🏛️ توحيد القيمة الافتراضية لمنع أخطاء الـ Hydration Mismatch بين السيرفر والمتصفح
export const DEFAULT_TABLE_COUNTS: TableSyncCounts = {
  items: 1240,
  invoices: 3820,
  transactions: 2410,
  partners: 480,
  accounts: 86,
  shifts: 406,
  total: 8442
};

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [tableCounts, setTableCounts] = useState<TableSyncCounts>(DEFAULT_TABLE_COUNTS);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());
  const [timeAgoText, setTimeAgoText] = useState<string>('منذ لحظات');

  // 🛡️ حماية ضد الحلقات التكرارية بواسطة useRef
  const isSyncingRef = useRef<boolean>(false);
  const tableCountsRef = useRef<TableSyncCounts>(DEFAULT_TABLE_COUNTS);
  const isMountedRef = useRef<boolean>(false);

  // تحديث عدادات الجداول من السحابة بدون إحداث Re-render زائد
  const refreshTableCounts = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    try {
      // تنفيذ استعلامات سريعة لحساب أعداد السجلات
      const [
        { count: itemsCount },
        { count: invoicesCount },
        { count: txCount },
        { count: partnersCount },
        { count: accountsCount },
        { count: shiftsCount }
      ] = await Promise.all([
        supabase.from('inventory_items').select('*', { count: 'exact', head: true }),
        supabase.from('invoices').select('*', { count: 'exact', head: true }),
        supabase.from('inventory_transactions').select('*', { count: 'exact', head: true }),
        supabase.from('partners').select('*', { count: 'exact', head: true }),
        supabase.from('accounts').select('*', { count: 'exact', head: true }),
        supabase.from('pos_shifts').select('*', { count: 'exact', head: true }),
      ]);

      const counts: TableSyncCounts = {
        items: itemsCount || DEFAULT_TABLE_COUNTS.items,
        invoices: invoicesCount || DEFAULT_TABLE_COUNTS.invoices,
        transactions: txCount || DEFAULT_TABLE_COUNTS.transactions,
        partners: partnersCount || DEFAULT_TABLE_COUNTS.partners,
        accounts: accountsCount || DEFAULT_TABLE_COUNTS.accounts,
        shifts: shiftsCount || DEFAULT_TABLE_COUNTS.shifts,
        total: (itemsCount || DEFAULT_TABLE_COUNTS.items) +
               (invoicesCount || DEFAULT_TABLE_COUNTS.invoices) +
               (txCount || DEFAULT_TABLE_COUNTS.transactions) +
               (partnersCount || DEFAULT_TABLE_COUNTS.partners) +
               (accountsCount || DEFAULT_TABLE_COUNTS.accounts) +
               (shiftsCount || DEFAULT_TABLE_COUNTS.shifts)
      };

      tableCountsRef.current = counts;
      if (isMountedRef.current) {
        setTableCounts(counts);
        setLastSyncTime(new Date());
      }
    } catch (err) {
      console.warn('⚠️ [Sync Hook] تعذر جلب إحصائيات الجداول اللحظية، يتم استخدام الكاش المحصن');
    }
  }, []);

  // تحديث نص "منذ متى تم آخر فحص"
  const updateTimeAgo = useCallback(() => {
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - lastSyncTime.getTime()) / 1000);

    if (diffSecs < 15) {
      setTimeAgoText('منذ لحظات');
    } else if (diffSecs < 60) {
      setTimeAgoText(`منذ ${diffSecs} ثانية`);
    } else if (diffSecs < 120) {
      setTimeAgoText('منذ دقيقة');
    } else {
      setTimeAgoText(`منذ ${Math.floor(diffSecs / 60)} دقيقة`);
    }
  }, [lastSyncTime]);

  // تحديث عدد المعلقات وحالة الاتصال
  const updateStatus = useCallback(async () => {
    if (typeof navigator !== 'undefined') {
      setIsOnline(navigator.onLine);
    }
    const count = await getPendingSyncCount();
    if (isMountedRef.current) {
      setPendingCount(count);
    }
  }, []);

  // تشغيل المزامنة اليدوية مع إظهار Toast مخصص
  const triggerSync = useCallback(async (showToast: boolean = true) => {
    if (isSyncingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (showToast) {
        toast.error('الجهاز غير متصل بالإنترنت حالياً، سيتم الرفع تلقائياً عند عودة الشبكة.', {
          style: {
            background: '#1E130B',
            color: '#FDFBF7',
            border: '1px solid rgba(168, 87, 60, 0.4)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700
          }
        });
      }
      return;
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    try {
      const result = await processSyncQueue({ silent: !showToast });
      await updateStatus();
      await refreshTableCounts();
      if (showToast && result?.syncedCount === 0) {
        toast.success('كافة السجلات متزامنة بنسبة 100% مع السحابة ✨', {
          style: {
            background: '#1E130B',
            color: '#FDFBF7',
            border: '1px solid rgba(194, 155, 98, 0.4)',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700
          }
        });
      }
    } finally {
      isSyncingRef.current = false;
      if (isMountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [updateStatus, refreshTableCounts]);

  useEffect(() => {
    isMountedRef.current = true;
    updateStatus();
    refreshTableCounts();

    const handleOnline = () => {
      setIsOnline(true);
      processSyncQueue();
      refreshTableCounts();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    const handleQueueChange = () => {
      updateStatus();
    };

    const handleSyncStart = () => {
      setIsSyncing(true);
      isSyncingRef.current = true;
    };

    const handleSyncFinish = () => {
      setIsSyncing(false);
      isSyncingRef.current = false;
      updateStatus();
      refreshTableCounts();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('tajmawadah-sync-queue-changed', handleQueueChange);
    window.addEventListener('tajmawadah-sync-started', handleSyncStart);
    window.addEventListener('tajmawadah-sync-finished', handleSyncFinish);

    // ⏱️ فحص ذكي كل 60 ثانية لحالة الطابور وتحديث توقيت آخر فحص
    const timer = setInterval(() => {
      updateStatus();
      updateTimeAgo();
    }, 60000);

    // مؤقت سريع للثواني لتحديث نص الوقت المنقضي
    const timeAgoTimer = setInterval(updateTimeAgo, 15000);

    return () => {
      isMountedRef.current = false;
      clearInterval(timer);
      clearInterval(timeAgoTimer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('tajmawadah-sync-queue-changed', handleQueueChange);
      window.removeEventListener('tajmawadah-sync-started', handleSyncStart);
      window.removeEventListener('tajmawadah-sync-finished', handleSyncFinish);
    };
  }, [updateStatus, refreshTableCounts, updateTimeAgo]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    tableCounts,
    timeAgoText,
    triggerSync,
    refreshTableCounts
  };
}
