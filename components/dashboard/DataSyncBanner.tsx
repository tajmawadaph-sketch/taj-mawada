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
  Calculator,
  ArrowRight
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
    <div 
      className="data-sync-banner-container"
      style={{
        background: '#FFFFFF',
        borderRadius: '20px',
        border: '1px solid rgba(194, 155, 98, 0.25)',
        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
        padding: '20px 24px',
        color: '#1E130B',
        position: 'relative',
        overflow: 'hidden',
        direction: 'rtl',
        marginBottom: '24px',
        transition: 'all 0.3s ease'
      }}
    >
      {/* 👑 شريط علوي بلون الذهب الملكي */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          left: 0,
          height: '4px',
          background: isFullySynced
            ? 'linear-gradient(90deg, #C29B62 0%, #059669 50%, #C29B62 100%)'
            : 'linear-gradient(90deg, #A8573C 0%, #d97706 100%)'
        }}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '18px' }}>
        
        {/* القسم الأيمن: العنوان والبادج */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div 
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: isFullySynced ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
              border: `1.5px solid ${isFullySynced ? 'rgba(5, 150, 105, 0.3)' : 'rgba(168, 87, 60, 0.3)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isFullySynced ? '#059669' : '#A8573C'
            }}
          >
            {isFullySynced ? <Database size={24} /> : <AlertTriangle size={24} />}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#1E130B' }}>
                منظومة تزامن وربط البيانات الحية
              </h3>

              {/* بادج حالة المزامنة */}
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '30px',
                  fontSize: '12px',
                  fontWeight: 800,
                  background: isFullySynced ? 'rgba(5, 150, 105, 0.12)' : 'rgba(217, 119, 6, 0.12)',
                  color: isFullySynced ? '#059669' : '#b45309',
                  border: `1px solid ${isFullySynced ? 'rgba(5, 150, 105, 0.25)' : 'rgba(217, 119, 6, 0.25)'}`
                }}
              >
                {isFullySynced ? (
                  <>
                    <CheckCircle2 size={14} />
                    <span>متزامن بنسبة 100% بالسحابة والهارد</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} />
                    <span>يوجد {pendingCount} عملية بانتظار الترحيل</span>
                  </>
                )}
              </span>
            </div>

            {/* تفاصيل السجلات وآخر فحص */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '4px', fontSize: '12.5px', color: '#6b7280', fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <HardDrive size={13} style={{ color: '#C29B62' }} />
                <span>إجمالي السجلات المربوطة:</span>
                <strong style={{ color: '#1E130B' }} suppressHydrationWarning>
                  {tableCounts.total.toLocaleString('ar-SA')} سجل
                </strong>
              </span>

              <span>•</span>

              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={13} style={{ color: '#C29B62' }} />
                <span>آخر فحص وتحديث:</span>
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
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 800,
            cursor: isSyncing ? 'not-allowed' : 'pointer',
            boxShadow: '0 4px 15px rgba(168, 87, 60, 0.25)',
            transition: 'all 0.2s ease',
            opacity: isSyncing ? 0.7 : 1
          }}
          className="hover:translate-y-[-2px]"
        >
          <RefreshCw 
            size={16} 
            className={(isSyncing || isRotating) ? 'animate-spin' : ''} 
          />
          <span>{isSyncing ? 'جاري المزامنة...' : 'مزامنة وفحص فوري'}</span>
        </button>
      </div>

      {/* 📊 شبكة السجلات التفصيلية (Record Breakdown Grid) */}
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '12px',
          paddingTop: '14px',
          borderTop: '1px dashed rgba(194, 155, 98, 0.25)'
        }}
      >
        {/* 1. فواتير المبيعات */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>فواتير المبيعات</span>
            <FileText size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.invoices.toLocaleString('ar-SA')}
          </div>
        </div>

        {/* 2. حركات المخزون والتشغيلات */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>حركات المخزون</span>
            <Layers size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.transactions.toLocaleString('ar-SA')}
          </div>
        </div>

        {/* 3. الأصناف والمستودعات */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>الأصناف والمنتجات</span>
            <ShoppingBag size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.items.toLocaleString('ar-SA')}
          </div>
        </div>

        {/* 4. العملاء والشركاء */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>العملاء والشركاء</span>
            <Users size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.partners.toLocaleString('ar-SA')}
          </div>
        </div>

        {/* 5. شجرة الحسابات والقيود */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>شجرة الحسابات</span>
            <Calculator size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.accounts.toLocaleString('ar-SA')}
          </div>
        </div>

        {/* 6. ورديات الكاشير */}
        <div style={{ background: '#FDFBF7', padding: '12px 14px', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.15)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#6b7280', fontSize: '11.5px', fontWeight: 800 }}>
            <span>ورديات الكاشير</span>
            <Clock size={14} style={{ color: '#C29B62' }} />
          </div>
          <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }} suppressHydrationWarning>
            {tableCounts.shifts.toLocaleString('ar-SA')}
          </div>
        </div>
      </div>
    </div>
  );
}
