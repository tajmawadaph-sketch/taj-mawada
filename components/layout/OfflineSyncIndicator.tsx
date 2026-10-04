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
  ShieldCheck,
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
      {/* 🟢 زر المؤشر السريع في الشريط */}
      <button
        onClick={() => setIsModalOpen(true)}
        type="button"
        title="انقر لعرض تفاصيل ربط السحابة وقاعدة البيانات المحلية"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          background: '#FFFFFF',
          border: `1.5px solid ${isHealthy ? 'rgba(5, 150, 105, 0.3)' : 'rgba(217, 119, 6, 0.4)'}`,
          borderRadius: '30px',
          padding: '6px 14px',
          cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(30, 19, 11, 0.04)',
          color: '#1E130B',
          fontSize: '12px',
          fontWeight: 800,
          transition: 'all 0.2s ease',
          direction: 'rtl'
        }}
        className="hover:shadow-md hover:scale-[1.02]"
      >
        {/* نقطة الحالة النابضة */}
        <span 
          style={{
            position: 'relative',
            display: 'flex',
            height: '10px',
            width: '10px'
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
              height: '10px',
              width: '10px',
              backgroundColor: isHealthy ? '#059669' : '#d97706'
            }}
          />
        </span>

        {/* أيقونة قاعدة البيانات */}
        <Database size={14} style={{ color: '#C29B62' }} />

        {/* النص والبادج */}
        {isHealthy ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>مربوط</span>
            <span style={{ color: '#059669' }} suppressHydrationWarning>({tableCounts.total.toLocaleString('ar-SA')})</span>
          </span>
        ) : (
          <span style={{ color: '#b45309', fontWeight: 900 }}>
            {pendingCount > 0 ? `${pendingCount} معلق` : 'غير متصل'}
          </span>
        )}
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
            padding: '20px',
            direction: 'rtl'
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1.5px solid rgba(194, 155, 98, 0.3)',
              boxShadow: '0 25px 60px rgba(30, 19, 11, 0.3)',
              width: '100%',
              maxWidth: '520px',
              padding: '28px 24px',
              color: '#1E130B',
              position: 'relative',
              animation: 'scaleUp 0.25s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* زر الإغلاق */}
            <button
              onClick={() => setIsModalOpen(false)}
              style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                background: '#FDFBF7',
                border: '1px solid rgba(194, 155, 98, 0.2)',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#6b7280'
              }}
            >
              <X size={16} />
            </button>

            {/* عنوان المودال */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div 
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '14px',
                  background: 'rgba(194, 155, 98, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#C29B62'
                }}
              >
                <Server size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                  مركز مزامنة البيانات والربط الثنائي
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#6b7280', fontWeight: 700 }}>
                  مراقبة القناة السحابية (Supabase) والخزنة المحلية (IndexedDB / Disk)
                </p>
              </div>
            </div>

            {/* 📡 القناتان الأساسيتان */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              
              {/* القناة الأولى: السحابة */}
              <div 
                style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.2)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: isOnline ? '#059669' : '#A8573C' }}>
                    {isOnline ? <Cloud size={24} /> : <CloudOff size={24} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>
                      القناة السحابية (Supabase PostgreSQL)
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700, marginTop: '2px' }}>
                      {isOnline ? 'الاتصال نشط ومحدث لحظياً' : 'انقطع الاتصال بالسيرفر السحابي'}
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    background: isOnline ? 'rgba(5, 150, 105, 0.12)' : 'rgba(168, 87, 60, 0.12)',
                    color: isOnline ? '#059669' : '#A8573C',
                    border: `1px solid ${isOnline ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`
                  }}
                >
                  {isOnline ? 'متصل ومحدث' : 'أوفلاين'}
                </span>
              </div>

              {/* القناة الثانية: الخزنة المحلية */}
              <div 
                style={{
                  background: '#FDFBF7',
                  border: '1px solid rgba(194, 155, 98, 0.2)',
                  borderRadius: '16px',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ color: '#C29B62' }}>
                    <HardDrive size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>
                      الخزنة المحلية (IndexedDB & Local Disk)
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700, marginTop: '2px' }}>
                      قاعدة بيانات المتصفح والأرشيف المحلي <code style={{ fontSize: '10.5px', color: '#C29B62' }}>D:\TajMawadah_Data</code>
                    </div>
                  </div>
                </div>

                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11.5px',
                    fontWeight: 800,
                    background: 'rgba(5, 150, 105, 0.12)',
                    color: '#059669',
                    border: '1px solid rgba(5, 150, 105, 0.25)'
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
                borderRadius: '14px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '20px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 800 }}>
                {pendingCount > 0 ? <AlertTriangle size={18} style={{ color: '#d97706' }} /> : <CheckCircle2 size={18} style={{ color: '#059669' }} />}
                <span>
                  {pendingCount > 0 ? `يوجد ${pendingCount} عملية بانتظار الترحيل إلى السحابة` : 'طابور العمليات خالي ومكتمل بنسبة 100%'}
                </span>
              </div>
              <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700 }} suppressHydrationWarning>
                {timeAgoText}
              </span>
            </div>

            {/* أزرار الإجراءات */}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
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
                  boxShadow: '0 4px 15px rgba(168, 87, 60, 0.25)'
                }}
              >
                <RefreshCw size={16} className={(isSyncing || isRefreshing) ? 'animate-spin' : ''} />
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
                    gap: '6px',
                    padding: '12px 16px',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fecaca',
                    borderRadius: '14px',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                >
                  <Trash2 size={16} />
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
