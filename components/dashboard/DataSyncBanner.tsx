"use client";

import React, { useState } from 'react';
import { useOfflineSync } from '@/lib/offline/useOfflineSync';
import { 
  Database, 
  HardDrive, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Layers, 
  FileText, 
  ShoppingBag, 
  Users, 
  Calculator
} from 'lucide-react';

export default function DataSyncBanner() {
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    tableCounts, 
    timeAgoText, 
    triggerSync 
  } = useOfflineSync();

  const [isRotating, setIsRotating] = useState(false);

  const handleManualSync = async () => {
    setIsRotating(true);
    await triggerSync(true);
    setTimeout(() => setIsRotating(false), 800);
  };

  const isFullySynced = isOnline && pendingCount === 0;

  return (
    <>
      <style>{`
        .sync-banner-card {
          background: #FFFFFF;
          border-radius: 18px;
          border: 1px solid rgba(194, 155, 98, 0.25);
          box-shadow: 0 4px 18px rgba(30, 19, 11, 0.05);
          padding: 18px 22px;
          color: #1E130B;
          position: relative;
          overflow: hidden;
          direction: rtl;
          margin-bottom: 20px;
          transition: all 0.3s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .sync-banner-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 16px;
        }
        .sync-banner-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          padding-top: 14px;
          border-top: 1px dashed rgba(194, 155, 98, 0.25);
        }
        .sync-stat-box {
          background: #FDFBF7;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(194, 155, 98, 0.15);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .sync-banner-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          padding: 8px 16px;
          background: linear-gradient(135deg, #C29B62 0%, #A8573C 100%);
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          font-size: 12.5px;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0 3px 12px rgba(168, 87, 60, 0.2);
          transition: all 0.2s ease;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .sync-banner-btn:hover {
          transform: translateY(-1.5px);
          box-shadow: 0 6px 16px rgba(168, 87, 60, 0.3);
        }

        /* 📱 تكييف الشاشات المتوسطة واللوحية (Tablets) */
        @media (max-width: 1024px) {
          .sync-banner-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        /* 📱 تكييف شاشات الجوال والكاشير الصغيرة (Mobile/POS) */
        @media (max-width: 640px) {
          .sync-banner-card {
            padding: 14px 16px;
            border-radius: 14px;
            margin-bottom: 16px;
          }
          .sync-banner-top {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
            margin-bottom: 12px;
          }
          .sync-banner-btn {
            width: 100%;
            height: 38px;
          }
          .sync-banner-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            padding-top: 10px;
          }
          .sync-stat-box {
            padding: 8px 10px;
          }
        }
      `}</style>

      <div className="sync-banner-card">
        {/* 👑 شريط علوي بلون الذهب الملكي */}
        <div 
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            left: 0,
            height: '3.5px',
            background: isFullySynced
              ? 'linear-gradient(90deg, #C29B62 0%, #059669 50%, #C29B62 100%)'
              : 'linear-gradient(90deg, #A8573C 0%, #d97706 100%)'
          }}
        />

        <div className="sync-banner-top">
          {/* القسم الأيمن: العنوان والبادج */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: isFullySynced ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                border: `1.5px solid ${isFullySynced ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: isFullySynced ? '#059669' : '#A8573C',
                flexShrink: 0
              }}
            >
              {isFullySynced ? <Database size={20} /> : <AlertTriangle size={20} />}
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 900, color: '#1E130B' }}>
                  تزامن السجلات الحية
                </h3>

                {/* بادج حالة المزامنة */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: 800,
                    background: isFullySynced ? 'rgba(5, 150, 105, 0.12)' : 'rgba(217, 119, 6, 0.12)',
                    color: isFullySynced ? '#059669' : '#b45309',
                    border: `1px solid ${isFullySynced ? 'rgba(5, 150, 105, 0.25)' : 'rgba(217, 119, 6, 0.25)'}`
                  }}
                >
                  {isFullySynced ? (
                    <>
                      <CheckCircle2 size={12} />
                      <span>متزامن 100%</span>
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={12} />
                      <span>{pendingCount} معلق</span>
                    </>
                  )}
                </span>
              </div>

              {/* تفاصيل السجلات وآخر فحص */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px', fontSize: '11.5px', color: '#6b7280', fontWeight: 700, flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <HardDrive size={12} style={{ color: '#C29B62' }} />
                  <span>المربوط:</span>
                  <strong style={{ color: '#1E130B' }} suppressHydrationWarning>
                    {tableCounts.total.toLocaleString('ar-SA')} سجل
                  </strong>
                </span>

                <span>•</span>

                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} style={{ color: '#C29B62' }} />
                  <span>آخر فحص:</span>
                  <strong style={{ color: '#1E130B' }} suppressHydrationWarning>
                    {timeAgoText}
                  </strong>
                </span>
              </div>
            </div>
          </div>

          {/* القسم الأيسر: زر التحديث الفوري الدوار */}
          <button
            onClick={handleManualSync}
            disabled={isSyncing}
            className="sync-banner-btn"
          >
            <RefreshCw 
              size={14} 
              className={(isSyncing || isRotating) ? 'animate-spin' : ''} 
            />
            <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة فورية'}</span>
          </button>
        </div>

        {/* 📊 شبكة السجلات المتناسقة */}
        <div className="sync-banner-grid">
          {/* 1. فواتير المبيعات */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>فواتير المبيعات</span>
              <FileText size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.invoices.toLocaleString('ar-SA')}
            </div>
          </div>

          {/* 2. حركات المخزون والتشغيلات */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>حركات المخزون</span>
              <Layers size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.transactions.toLocaleString('ar-SA')}
            </div>
          </div>

          {/* 3. الأصناف والمستودعات */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>الأصناف</span>
              <ShoppingBag size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.items.toLocaleString('ar-SA')}
            </div>
          </div>

          {/* 4. العملاء والشركاء */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>العملاء</span>
              <Users size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.partners.toLocaleString('ar-SA')}
            </div>
          </div>

          {/* 5. شجرة الحسابات والقيود */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>الحسابات</span>
              <Calculator size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.accounts.toLocaleString('ar-SA')}
            </div>
          </div>

          {/* 6. ورديات الكاشير */}
          <div className="sync-stat-box">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11px', fontWeight: 800 }}>
              <span>الورديات</span>
              <Clock size={13} style={{ color: '#C29B62' }} />
            </div>
            <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '3px' }} suppressHydrationWarning>
              {tableCounts.shifts.toLocaleString('ar-SA')}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
