"use client";

import React from 'react';
import MasterPage from '@/components/MasterPage';
import ConnectedDevicesManager from '../ConnectedDevicesManager';
import { useLanguage } from '@/lib/LanguageContext';

export default function ConnectedDevicesPage() {
  const { language } = useLanguage();
  const isEn = language === 'en';

  return (
    <MasterPage
      title={isEn ? "Connected Hardware & POS Devices" : "الأجهزة والطرفيات ونقاط البيع"}
      subtitle={isEn ? "Manage receipt printers, barcode scanners, Mada POS terminals, scales, and hardware" : "إدارة طابعات الفواتير والباركود وماسحات الليزر وأجهزة مدى وأدراج النقدية والموازين"}
      icon="🖨️"
    >
      <ConnectedDevicesManager />
    </MasterPage>
  );
}
