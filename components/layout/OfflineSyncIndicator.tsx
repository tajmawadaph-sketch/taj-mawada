"use client";

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useOfflineSync } from '@/lib/offline/useOfflineSync';
import { clearSyncQueue } from '@/lib/offline/syncStore';
import { 
  Database, 
  HardDrive, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Trash2, 
  X, 
  CheckCircle2, 
  AlertTriangle, 
  Server,
  Layers
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { showGlobalConfirm } from '@/lib/toast-context';

export default function OfflineSyncIndicator() {
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    tableCounts, 
    timeAgoText, 
    triggerSync, 
    refreshTableCounts 
  } = useOfflineSync();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [storageLocation, setStorageLocation] = useState<'checking' | 'browser' | 'desktop' | 'unavailable'>('checking');
  const [userDataPath, setUserDataPath] = useState('');
  const [sessionDataPath, setSessionDataPath] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const desktopApi = window.tajDesktop;
    if (!desktopApi?.isDesktop) {
      setStorageLocation('browser');
      return () => { cancelled = true; };
    }

    void desktopApi.getInfo().then((info) => {
      if (cancelled) return;
      if (info.userData) {
        setUserDataPath(info.userData);
        setSessionDataPath(info.sessionData || info.userData);
        setStorageLocation('desktop');
      } else {
        setStorageLocation('unavailable');
      }
    }).catch(() => {
      if (!cancelled) setStorageLocation('unavailable');
    });

    return () => { cancelled = true; };
  }, []);

  // إغلاق النافذة عند الضغط على زر Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    if (isModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await triggerSync(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleClearQueue = async () => {
    if (pendingCount === 0) return;
    const confirmed = await showGlobalConfirm({
      title: 'تفريغ طابور المزامنة',
      message: 'هل أنت متأكد من تفريغ طابور المزامنة المحلي؟ سيتم إلغاء وتجاهل كافة العمليات غير المرحّلة إلى السحابة.',
      confirmText: 'نعم، تفريغ الطابور',
      cancelText: 'إلغاء',
      type: 'danger'
    });
    if (confirmed) {
      await clearSyncQueue();
      toast.success('تم تفريغ طابور العمليات المعلقة محلياً.', {
        style: {
          background: '#1E130B',
          color: '#FDFBF7',
          border: '1px solid rgba(194, 155, 98, 0.4)',
          borderRadius: '12px'
        }
      });
      await refreshTableCounts();
    }
  };

  const isHealthy = isOnline && pendingCount === 0;

  // محتوى المودال المنفصل الذي سيتم نقله للـ Portal
  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 999999,
        backgroundColor: 'rgba(30, 19, 11, 0.65)',
        backdropFilter: 'blur(5px)',
        WebkitBackdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        direction: 'rtl',
        boxSizing: 'border-box'
      }}
      onClick={() => setIsModalOpen(false)}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '24px',
          border: '1.5px solid rgba(194, 155, 98, 0.35)',
          boxShadow: '0 25px 60px rgba(30, 19, 11, 0.35)',
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '26px 22px',
          color: '#1E130B',
          position: 'relative',
          boxSizing: 'border-box'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* زر الإغلاق الدائري */}
        <button
          type="button"
          onClick={() => setIsModalOpen(false)}
          style={{
            position: 'absolute',
            top: '18px',
            left: '18px',
            background: '#FDFBF7',
            border: '1px solid rgba(194, 155, 98, 0.25)',
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#6b7280',
            transition: 'all 0.2s',
            boxShadow: '0 2px 6px rgba(30, 19, 11, 0.05)'
          }}
          title="إغلاق النافذة"
        >
          <X size={18} />
        </button>

        {/* ترويسة المودال الفاخرة */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '20px' }}>
          <div 
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.2) 0%, rgba(168, 87, 60, 0.1) 100%)',
              border: '1px solid rgba(194, 155, 98, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#C29B62',
              flexShrink: 0
            }}
          >
            <Server size={24} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#1E130B' }}>
              مركز المزامنة والربط الثنائي
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6e5d4f', fontWeight: 700 }}>
              مراقبة حية للسحابة وقاعدة المتصفح المحلية (Offline-First)
            </p>
          </div>
        </div>

        {/* 📡 القناتان الأساسيتان (السحابة + الخزنة المحلية) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          
          {/* القناة الأولى: السحابة */}
          <div 
            style={{
              background: '#FDFBF7',
              border: `1.5px solid ${isOnline ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.3)'}`,
              borderRadius: '16px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(30, 19, 11, 0.03)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  color: isOnline ? '#059669' : '#A8573C',
                  background: isOnline ? 'rgba(5, 150, 105, 0.12)' : 'rgba(168, 87, 60, 0.12)',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                {isOnline ? <Cloud size={20} /> : <CloudOff size={20} />}
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#1E130B' }}>
                  السحابة (Supabase Cloud)
                </div>
                <div style={{ fontSize: '11.5px', color: '#6b7280', fontWeight: 700, marginTop: '2px' }}>
                  {isOnline ? 'الاتصال نشط ومحدث لحظياً' : 'انقطع الاتصال بالسيرفر (يعمل أوفلاين)'}
                </div>
              </div>
            </div>

            <span
              style={{
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11.5px',
                fontWeight: 900,
                background: isOnline ? 'rgba(5, 150, 105, 0.12)' : 'rgba(168, 87, 60, 0.12)',
                color: isOnline ? '#059669' : '#A8573C',
                border: `1px solid ${isOnline ? 'rgba(5, 150, 105, 0.3)' : 'rgba(168, 87, 60, 0.3)'}`
              }}
            >
              {isOnline ? '🟢 متصل' : '🔴 أوفلاين'}
            </span>
          </div>

          {/* القناة الثانية: الخزنة المحلية */}
          <div 
            style={{
              background: '#FDFBF7',
              border: '1.5px solid rgba(194, 155, 98, 0.25)',
              borderRadius: '16px',
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 2px 8px rgba(30, 19, 11, 0.03)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={{ 
                  color: '#C29B62',
                  background: 'rgba(194, 155, 98, 0.12)',
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <HardDrive size={20} />
              </div>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 900, color: '#1E130B' }}>
                  الخزنة المحلية (IndexedDB & Disk)
                </div>
                <div style={{ fontSize: '11.5px', color: '#6b7280', fontWeight: 700, marginTop: '2px' }}>
                  {storageLocation === 'desktop'
                    ? <>
                        ملفات التطبيق وطابور SQLite: <code dir="ltr" style={{ fontSize: '11px', color: '#C29B62', fontWeight: 800 }}>{userDataPath}</code>
                        <br />
                        جذر جلسة Chromium وIndexedDB: <code dir="ltr" style={{ fontSize: '11px', color: '#C29B62', fontWeight: 800 }}>{sessionDataPath}</code>
                      </>
                    : storageLocation === 'browser'
                      ? 'قاعدة IndexedDB: موقع التخزين يديره المتصفح'
                      : storageLocation === 'checking'
                        ? 'جارٍ تحديد موقع التخزين المحلي...'
                        : 'تعذر تحديد موقع التخزين المحلي'}
                </div>
              </div>
            </div>

            <span
              style={{
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11.5px',
                fontWeight: 900,
                background: 'rgba(5, 150, 105, 0.12)',
                color: '#059669',
                border: '1px solid rgba(5, 150, 105, 0.3)'
              }}
            >
              🛡️ نشط ومحمي
            </span>
          </div>
        </div>

        {/* 📊 إحصائيات السجلات المخزنة محلياً */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid rgba(194, 155, 98, 0.2)',
          borderRadius: '14px',
          padding: '12px 14px',
          marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '8px' }}>
            <Layers size={14} style={{ color: '#C29B62' }} />
            <span>السجلات المتزامنة في الذاكرة المحلية:</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FDFBF7', color: '#1E130B', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
              📦 أصناف: {tableCounts.items.toLocaleString('ar-SA')}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FDFBF7', color: '#1E130B', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
              📄 فواتير: {tableCounts.invoices.toLocaleString('ar-SA')}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FDFBF7', color: '#1E130B', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
              👥 عملاء: {tableCounts.partners.toLocaleString('ar-SA')}
            </span>
            <span style={{ fontSize: '11px', fontWeight: 800, background: '#FDFBF7', color: '#1E130B', padding: '3px 8px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
              ⚖️ حسابات: {tableCounts.accounts.toLocaleString('ar-SA')}
            </span>
          </div>
        </div>

        {/* تفاصيل السجلات وطابور المعلقات */}
        <div 
          style={{
            background: pendingCount > 0 ? 'rgba(217, 119, 6, 0.08)' : 'rgba(5, 150, 105, 0.08)',
            border: `1.5px solid ${pendingCount > 0 ? 'rgba(217, 119, 6, 0.3)' : 'rgba(5, 150, 105, 0.3)'}`,
            borderRadius: '14px',
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '18px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800 }}>
            {pendingCount > 0 ? <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0 }} /> : <CheckCircle2 size={18} style={{ color: '#059669', flexShrink: 0 }} />}
            <span style={{ color: pendingCount > 0 ? '#b45309' : '#059669' }}>
              {pendingCount > 0 ? `يوجد ${pendingCount} عملية بانتظار الترحيل` : 'طابور العمليات مكتمل بنسبة 100%'}
            </span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#6b7280', fontWeight: 800 }} suppressHydrationWarning>
            {timeAgoText}
          </span>
        </div>

        {/* أزرار الإجراءات */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '12px',
              background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '14px',
              fontSize: '13.5px',
              fontWeight: 900,
              cursor: isSyncing ? 'not-allowed' : 'pointer',
              minHeight: '44px',
              boxShadow: '0 4px 14px rgba(168, 87, 60, 0.25)',
              transition: 'all 0.2s'
            }}
          >
            <RefreshCw size={16} className={(isSyncing || isRefreshing) ? 'animate-spin' : ''} />
            <span>{isSyncing ? 'جاري المزامنة...' : 'فحص ومزامنة فورية'}</span>
          </button>

          {pendingCount > 0 && (
            <button
              type="button"
              onClick={handleClearQueue}
              title="تفريغ طابور المعلقات في حالة وجود خلل"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '12px 16px',
                background: 'rgba(168, 87, 60, 0.1)',
                color: '#A8573C',
                border: '1.5px solid rgba(168, 87, 60, 0.3)',
                borderRadius: '14px',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                minHeight: '44px'
              }}
            >
              <Trash2 size={16} />
              <span>مسح الطابور</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        .offline-sync-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #FFFFFF;
          border: 1.5px solid ${isHealthy ? 'rgba(5, 150, 105, 0.3)' : 'rgba(217, 119, 6, 0.4)'};
          border-radius: 10px;
          height: 34px;
          padding: 0 10px;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(30, 19, 11, 0.04);
          color: #1E130B;
          font-size: 11.5px;
          font-weight: 800;
          transition: all 0.2s ease;
          direction: rtl;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .offline-sync-pill:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(30, 19, 11, 0.08);
        }
        @media (max-width: 768px) {
          .offline-sync-pill {
            padding: 0;
            width: 34px;
            height: 34px;
            justify-content: center;
            border-radius: 9px;
          }
          .offline-sync-text {
            display: none !important;
          }
        }
      `}</style>

      {/* 🟢 زر المؤشر المتجاوب في الشريط العلوي */}
      <button
        onClick={() => setIsModalOpen(true)}
        type="button"
        className="offline-sync-pill"
        title={isHealthy ? `متزامن بالسحابة (${tableCounts.total} سجل)` : `تنبيه: ${pendingCount} عملية بانتظار المزامنة`}
      >
        {/* نقطة الحالة النابضة */}
        <span 
          style={{
            position: 'relative',
            display: 'flex',
            height: '8px',
            width: '8px',
            flexShrink: 0
          }}
        >
          <span 
            style={{
              position: 'absolute',
              display: 'inline-flex',
              height: '100%',
              width: '100%',
              borderRadius: '50%',
              opacity: 0.75,
              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
              backgroundColor: isHealthy ? '#059669' : '#d97706'
            }}
          />
          <span 
            style={{
              position: 'relative',
              display: 'inline-flex',
              borderRadius: '50%',
              height: '8px',
              width: '8px',
              backgroundColor: isHealthy ? '#059669' : '#d97706'
            }}
          />
        </span>

        {/* أيقونة قاعدة البيانات */}
        <Database size={14} style={{ color: '#C29B62', flexShrink: 0 }} />

        {/* النص والبادج (يختفي على شاشات الجوال لحماية الهيدر) */}
        <span className="offline-sync-text">
          {isHealthy ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span>مربوط</span>
              <span style={{ color: '#059669', fontSize: '10.5px' }} suppressHydrationWarning>({tableCounts.total.toLocaleString('ar-SA')})</span>
            </span>
          ) : (
            <span style={{ color: '#b45309', fontWeight: 900 }}>
              {pendingCount > 0 ? `${pendingCount} معلق` : 'أوفلاين'}
            </span>
          )}
        </span>
      </button>

      {/* 👑 نقل المودال إلى document.body عبر createPortal لمنع اقتصاصه أو تأثره بالـ Header */}
      {mounted && isModalOpen && typeof document !== 'undefined' && createPortal(modalContent, document.body)}
    </>
  );
}
