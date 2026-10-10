'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import MasterPage from '@/components/MasterPage';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import DiagnosticsPanel from '@/app/settings/DiagnosticsPanel';
import { useLanguage } from '@/lib/LanguageContext';

export default function DiagnosticsPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  const sidebarContent = useMemo(() => {
    const summary = (
      <div className="summary-glass-card">
        <div style={{ fontSize: '28px', marginBottom: '8px' }}>🩺</div>
        <span style={{ fontSize: '12px', fontWeight: 800, color: '#a89c8d' }}>
          {isEn ? 'System Health & Radar' : 'رادار الفحص والتشخيص الهندسي'}
        </span>
        <div style={{ fontSize: '15px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
          {isEn ? 'Continuous Diagnostics 🟢' : 'فحص ومراقبة فورية نشطة 🟢'}
        </div>
      </div>
    );

    const actions = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <Link href="/settings?tab=health" className="btn-main-glass white" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
          <span>⚙️</span>
          <span>{isEn ? 'Back to Settings' : 'العودة لإعدادات النظام'}</span>
        </Link>
        <Link href="/Dashboard" className="btn-main-glass gold" style={{ width: '100%', textDecoration: 'none', justifyContent: 'center' }}>
          <span>📊</span>
          <span>{isEn ? 'Dashboard' : 'لوحة التحكم العامة'}</span>
        </Link>
      </div>
    );

    return { summary, actions };
  }, [isEn]);

  return (
    <MasterPage icon="🩺" title={isEn ? 'Engineering System Diagnostics' : 'الفحص والتشخيص الفني للنظام'}>
      <RawasiSidebarManager summary={sidebarContent.summary} actions={sidebarContent.actions} watchDeps={[isEn]} />
      <div className="py-2">
        <DiagnosticsPanel />
      </div>
    </MasterPage>
  );
}
