"use client";

import React, { useState } from 'react';
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
  Server
} from 'lucide-react';
import { toast } from 'react-hot-toast';

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

  const handleManualSync = async () => {
    setIsRefreshing(true);
    await triggerSync(true);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleClearQueue = async () => {
    if (pendingCount === 0) return;
    if (window.confirm('هل أنت متأكد من تفريغ طابور المزامنة المحلي؟ سيتم إلغاء العمليات غير المرحّلة.')) {
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

      {/* 👑 النافذة المنبثقة التفاعلية الفاخرة (Offline Sync Modal) */}
      {isModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            backgroundColor: 'rgba(30, 19, 11, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            direction: 'rtl'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '20px',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.3)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px 20px',
              color: '#1E130B',
              position: 'relative',
              animation: 'scaleUp 0.2s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* زر الإغلاق */}
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: 'absolute',
                top: '16px',
                left: '16px',
                background: '#FDFBF7',
                border: '1px solid rgba(194, 155, 98, 0.2)',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              <X size={15} />
            </button>

            {/* عنوان المودال */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div 
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'rgba(194, 155, 98, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#C29B62'
                }}
              >
                <Server size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                  مركز مزامنة البيانات والربط الثنائي
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#6b7280', fontWeight: 700 }}>
                  مراقبة السحابة السحابية وقاعدة المتصفح المحلية
                </p>
              </div>
            </div>

            {/* 📡 القناتان الأساسيتان */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '18px' }}>
              
              {/* القناة الأولى: السحابة */}
              <div 
                style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.15)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ color: isOnline ? '#059669' : '#A8573C' }}>
                    {isOnline ? <Cloud size={20} /> : <CloudOff size={20} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                      السحابة (Supabase Cloud)
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700 }}>
                      {isOnline ? 'الاتصال نشط ومحدث لحظياً' : 'انقطع الاتصال بالسيرفر'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: isOnline ? 'rgba(5, 150, 105, 0.12)' : 'rgba(168, 87, 60, 0.12)',
                    color: isOnline ? '#059669' : '#A8573C'
                  }}
                >
                  {isOnline ? 'متصل' : 'أوفلاين'}
                </span>
              </div>

              {/* القناة الثانية: الخزنة المحلية */}
              <div 
                style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.15)',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ color: '#C29B62' }}>
                    <HardDrive size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                      الخزنة المحلية (IndexedDB & Disk)
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700 }}>
                      قاعدة المتصفح <code style={{ fontSize: '10px', color: '#C29B62' }}>D:\TajMawadah_Data</code>
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '3px 8px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: 'rgba(5, 150, 105, 0.12)',
                    color: '#059669'
                  }}
                >
                  نشط ومحمي
                </span>
              </div>
            </div>

            {/* تفاصيل السجلات المعلقة */}
            <div 
              style={{
                background: pendingCount > 0 ? 'rgba(217, 119, 6, 0.08)' : 'rgba(5, 150, 105, 0.06)',
                border: `1px solid ${pendingCount > 0 ? 'rgba(217, 119, 6, 0.25)' : 'rgba(5, 150, 105, 0.2)'}`,
                borderRadius: '12px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', fontWeight: 800 }}>
                {pendingCount > 0 ? <AlertTriangle size={16} style={{ color: '#d97706' }} /> : <CheckCircle2 size={16} style={{ color: '#059669' }} />}
                <span>
                  {pendingCount > 0 ? `يوجد ${pendingCount} عملية بانتظار الترحيل` : 'طابور العمليات مكتمل بنسبة 100%'}
                </span>
              </div>
              <span style={{ fontSize: '11px', color: '#6b7280', fontWeight: 700 }} suppressHydrationWarning>
                {timeAgoText}
              </span>
            </div>

            {/* أزرار الإجراءات */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px',
                  background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: 900,
                  cursor: isSyncing ? 'not-allowed' : 'pointer'
                }}
              >
                <RefreshCw size={14} className={(isSyncing || isRefreshing) ? 'animate-spin' : ''} />
                <span>{isSyncing ? 'جاري المزامنة...' : 'فحص ومزامنة فورية'}</span>
              </button>

              {pendingCount > 0 && (
                <button
                  onClick={handleClearQueue}
                  title="تفريغ طابور المعلقات في حالة وجود خلل"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    padding: '10px 14px',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={14} />
                  <span>مسح الطابور</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
