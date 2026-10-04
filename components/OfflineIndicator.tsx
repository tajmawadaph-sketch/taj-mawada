"use client";

import React, { useEffect, useState } from 'react';
import { useOfflineSync } from '@/lib/offline/useOfflineSync';

export default function OfflineIndicator() {
  const [mounted, setMounted] = useState(false);
  const { isOnline, isSyncing, pendingCount, triggerSync } = useOfflineSync();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  // لا تعرض شيئاً إذا كان الجهاز متصلاً ولا يوجد فواتير معلقة
  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  return (
    <div 
      onClick={() => { if (isOnline && pendingCount > 0) triggerSync(); }}
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        zIndex: 99999,
        background: isOnline && pendingCount > 0 
          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.95), rgba(217, 119, 6, 0.95))' // تحذير برتقالي
          : !isOnline 
            ? 'linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(153, 27, 27, 0.95))' // أحمر (مقطوع)
            : 'linear-gradient(135deg, rgba(22, 163, 74, 0.95), rgba(5, 150, 105, 0.95))', // أخضر للمزامنة
        backdropFilter: 'blur(24px) saturate(160%)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '50px',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
        color: '#fff',
        fontWeight: 800,
        fontSize: '13px',
        cursor: isOnline && pendingCount > 0 ? 'pointer' : 'default',
        transition: 'all 0.3s ease',
        direction: 'rtl'
      }}
    >
      {!isOnline && (
        <>
          <span style={{ fontSize: '18px' }}>🔴</span>
          <span>
            الكاشير يعمل دون اتصال بالإنترنت (جاري العمل محلياً)
            {pendingCount > 0 && <span style={{ marginRight: '8px', background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '10px' }}>{pendingCount} فواتير معلقة</span>}
          </span>
        </>
      )}

      {isOnline && isSyncing && (
        <>
          <span style={{ fontSize: '18px', animation: 'spin 1s linear infinite' }}>⏳</span>
          <span>جاري ترحيل {pendingCount} عملية مبيعات للسحابة...</span>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </>
      )}

      {isOnline && !isSyncing && pendingCount > 0 && (
        <>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>يوجد {pendingCount} عمليات مبيعات لم تُرّحل (اضغط للترحيل يدويًا)</span>
        </>
      )}
    </div>
  );
}
