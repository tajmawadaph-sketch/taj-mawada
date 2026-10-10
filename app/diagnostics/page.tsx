'use client';

import React from 'react';
import MasterPage from '@/components/MasterPage';
import DiagnosticsPanel from '@/app/settings/DiagnosticsPanel';

export default function DiagnosticsPage() {
  return (
    <MasterPage icon="🩺" title="الفحص والتشخيص الفني للنظام">
      <div className="py-2">
        <DiagnosticsPanel />
      </div>
    </MasterPage>
  );
}
