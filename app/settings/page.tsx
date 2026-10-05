"use client";
import React, { useState, useMemo, useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const ConnectedDevicesManager = dynamic(() => import('./ConnectedDevicesManager'), { 
  loading: () => <div style={{ textAlign: 'center', padding: '40px', fontWeight: 800, color: '#C29B62' }}>⏳ جاري تحميل مركز الأجهزة والطرفيات...</div>,
  ssr: false 
});

const PermissionsMatrix = dynamic(() => import('./PermissionsMatrix'), { 
  loading: () => <div style={{ textAlign: 'center', padding: '40px', fontWeight: 800, color: '#1C73AB' }}>⏳ جاري تحميل مصفوفة الصلاحيات...</div>,
  ssr: false 
});

const SystemHealthRadar = dynamic(() => import('./SystemHealthRadar'), { 
  loading: () => <div style={{ textAlign: 'center', padding: '40px', fontWeight: 800, color: '#1C73AB' }}>⏳ جاري فحص سلامة النظام...</div>,
  ssr: false 
});

const AuditLogs = dynamic(() => import('./AuditLogs'), { 
  loading: () => <div style={{ textAlign: 'center', padding: '40px', fontWeight: 800, color: '#1C73AB' }}>⏳ جاري تحميل سجل المراقبة...</div>,
  ssr: false 
});
import RawasiSidebarManager from '@/components/RawasiSidebarManager'; 
import MasterPage from '@/components/MasterPage';
import GlassContainer from '@/components/GlassContainer';
import DesktopInstallerCard from '@/components/DesktopInstallerCard';
import { THEME } from '@/lib/theme'; 
import { useToast } from '@/lib/toast-context';
import { useQueryClient } from '@tanstack/react-query';
import {
  SYSTEM_TABLES,
  exportToProfessionalExcel,
  exportToSQL,
  restoreUnifiedFile,
  clearTransactionsOnly,
  fullFactoryReset
} from '@/lib/backupRestoreEngine';
import { emitTableChange } from '@/lib/useRealtimeSync';
import { useLanguage } from '@/lib/LanguageContext';

// تجميع الجداول حسب الموديول للعرض
const TABLE_GROUPS = [
  {
    id: 'sales',
    nameAr: "🛒 المبيعات ونقاط البيع والتشغيل",
    nameEn: "🛒 Sales, POS & Operations",
    tables: SYSTEM_TABLES.filter(t => t.group === '🛒 المبيعات والتشغيل')
  },
  {
    id: 'finance',
    nameAr: "💰 المالية والحسابات العامة",
    nameEn: "💰 Finance & General Accounts",
    tables: SYSTEM_TABLES.filter(t => t.group === '💰 المالية والمحاسبة')
  },
  {
    id: 'inventory',
    nameAr: "📦 المخزون والمستودعات والأسطول",
    nameEn: "📦 Inventory, Warehouses & Fleet",
    tables: SYSTEM_TABLES.filter(t => t.group === '📦 المخزون والأسطول')
  },
  {
    id: 'partners',
    nameAr: "👥 الشركاء والموارد البشرية والإعدادات",
    nameEn: "👥 Partners, HR & System Settings",
    tables: SYSTEM_TABLES.filter(t => t.group === '👥 الشركاء والموارد البشرية' || t.group === '⚙️ إعدادات النظام')
  }
];

const TABLE_NAMES_EN: Record<string, string> = {
  invoices: 'Sales & POS Invoices',
  pos_shifts: 'POS Shifts & Cash Registers',
  pos_cash_drops: 'Cash Drop Transfers',
  fleet_operations: 'Fleet Trips & Daily Routes',
  partner_delivery_notes: 'Delivery Notes (Bayan)',
  journal_headers: 'Journal Entries (Headers)',
  journal_lines: 'Journal Entries (Details)',
  manual_journals: 'Manual Journal Entries',
  receipt_vouchers: 'Receipt Vouchers',
  payment_vouchers: 'Payment Vouchers',
  cash_flows: 'Cash Flows Register',
  expenses: 'Operating Expenses',
  chart_of_accounts: 'Chart of Accounts',
  inventory_items: 'Inventory Items & Products',
  warehouse_inventory: 'Warehouse Balances',
  vehicle_inventory: 'Vehicle Balances',
  inventory_transactions: 'Inventory Stock Transactions',
  warehouses: 'Warehouses & Branches',
  fleet_vehicles: 'Fleet Vehicles',
  partners: 'Partners (Clients & Vendors)',
  profiles: 'Users & Employees',
  payroll_slips: 'Payroll Slips',
  system_settings: 'System Configuration',
  audit_logs: 'Audit Logs & Trails'
};

type SettingsTab = 'devices' | 'backup' | 'restore' | 'reset' | 'permissions' | 'health' | 'audit';

function SettingsPageContent() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab') as SettingsTab | null;
  const [activeTab, setActiveTab] = useState<SettingsTab>(
    tabParam && ['devices', 'backup', 'restore', 'reset', 'permissions', 'health', 'audit'].includes(tabParam)
      ? tabParam
      : 'devices'
  ); 

  useEffect(() => {
    if (tabParam && ['devices', 'backup', 'restore', 'reset', 'permissions', 'health', 'audit'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const [selectedTables, setSelectedTables] = useState<string[]>(SYSTEM_TABLES.map(t => t.id));
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' }); 

  // نوافذ التأكيد الأمنية
  const [confirmModalType, setConfirmModalType] = useState<'clear' | 'factory' | null>(null);
  const [confirmInputText, setConfirmInputText] = useState('');

  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { language } = useLanguage();
  const isEn = language === 'en';

  const tabs: { id: SettingsTab; labelAr: string; labelEn: string; icon: string }[] = [
    { id: 'devices', labelAr: 'الأجهزة والطرفيات ونقاط البيع', labelEn: 'Connected Devices and POS', icon: '🖨️' },
    { id: 'backup', labelAr: 'تصدير النسخ الاحتياطية', labelEn: 'Export Backup', icon: '📦' },
    { id: 'restore', labelAr: 'استعادة البيانات الذكية', labelEn: 'Smart Restore', icon: '📥' },
    { id: 'reset', labelAr: 'التهيئة وتصفير الحركات', labelEn: 'Reset and Wipe', icon: '🚨' },
    { id: 'permissions', labelAr: 'مصفوفة الصلاحيات', labelEn: 'Permissions Matrix', icon: '🔐' },
    { id: 'health', labelAr: 'سلامة النظام (الرادار)', labelEn: 'System Health Radar', icon: '⚡' },
    { id: 'audit', labelAr: 'سجل المراقبة والعمليات', labelEn: 'Audit Logs', icon: '🕵️‍♂️' },
  ];

  // تبديل اختيار جدول
  const toggleTable = (id: string) => {
    setSelectedTables(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  // اختيار/إلغاء مجموعة
  const selectGroup = (tableIds: string[]) => {
    const allSelected = tableIds.every(id => selectedTables.includes(id));
    if (allSelected) {
      setSelectedTables(prev => prev.filter(id => !tableIds.includes(id))); 
    } else {
      setSelectedTables(prev => Array.from(new Set([...prev, ...tableIds]))); 
    }
  };

  // تحديد الكل / إلغاء الكل
  const selectAllTables = () => {
    if (selectedTables.length === SYSTEM_TABLES.length) {
      setSelectedTables([]);
    } else {
      setSelectedTables(SYSTEM_TABLES.map(t => t.id));
    }
  };

  // تحديد العمليات فقط
  const selectTransactionsOnly = () => {
    setSelectedTables(SYSTEM_TABLES.filter(t => !t.isMaster).map(t => t.id));
  };

  // تحديد الأساسيات فقط
  const selectMasterOnly = () => {
    setSelectedTables(SYSTEM_TABLES.filter(t => t.isMaster).map(t => t.id));
  };

  // تنفيذ تصدير الـ Excel الاحترافي
  const handleExportExcel = async () => {
    if (selectedTables.length === 0) {
      showToast(isEn ? '⚠️ Please select at least one table to export!' : '⚠️ يرجى تحديد جدول واحد على الأقل للتصدير!', 'warning');
      return;
    }
    setIsProcessing(true);
    setStatusMsg({ 
      text: isEn ? '⏳ Compiling data and building professional Excel workbook...' : '⏳ جاري تجميع البيانات وتجهيز ملف Excel الاحترافي...', 
      type: 'loading' 
    });
    try {
      const res = await exportToProfessionalExcel(selectedTables, (msg) => {
        setStatusMsg({ text: msg, type: 'loading' });
      });
      if (res.success) {
        showToast(isEn ? '✅ Formatted Excel report exported successfully!' : '✅ تم تصدير تقرير Excel الشامل بنجاح!', 'success');
        setStatusMsg({ text: isEn ? '✅ Excel file downloaded successfully' : '✅ تم تحميل ملف Excel بنجاح', type: 'success' });
      } else {
        showToast((isEn ? '❌ Export failed: ' : '❌ فشل التصدير: ') + (res.error || 'Unknown error'), 'error');
        setStatusMsg({ text: (isEn ? '❌ ' : '❌ ') + (res.error || 'Unknown error'), type: 'error' });
      }
    } catch (e: any) {
      showToast('❌ ' + e.message, 'error');
      setStatusMsg({ text: e.message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // تنفيذ تصدير الـ SQL
  const handleExportSQL = async () => {
    if (selectedTables.length === 0) {
      showToast(isEn ? '⚠️ Please select at least one table to export!' : '⚠️ يرجى تحديد جدول واحد على الأقل للتصدير!', 'warning');
      return;
    }
    setIsProcessing(true);
    setStatusMsg({ 
      text: isEn ? '⏳ Generating integrated PostgreSQL script...' : '⏳ جاري كتابة سكريبت SQL المتكامل (PostgreSQL)...', 
      type: 'loading' 
    });
    try {
      const res = await exportToSQL(selectedTables, (msg) => {
        setStatusMsg({ text: msg, type: 'loading' });
      });
      if (res.success) {
        showToast(isEn ? '✅ SQL script exported successfully!' : '✅ تم تصدير سكريبت SQL بنجاح!', 'success');
        setStatusMsg({ text: isEn ? '✅ SQL script downloaded successfully' : '✅ تم تحميل سكريبت SQL بنجاح', type: 'success' });
      } else {
        showToast((isEn ? '❌ SQL export failed: ' : '❌ فشل تصدير SQL: ') + (res.error || 'Unknown error'), 'error');
        setStatusMsg({ text: (isEn ? '❌ ' : '❌ ') + (res.error || 'Unknown error'), type: 'error' });
      }
    } catch (e: any) {
      showToast('❌ ' + e.message, 'error');
      setStatusMsg({ text: e.message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // تنفيذ الاستعادة الذكية (يقبل Excel أو SQL تلقائياً)
  const handleConfirmRestore = async () => {
    if (!selectedFile) return;
    
    setIsProcessing(true);
    setStatusMsg({ 
      text: isEn ? '⏳ Reading file and initializing smart restore...' : '⏳ جاري قراءة الملف وتجهيز الاستعادة الذكية...', 
      type: 'loading' 
    });

    try {
      const res = await restoreUnifiedFile(selectedFile, (msg) => {
        setStatusMsg({ text: msg, type: 'loading' });
      });

      if (res.success) {
        showToast(isEn ? `✨ Successfully restored ${res.totalRestored} records!` : `✨ تمت استعادة ${res.totalRestored} سجل بنجاح!`, 'success');
        setStatusMsg({ text: isEn ? `✅ Successfully restored ${res.totalRestored} records!` : `✅ تمت استعادة ${res.totalRestored} سجل بنجاح!`, type: 'success' });
        setSelectedFile(null);
        queryClient.invalidateQueries();
      } else {
        showToast((isEn ? '❌ Restore failed: ' : '❌ فشلت الاستعادة: ') + (res.error || 'Unknown error'), 'error');
        setStatusMsg({ text: (isEn ? '❌ ' : '❌ ') + (res.error || 'Unknown error'), type: 'error' });
      }
    } catch (err: any) {
      showToast('❌ ' + err.message, 'error');
      setStatusMsg({ text: '❌ ' + err.message, type: 'error' });
    } finally {
      setIsProcessing(false);
    }
  };

  // مطابقة نصوص الأمان للغتين
  const isClearPhraseValid = (text: string) => {
    const t = text.trim().toLowerCase();
    return t === 'مسح القيود' || t === 'clear' || t === 'wipe' || t === 'مسح';
  };

  const isFactoryPhraseValid = (text: string) => {
    const t = text.trim().toLowerCase();
    return t === 'ضبط المصنع' || t === 'reset' || t === 'factory' || t === 'ضبط';
  };

  // تنفيذ مسح القيود فقط
  const handleExecuteClearTransactions = async () => {
    if (!isClearPhraseValid(confirmInputText)) {
      showToast(isEn ? '⚠️ Confirmation text does not match!' : '⚠️ النص المدخل غير متطابق!', 'warning');
      return;
    }

    setIsProcessing(true);
    setConfirmModalType(null);
    setStatusMsg({ 
      text: isEn ? '🧹 Wiping transactions and resetting live balances...' : '🧹 جاري مسح كافة القيود والعمليات وتصفير الحركات...', 
      type: 'loading' 
    });

    try {
      const res = await clearTransactionsOnly((msg) => setStatusMsg({ text: msg, type: 'loading' }));
      if (res.success) {
        showToast(isEn ? '✅ All transactions wiped and balances reset successfully!' : '✅ تم مسح جميع القيود وسجل الورديات وأوامر تشغيل الرحلات وتصفير الأرصدة بنجاح!', 'success');
        setStatusMsg({ text: isEn ? '✅ Transactions wiped and balances reset successfully.' : '✅ تم مسح القيود وسجل الورديات وأوامر تشغيل الرحلات وتصفير الحركات بنجاح.', type: 'success' });
        
        // ⚡ بث التحديثات اللحظية وإبطال الكاش لكافة الشاشات
        emitTableChange('pos_shifts');
        emitTableChange('fleet_operations');
        emitTableChange('invoices');
        emitTableChange('receipt_vouchers');
        emitTableChange('payment_vouchers');
        emitTableChange('expenses');
        emitTableChange('inventory_transactions');
        emitTableChange('warehouse_inventory');
        emitTableChange('vehicle_inventory');
        emitTableChange('journal_headers');

        queryClient.invalidateQueries();
      } else {
        showToast((isEn ? '❌ Error: ' : '❌ خطأ: ') + (res.error || 'Unknown error'), 'error');
        setStatusMsg({ text: (isEn ? '❌ ' : '❌ ') + (res.error || 'Unknown error'), type: 'error' });
      }
    } catch (e: any) {
      showToast('❌ ' + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setConfirmInputText('');
    }
  };

  // تنفيذ ضبط المصنع الشامل
  const handleExecuteFactoryReset = async () => {
    if (!isFactoryPhraseValid(confirmInputText)) {
      showToast(isEn ? '⚠️ Confirmation text does not match!' : '⚠️ النص المدخل غير متطابق!', 'warning');
      return;
    }

    setIsProcessing(true);
    setConfirmModalType(null);
    setStatusMsg({ 
      text: isEn ? '⚠️ Performing full factory reset...' : '⚠️ جاري تنفيذ إعادة ضبط المصنع الشاملة للنظام...', 
      type: 'loading' 
    });

    try {
      const res = await fullFactoryReset((msg) => setStatusMsg({ text: msg, type: 'loading' }));
      if (res.success) {
        showToast(isEn ? '🚀 Full factory reset complete! The system is now initialized.' : '🚀 تمت إعادة ضبط المصنع بنجاح! النظام الآن نظيف ومهيأ كأول يوم عمل.', 'success');
        setStatusMsg({ text: isEn ? '✅ Full factory reset completed successfully.' : '✅ تمت إعادة ضبط المصنع الشاملة بنجاح.', type: 'success' });
        queryClient.invalidateQueries();
      } else {
        showToast((isEn ? '❌ Error: ' : '❌ خطأ: ') + (res.error || 'Unknown error'), 'error');
        setStatusMsg({ text: (isEn ? '❌ ' : '❌ ') + (res.error || 'Unknown error'), type: 'error' });
      }
    } catch (e: any) {
      showToast('❌ ' + e.message, 'error');
    } finally {
      setIsProcessing(false);
      setConfirmInputText('');
    }
  };

  const selectedCount = selectedTables.length;

  // إعداد محتويات السايد بار
  const sidebarContent = useMemo(() => {
    let summary = null;
    let actions = null;

    if (activeTab === 'devices') {
      summary = (
        <div className="sidebar-summary-glass">
          <div className="icon-pulse">🖨️</div>
          <p className="summary-title">{isEn ? 'Hardware & POS' : 'الأجهزة والطرفيات المتصلة'}</p>
          <h3 className="summary-value" style={{ fontSize: '13px', marginTop: '6px', color: '#C29B62' }}>
            {isEn ? 'Hardware Fleet Active' : 'مراقبة واختبار فوري'}
          </h3>
        </div>
      );
      actions = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, textAlign: 'center' }}>
            {isEn ? 'Hardware radar: Ready' : 'رادار فحص الطرفيات نشط'}
          </div>
        </div>
      );
    } else if (activeTab === 'backup') {
      summary = (
        <div className="sidebar-summary-glass">
          <div className="icon-pulse">📦</div>
          <p className="summary-title">{isEn ? 'Selected Tables' : 'الجداول المحددة للتصدير'}</p>
          <h3 className="summary-value">{selectedCount} / {SYSTEM_TABLES.length}</h3>
        </div>
      );
      actions = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button 
            onClick={handleExportExcel} 
            disabled={selectedCount === 0 || isProcessing}
            className={`btn-premium-glass excel ${selectedCount === 0 ? 'disabled' : ''}`}
          >
            <span className="btn-icon">📊</span> {isEn ? 'Export Excel Report' : 'تصدير Excel (تقرير احترافي)'}
          </button>
          <button 
            onClick={handleExportSQL} 
            disabled={selectedCount === 0 || isProcessing}
            className={`btn-premium-glass sql ${selectedCount === 0 ? 'disabled' : ''}`}
          >
            <span className="btn-icon">💾</span> {isEn ? 'Export SQL Script' : 'تصدير سكريبت SQL (Postgres)'}
          </button>
        </div>
      );
    } else if (activeTab === 'restore') {
      summary = (
        <div className="sidebar-summary-glass">
          <div className="icon-pulse">📥</div>
          <p className="summary-title">{isEn ? 'Smart Data Restore' : 'استعادة وترحيل البيانات'}</p>
          <h3 className="summary-value" style={{ fontSize: '13px', marginTop: '6px', color: '#1C73AB', wordBreak: 'break-all' }}>
            {selectedFile ? selectedFile.name : (isEn ? 'No file selected' : 'لم يتم اختيار ملف')}
          </h3>
        </div>
      );
      if (selectedFile) {
        actions = (
          <button 
            onClick={handleConfirmRestore} 
            disabled={isProcessing}
            className="btn-premium-glass excel"
          >
            🚀 {isEn ? 'Execute Restore' : 'بدء الاستعادة'}
          </button>
        );
      }
    } else if (activeTab === 'reset') {
      summary = (
        <div className="sidebar-summary-glass critical">
          <div className="icon-pulse">🚨</div>
          <p className="summary-title" style={{ color: '#b91c1c' }}>{isEn ? 'Danger Zone' : 'العمليات الحساسة'}</p>
          <h3 className="summary-value" style={{ fontSize: '13px', color: '#991b1b', marginTop: '6px' }}>
            {isEn ? 'Destructive Actions' : 'تصفير وإعادة تهيئة'}
          </h3>
        </div>
      );
    } else {
      summary = (
        <div className="sidebar-summary-glass info">
          <div className="icon-pulse">🛡️</div>
          <p className="summary-title" style={{color: '#1C73AB'}}>{isEn ? 'System Protected' : 'النظام محمي ومؤمن'}</p>
        </div>
      );
    }

    return { summary, actions };
  }, [activeTab, selectedCount, selectedTables, isProcessing, selectedFile, isEn]);

  return (
    <MasterPage icon="⚙️" title="إعدادات النظام والنسخ الاحتياطي" hideTitleOnMobile={true}>
      
      <RawasiSidebarManager 
        summary={sidebarContent.summary}
        actions={sidebarContent.actions}
        watchDeps={[activeTab, selectedCount, isProcessing, selectedFile, isEn]} 
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', animation: 'fadeUp 0.4s ease-out' }}>
        
        {/* شريط التبويبات المطور والمناسب للجوال */}
        <div className="settings-tabs-bar">
          {tabs.map((tab) => (
            <button 
              key={tab.id}
              className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`} 
              onClick={() => setActiveTab(tab.id)}
            >
              <span>{tab.icon}</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.15 }}>
                <span>{tab.labelAr}</span>
                <span style={{ fontSize: '10px', color: '#C29B62', fontWeight: 700, letterSpacing: '0.2px' }}>{tab.labelEn}</span>
              </div>
            </button>
          ))}
        </div>

        {/* 0. تبويب الأجهزة والطرفيات ونقاط البيع */}
        {activeTab === 'devices' && <ConnectedDevicesManager />}

        {/* 1. تبويب تصدير النسخ الاحتياطية */}
        {activeTab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <DesktopInstallerCard />
            <GlassContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '2px solid rgba(255, 255, 255, 0.5)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h2 style={{ fontSize: '16px', color: THEME.primary, margin: '0 0 4px 0', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>📦</span> {isEn ? 'Export Database Backup & Reports' : 'تصدير النسخ الاحتياطية والتقارير'}
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                  {isEn ? 'Select tables to export as a formatted multi-sheet Excel workbook or a PostgreSQL script.' : 'حدد الجداول المراد استخراجها كتقرير Excel احترافي منسق أو كسكريبت SQL.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button onClick={selectAllTables} className="btn-action-small">
                  {selectedCount === SYSTEM_TABLES.length ? (isEn ? 'Deselect All' : 'إلغاء التحديد') : (isEn ? 'Select All' : 'تحديد كل الجداول')}
                </button>
                <button onClick={selectTransactionsOnly} className="btn-action-small">
                  {isEn ? 'Transactions Only' : 'العمليات فقط'}
                </button>
                <button onClick={selectMasterOnly} className="btn-action-small">
                  {isEn ? 'Master Data Only' : 'الأساسيات فقط'}
                </button>
              </div>
            </div>

            <div className="cinematic-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '14px', maxHeight: '520px', overflowY: 'auto', paddingRight: '4px' }}>
              {TABLE_GROUPS.map((group) => (
                <div key={group.id} className="group-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid rgba(40, 145, 200, 0.15)', paddingBottom: '6px' }}>
                    <h3 style={{ margin: 0, fontSize: '12.5px', color: THEME.primary, fontWeight: 900 }}>
                      {isEn ? group.nameEn : group.nameAr}
                    </h3>
                    <button onClick={() => selectGroup(group.tables.map(t => t.id))} className="link-btn">
                      {group.tables.every(t => selectedTables.includes(t.id)) ? (isEn ? 'Clear' : 'إلغاء') : (isEn ? 'Select All' : 'تحديد الكل')}
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {group.tables.map(table => (
                      <div key={table.id} className={`table-row ${selectedTables.includes(table.id) ? 'selected' : ''}`}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 800, color: '#334155', flex: 1 }}>
                          <input 
                            type="checkbox" 
                            className="custom-checkbox" 
                            checked={selectedTables.includes(table.id)} 
                            onChange={() => toggleTable(table.id)} 
                          />
                          <span>{isEn ? (TABLE_NAMES_EN[table.id] || table.name) : table.name}</span>
                        </label>
                        {table.isMaster && (
                          <span className="badge-master" title={isEn ? 'Master Data' : 'جدول أساسي'}>
                            {isEn ? 'Master' : 'أساسي'}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* أزرار سريعة للشاشات المتجاوبة والجوال */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid rgba(40,145,200,0.15)', flexWrap: 'wrap' }}>
              <button 
                onClick={handleExportExcel} 
                disabled={selectedCount === 0 || isProcessing}
                style={{ flex: 1, minWidth: '160px', padding: '12px', background: 'linear-gradient(135deg, #10b981, #059669)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                📊 {isEn ? 'Export Formatted Excel' : 'تصدير Excel احترافي'}
              </button>
              <button 
                onClick={handleExportSQL} 
                disabled={selectedCount === 0 || isProcessing}
                style={{ flex: 1, minWidth: '160px', padding: '12px', background: 'linear-gradient(135deg, #1C73AB, #2891C8)', color: 'white', border: 'none', borderRadius: '12px', fontWeight: 900, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                💾 {isEn ? 'Export SQL Script' : 'تصدير سكريبت SQL'}
              </button>
            </div>
          </GlassContainer>
          </div>
        )}

        {/* 2. تبويب استعادة البيانات الذكية */}
        {activeTab === 'restore' && (
          <GlassContainer>
            <div style={{ marginBottom: '18px', borderBottom: '2px solid rgba(255, 255, 255, 0.5)', paddingBottom: '12px' }}>
              <h2 style={{ fontSize: '16px', color: THEME.primary, margin: '0 0 4px 0', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🔄</span> {isEn ? 'Smart Data Restore & Migration' : 'استعادة البيانات الذكية (Restore)'}
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#64748b', fontWeight: 700, lineHeight: 1.5 }}>
                {isEn 
                  ? 'Upload your backup file (.xlsx or .sql). The engine will automatically detect format, preserve dependencies, and perform safe upsert.' 
                  : 'ارفع ملف النسخة الاحتياطية سواء كان ملف Excel (.xlsx) أو ملف SQL (.sql)، وسيقوم المحرك باستعادته آلياً مع مطابقة الحقول وحمايتها.'}
              </p>
            </div>

            <label className={`premium-dropzone ${selectedFile ? 'has-file' : ''} ${isProcessing ? 'uploading' : ''}`}>
              {isProcessing ? (
                <div style={{ width: '100%', padding: '20px 0' }}>
                  <div className="loading-spinner">⚙️</div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: THEME.primary, marginTop: '10px' }}>
                    {statusMsg.text || (isEn ? 'Processing and restoring data...' : 'جاري معالجة واستعادة البيانات...')}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '42px' }}>{selectedFile ? '📑' : '📂'}</div>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 900, color: selectedFile ? '#059669' : THEME.primary, marginBottom: '4px' }}>
                      {selectedFile ? selectedFile.name : (isEn ? 'Drag and drop or browse backup file' : 'اسحب أو اختر ملف النسخة الاحتياطية')}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#475569', fontWeight: 700 }}>
                      {selectedFile ? `${isEn ? 'Size:' : 'الحجم:'} ${(selectedFile.size / 1024).toFixed(1)} KB` : (isEn ? 'Supports .xlsx, .xls and .sql files' : 'يدعم صيغ .xlsx أو .sql')}
                    </div>
                  </div>
                </>
              )}
              <input 
                type="file" 
                accept=".xlsx,.xls,.sql" 
                disabled={isProcessing}
                onChange={(e) => { 
                  if (e.target.files && e.target.files[0]) {
                    setSelectedFile(e.target.files[0]);
                    setStatusMsg({ text: '', type: '' }); 
                  } 
                }} 
                style={{ display: 'none' }} 
              />
            </label>

            {statusMsg.text && (
              <div className={`status-alert ${statusMsg.type}`}>
                {statusMsg.text}
              </div>
            )}

            {selectedFile && !isProcessing && (
              <button onClick={handleConfirmRestore} className="btn-premium-upload">
                🚀 {isEn ? 'Start Smart Data Migration' : 'بدء استعادة وترحيل البيانات'}
              </button>
            )}

            <div style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(40,145,200,0.2)', padding: '14px 16px', borderRadius: '14px', marginTop: '18px' }}>
              <div style={{ color: THEME.primary, fontWeight: 900, fontSize: '12.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>💡</span> {isEn ? 'Smart Restore Capabilities' : 'مميزات الاستعادة الذكية'}
              </div>
              <ul style={{ fontSize: '11.5px', color: '#475569', margin: '6px 0 0 0', paddingRight: isEn ? '0' : '18px', paddingLeft: isEn ? '18px' : '0', lineHeight: 1.6, fontWeight: 700 }}>
                <li>{isEn ? 'Automatically identifies multi-sheet Excel files or PostgreSQL dump scripts.' : 'يتعرف آلياً على الملف سواء كان Excel متعدد الصفحات أو سكريبت SQL.'}</li>
                <li>{isEn ? 'Applies collision protection (Upsert) to avoid duplicate primary key collisions.' : 'يطبق الحماية ضد التكرار (Upsert) لمنع ازدواجية المعرفات والبيانات.'}</li>
                <li>{isEn ? 'Orders table insertion hierarchically to respect foreign key constraints.' : 'يراعي ترتيب التبعيات والمفتاح الخارجي لمنع أي تعارض في القيود.'}</li>
              </ul>
            </div>
          </GlassContainer>
        )}

        {/* 3. تبويب منطقة العمليات الحساسة وإعادة التهيئة */}
        {activeTab === 'reset' && (
          <div className="danger-zone-container">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <span style={{ fontSize: '26px' }}>🛡️</span>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#991b1b' }}>
                  {isEn ? 'System Reset & Maintenance Zone' : 'منطقة العمليات الحساسة وإعادة التهيئة'}
                </h3>
                <p style={{ margin: 0, fontSize: '12px', color: '#b91c1c', fontWeight: 700 }}>
                  {isEn ? 'High-security administrative controls to purge transactions or reset to initial setup.' : 'تحكم دقيق لتنظيف النظام وتصفير الحركات قبل بدء دورة تشغيل جديدة.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              
              {/* البطاقة الأولى: مسح القيود وتصفير الحركات فقط */}
              <div className="danger-card warning-level">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 900, fontSize: '14px', color: '#b45309' }}>
                    🧹 {isEn ? 'Wipe Transactions & Reset Balances' : 'مسح القيود وتصفير الحركات'}
                  </div>
                  <span className="badge-safe">{isEn ? 'Preserves Masters' : 'يحافظ على الأساسيات'}</span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#78350f', lineHeight: 1.5, margin: '0 0 15px 0', fontWeight: 700 }}>
                  {isEn 
                    ? 'Deletes all invoices, vouchers, journal entries, expenses, POS shifts, and fleet trip dispatches. Resets inventory and bottle custodies to 0. Keeps Chart of Accounts, Customers, Vendors, Warehouses, and Items intact.' 
                    : 'يحذف الفواتير، سندات القبض والصرف، القيود المحاسبية، المصروفات، سجل الورديات (نقاط البيع)، أوامر تشغيل الرحلات (الأسطول)، والتدفقات، ويصفر أرصدة المخزون وعهد الفوارغ. ويحافظ تماماً على شجرة الحسابات، العملاء، الموردين، المستودعات، والأصناف.'}
                </p>
                <button 
                  onClick={() => { setConfirmModalType('clear'); setConfirmInputText(''); }}
                  className="btn-danger warning"
                  disabled={isProcessing}
                >
                  🧹 {isEn ? 'Wipe Transactions Only' : 'مسح القيود وتصفير الحركات'}
                </button>
              </div>

              {/* البطاقة الثانية: إعادة ضبط المصنع الشاملة */}
              <div className="danger-card critical-level">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ fontWeight: 900, fontSize: '14px', color: '#991b1b' }}>
                    🚨 {isEn ? 'Full Factory Reset' : 'إعادة ضبط المصنع الشاملة'}
                  </div>
                  <span className="badge-critical">{isEn ? 'Critical Action' : 'إجراء كلي وحرج'}</span>
                </div>
                <p style={{ fontSize: '11.5px', color: '#7f1d1d', lineHeight: 1.5, margin: '0 0 15px 0', fontWeight: 700 }}>
                  {isEn 
                    ? 'Full reinitialization to day-one state. Deletes all transactions and custom data including customers and extra items, retaining only the system administrator account and core chart of accounts.' 
                    : 'إعادة تهيئة كاملة للنظام كأول يوم تشغيل. يحذف كافة العمليات والبيانات المدخلة بما فيها العملاء والأصناف والسيارات الإضافية، مع الإبقاء فقط على حساب مدير النظام الحالي وشجرة الحسابات الأساسية.'}
                </p>
                <button 
                  onClick={() => { setConfirmModalType('factory'); setConfirmInputText(''); }}
                  className="btn-danger critical"
                  disabled={isProcessing}
                >
                  🚨 {isEn ? 'Execute Factory Reset' : 'إعادة ضبط المصنع الشاملة'}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* 4. تبويب مصفوفة الصلاحيات */}
        {activeTab === 'permissions' && <PermissionsMatrix />}

        {/* 5. تبويب رادار سلامة النظام */}
        {activeTab === 'health' && <SystemHealthRadar />}

        {/* 6. تبويب سجل العمليات والمراقبة */}
        {activeTab === 'audit' && <AuditLogs />}

      </div>

      {/* ========================================================================= */}
      {/* 🔒 نافذة التأكيد الأمني للعمليات الخطيرة                                   */}
      {/* ========================================================================= */}
      {confirmModalType && (
        <div className="security-modal-overlay">
          <div className="security-modal-card">
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>
              {confirmModalType === 'clear' ? '⚠️' : '🚨'}
            </div>
            
            <h2 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 900, color: confirmModalType === 'clear' ? '#b45309' : '#dc2626' }}>
              {confirmModalType === 'clear' 
                ? (isEn ? 'Confirm Wipe Transactions' : 'تأكيد مسح القيود وتصفير الحركات') 
                : (isEn ? 'Confirm Factory Reset' : 'تأكيد إعادة ضبط المصنع الشاملة')}
            </h2>

            <p style={{ fontSize: '12px', color: '#475569', lineHeight: 1.6, margin: '0 0 14px 0', fontWeight: 700 }}>
              {confirmModalType === 'clear' ? (
                <>
                  {isEn ? (
                    <>
                      You are about to delete all <strong>invoices, vouchers, journal entries, expenses, shifts, and routes</strong> and reset stock balances.
                      <br/>
                      <span style={{ color: '#059669', fontWeight: 900 }}>✅ Customers, products, warehouses, and accounts will NOT be deleted.</span>
                    </>
                  ) : (
                    <>
                      أنت على وشك حذف جميع <strong>الفواتير، السندات، القيود المحاسبية، المصروفات، والورديات</strong> وتصفير أرصدة المخزون.
                      <br/>
                      <span style={{ color: '#059669', fontWeight: 900 }}>✅ لن يتم حذف العملاء، الأصناف، شجرة الحسابات، أو المستودعات.</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  {isEn ? (
                    <>
                      You are about to execute a <strong>Full Factory Reset</strong>. ALL system data, transactions, and custom partners will be permanently wiped!
                      <br/>
                      <span style={{ color: '#dc2626', fontWeight: 900 }}>⛔ This action is irreversible!</span>
                    </>
                  ) : (
                    <>
                      أنت على وشك <strong>إعادة ضبط المصنع الشاملة</strong>. سيتم مسح كافة البيانات والعمليات والعملاء والأصناف بالكامل!
                      <br/>
                      <span style={{ color: '#dc2626', fontWeight: 900 }}>⛔ هذا الإجراء لا يمكن التراجع عنه نهائياً!</span>
                    </>
                  )}
                </>
              )}
            </p>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px dashed #cbd5e1', marginBottom: '15px' }}>
              <label style={{ fontSize: '12px', fontWeight: 900, color: '#334155', display: 'block', marginBottom: '6px' }}>
                {isEn 
                  ? `To confirm, please type: ` 
                  : `للتأكيد، يرجى كتابة عبارة: `}
                <span style={{ color: '#dc2626', fontWeight: 900 }}>
                  ({confirmModalType === 'clear' ? (isEn ? 'clear or مسح القيود' : 'مسح القيود') : (isEn ? 'reset or ضبط المصنع' : 'ضبط المصنع')})
                </span>
              </label>
              <input 
                type="text"
                className="security-input"
                placeholder={confirmModalType === 'clear' ? (isEn ? 'clear' : 'مسح القيود') : (isEn ? 'reset' : 'ضبط المصنع')}
                value={confirmInputText}
                onChange={(e) => setConfirmInputText(e.target.value)}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button 
                onClick={confirmModalType === 'clear' ? handleExecuteClearTransactions : handleExecuteFactoryReset}
                disabled={confirmModalType === 'clear' ? !isClearPhraseValid(confirmInputText) : !isFactoryPhraseValid(confirmInputText)}
                className={`btn-confirm-action ${confirmModalType === 'clear' ? 'warning' : 'critical'}`}
              >
                {isEn ? 'Confirm & Execute ⚡' : 'تأكيد التنفيذ فوراً ⚡'}
              </button>
              <button 
                onClick={() => { setConfirmModalType(null); setConfirmInputText(''); }}
                className="btn-cancel-action"
              >
                {isEn ? 'Cancel' : 'إلغاء الأمر'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ستايلات الـ CSS وفق طابع Aqua Glassmorphism */}
      <style>{`
        .settings-tabs-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .settings-tabs-bar::-webkit-scrollbar {
          display: none;
        }

        .tab-btn { 
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 18px; 
          border-radius: 14px; 
          border: 1px solid rgba(40, 145, 200, 0.2); 
          font-weight: 900; 
          font-size: 13px; 
          cursor: pointer; 
          transition: 0.2s; 
          background: rgba(255, 255, 255, 0.7); 
          color: #64748b; 
          white-space: nowrap; 
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }
        .tab-btn:hover { 
          background: rgba(255, 255, 255, 0.95); 
          color: #1C73AB; 
          transform: translateY(-2px); 
        }
        .tab-btn.active { 
          background: linear-gradient(135deg, #1C73AB, #2891C8); 
          color: white; 
          border-color: #1C73AB; 
          box-shadow: 0 4px 15px rgba(28, 115, 171, 0.25); 
        }

        .group-card { 
          background: rgba(255, 255, 255, 0.6); 
          padding: 12px; 
          border-radius: 14px; 
          border: 1px solid rgba(255, 255, 255, 0.8); 
          box-shadow: 0 4px 15px rgba(28, 115, 171, 0.04);
        }
        .table-row { 
          display: flex; 
          justify-content: space-between; 
          align-items: center; 
          padding: 7px 10px; 
          background: white; 
          border-radius: 9px; 
          margin-top: 4px; 
          border: 1px solid rgba(40, 145, 200, 0.15); 
          transition: 0.2s; 
        }
        .table-row.selected { 
          border-color: #2891C8; 
          background: rgba(40, 145, 200, 0.05); 
        }
        .table-row:hover { 
          border-color: #1C73AB; 
        }
        .custom-checkbox { 
          width: 16px; 
          height: 16px; 
          cursor: pointer; 
          accent-color: #1C73AB; 
        }

        .btn-action-small {
          background: rgba(255, 255, 255, 0.8); 
          border: 1px solid rgba(40, 145, 200, 0.2); 
          padding: 6px 12px; 
          border-radius: 8px; 
          cursor: pointer; 
          font-weight: 800; 
          color: #1C73AB; 
          font-size: 11px;
          transition: 0.2s;
        }
        .btn-action-small:hover { 
          background: #1C73AB; 
          color: white; 
        }

        .link-btn { 
          background: none; 
          border: none; 
          color: #0284c7; 
          cursor: pointer; 
          font-weight: 800; 
          font-size: 11px; 
        }
        .link-btn:hover { 
          text-decoration: underline; 
        }

        .badge-master {
          font-size: 9.5px; 
          font-weight: 800; 
          background: #e0f2fe; 
          color: #0369a1;
          padding: 2px 6px; 
          border-radius: 6px; 
          border: 1px solid #bae6fd;
        }

        .premium-dropzone { 
          background: rgba(255, 255, 255, 0.6); 
          border: 2px dashed rgba(40, 145, 200, 0.3); 
          border-radius: 18px; 
          padding: 25px 20px; 
          text-align: center; 
          cursor: pointer; 
          transition: 0.2s; 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
          justify-content: center; 
          align-items: center; 
        }
        .premium-dropzone:hover { 
          background: white; 
          border-color: #1C73AB; 
        }
        .premium-dropzone.has-file { 
          background: #f0fdf4; 
          border-color: #10b981; 
          border-style: solid; 
        }
        .premium-dropzone.uploading { 
          pointer-events: none; 
          opacity: 0.8; 
          border-color: #1C73AB; 
        }
        
        .loading-spinner { 
          font-size: 24px; 
          animation: spin 2s linear infinite; 
        }
        .btn-premium-upload { 
          background: linear-gradient(135deg, #1C73AB, #2891C8); 
          color: white; 
          padding: 12px; 
          border-radius: 12px; 
          border: none; 
          font-weight: 900; 
          font-size: 14px; 
          cursor: pointer; 
          transition: 0.2s; 
          width: 100%; 
          margin-top: 12px; 
          box-shadow: 0 4px 15px rgba(28, 115, 171, 0.25);
        }
        .btn-premium-upload:hover { 
          transform: translateY(-2px); 
          filter: brightness(1.1); 
        }

        .sidebar-summary-glass { 
          background: rgba(255,255,255,0.85); 
          padding: 16px; 
          border-radius: 18px; 
          text-align: center; 
          border: 1px solid rgba(40, 145, 200, 0.2); 
          box-shadow: 0 4px 20px rgba(28, 115, 171, 0.08);
        }
        .sidebar-summary-glass.critical {
          background: rgba(254, 242, 242, 0.9);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .sidebar-summary-glass .icon-pulse { 
          font-size: 26px; 
          margin-bottom: 4px; 
        }
        .summary-title { 
          margin: 0; 
          font-size: 11.5px; 
          color: #64748b; 
          font-weight: 800; 
        }
        .summary-value { 
          margin: 4px 0 0 0; 
          font-weight: 900; 
          font-size: 22px; 
          color: #122946; 
        }

        .btn-premium-glass { 
          width: 100%; 
          padding: 11px; 
          border-radius: 12px; 
          border: none; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          gap: 8px; 
          cursor: pointer; 
          font-weight: 900; 
          font-size: 12.5px; 
          transition: 0.2s; 
        }
        .btn-premium-glass.excel { 
          background: linear-gradient(135deg, #10b981, #059669); 
        }
        .btn-premium-glass.sql { 
          background: linear-gradient(135deg, #1C73AB, #2891C8); 
        }
        .btn-premium-glass:hover:not(.disabled) { 
          transform: translateY(-2px); 
          filter: brightness(1.1); 
        }
        .btn-premium-glass.disabled { 
          opacity: 0.5; 
          cursor: not-allowed; 
        }

        .status-alert { 
          padding: 10px; 
          border-radius: 10px; 
          font-size: 12px; 
          font-weight: 800; 
          text-align: center; 
          margin-top: 12px; 
        }
        .status-alert.loading { 
          background: #eff6ff; 
          color: #1d4ed8; 
          border: 1px solid #bfdbfe; 
        }
        .status-alert.success { 
          background: #f0fdf4; 
          color: #15803d; 
          border: 1px solid #bbf7d0; 
        }
        .status-alert.error { 
          background: #fef2f2; 
          color: #b91c1c; 
          border: 1px solid #fecaca; 
        }

        /* منطقة العمليات الحساسة */
        .danger-zone-container {
          background: rgba(254, 242, 242, 0.7);
          border: 1.5px solid rgba(239, 68, 68, 0.3);
          border-radius: 20px;
          padding: 20px;
          backdrop-filter: blur(10px);
        }
        .danger-card {
          background: white;
          padding: 16px;
          border-radius: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          border: 1px solid rgba(0,0,0,0.06);
          box-shadow: 0 4px 15px rgba(0,0,0,0.03);
        }
        .danger-card.warning-level { 
          border-top: 4px solid #f59e0b; 
        }
        .danger-card.critical-level { 
          border-top: 4px solid #ef4444; 
        }

        .badge-safe {
          font-size: 10px; 
          font-weight: 800; 
          background: #fef3c7; 
          color: #b45309;
          padding: 2px 8px; 
          border-radius: 12px; 
          border: 1px solid #fde68a;
        }
        .badge-critical {
          font-size: 10px; 
          font-weight: 800; 
          background: #fee2e2; 
          color: #b91c1c;
          padding: 2px 8px; 
          border-radius: 12px; 
          border: 1px solid #fca5a5;
        }

        .btn-danger {
          width: 100%; 
          padding: 11px; 
          border-radius: 10px;
          border: none; 
          font-weight: 900; 
          font-size: 12.5px;
          cursor: pointer; 
          transition: 0.2s;
        }
        .btn-danger.warning { 
          background: #fffbeb; 
          color: #b45309; 
          border: 1.5px solid #f59e0b; 
        }
        .btn-danger.warning:hover { 
          background: #f59e0b; 
          color: white; 
        }
        .btn-danger.critical { 
          background: #fef2f2; 
          color: #dc2626; 
          border: 1.5px solid #ef4444; 
        }
        .btn-danger.critical:hover { 
          background: #dc2626; 
          color: white; 
        }

        /* نافذة التأكيد الأمني */
        .security-modal-overlay {
          position: fixed; 
          inset: 0;
          background: rgba(18, 41, 70, 0.88);
          backdrop-filter: blur(10px);
          display: flex; 
          align-items: center; 
          justify-content: center;
          z-index: 999999999; 
          padding: 16px;
        }
        .security-modal-card {
          background: white; 
          border-radius: 20px;
          padding: 22px; 
          max-width: 440px; 
          width: 100%;
          text-align: center; 
          box-shadow: 0 25px 50px rgba(0,0,0,0.4);
          animation: fadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .security-input {
          width: 100%; 
          padding: 10px; 
          border: 2px solid #cbd5e1;
          border-radius: 8px; 
          font-size: 14px; 
          font-weight: 900;
          text-align: center; 
          outline: none; 
          margin-top: 5px;
          box-sizing: border-box;
        }
        .security-input:focus { 
          border-color: #dc2626; 
        }
        .btn-confirm-action {
          flex: 1; 
          padding: 11px; 
          border-radius: 10px; 
          border: none;
          font-weight: 900; 
          font-size: 13px; 
          cursor: pointer; 
          color: white;
          transition: 0.2s;
        }
        .btn-confirm-action.warning { 
          background: #d97706; 
        }
        .btn-confirm-action.warning:disabled { 
          opacity: 0.4; 
          cursor: not-allowed; 
        }
        .btn-confirm-action.critical { 
          background: #dc2626; 
        }
        .btn-confirm-action.critical:disabled { 
          opacity: 0.4; 
          cursor: not-allowed; 
        }
        .btn-cancel-action {
          padding: 11px 18px; 
          border-radius: 10px; 
          border: 1px solid #cbd5e1;
          background: white; 
          color: #475569; 
          font-weight: 800; 
          cursor: pointer;
        }

        @media (max-width: 768px) {
          .settings-tabs-bar {
            gap: 6px;
          }
          .tab-btn {
            padding: 8px 12px;
            font-size: 12px;
            border-radius: 11px;
          }
          .security-modal-card {
            padding: 18px 14px;
            width: 95vw !important;
          }
          .danger-zone-container {
            padding: 14px;
          }
        }

        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </MasterPage>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px', fontWeight: 800, color: '#C29B62' }}>⏳ جاري تحميل الإعدادات...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
