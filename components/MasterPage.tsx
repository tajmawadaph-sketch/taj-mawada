"use client";
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom'; 
import { THEME } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import NotificationsModal from './NotificationsModal';
import Link from 'next/link';
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { useRealtimeListener } from '@/lib/useRealtimeSync';
import { useRouter, usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/LanguageContext';
import { toast } from 'react-hot-toast';
import OfflineSyncIndicator from './layout/OfflineSyncIndicator';

const PAGE_TITLES_EN: Record<string, string> = {
  // Common Titles
  "دليل العملاء": "Partners Directory",
  "دليل العملاء والشركاء": "Partners Directory",
  "الشركاء والعملاء": "Partners & Clients",
  "الشركاء": "Partners Directory",
  "دليل الشركاء": "Partners Directory",
  "الفواتير والمبيعات": "Invoices & Sales",
  "فواتير المبيعات": "Sales Invoices",
  "الأصناف": "Inventory Items",
  "إدارة الأصناف": "Inventory Items",
  "دليل الأصناف والمخزون": "Items & Inventory Catalog",
  "سندات القبض": "Receipt Vouchers",
  "سندات القبض والتحصيلات": "Receipt Vouchers",
  "سندات الصرف": "Payment Vouchers",
  "المصروفات": "Expenses",
  "سجل المصروفات الموحد": "Expenses Register",
  "إدارة المصروفات": "Expenses Management",
  "دفتر اليومية": "General Journal",
  "دفتر اليومية الشامل": "General Journal",
  "القيود اليدوية": "Manual Journals",
  "القيود اليدوية (التسويات)": "Manual Journals",
  "شجرة الحسابات": "Chart of Accounts",
  "شجرة الحسابات والميزان": "Chart of Accounts & Trial Balance",
  "دليل الحسابات": "Chart of Accounts",
  "دفتر الأستاذ": "General Ledger",
  "ميزان المراجعة": "Trial Balance",
  "المركز المالي": "Financial Center",
  "القوائم المالية": "Financial Statements",
  "القوائم المالية الجاهزة": "Financial Statements",
  "الخطة المالية والموازنة": "Financial Plan & Budget",
  "التدفقات النقدية": "Cash Flows",
  "أرصدة العملاء": "Partner Balances",
  "أرصدة وذمم العملاء": "Partner Balances & Receivables",
  "أرصدة الشركاء وكشف الحساب": "Partner Balances & Statement",
  "ذمم المناديب": "Delegate Debts",
  "تسويات العهد": "Delegate Settlements",
  "تسوية عهد المناديب": "Delegate Custody Settlements",
  "كشف حساب": "Account Statement",
  "كشف حساب تفصيلي": "Detailed Statement",
  "كشف حساب الشركاء": "Partner Account Statement",
  "شاشة الكاشير (POS)": "POS Cashier",
  "شاشة الكاشير": "POS Cashier",
  "الكاشير ونقاط البيع": "POS & Cashier",
  "تسوية عهد منافذ البيع": "POS Custody Settlements",
  "تسوية عهد منافذ البيع وإغلاق الورديات": "POS Custody Settlements & Shift Closing",
  "أرباح منافذ البيع": "Outlets Profitability",
  "لوحة الربحية الشاملة": "Profitability Dashboard",
  "لوحة القيادة": "Dashboard",
  "لوحة القيادة المركزية": "Central Dashboard",
  "الملخص العام": "Global Summary",
  "المستودعات": "Warehouses",
  "إدارة المستودعات": "Warehouse Management",
  "حركات المخزون": "Stock Movements",
  "أوامر الشراء": "Purchase Orders",
  "التقارير الشاملة": "Comprehensive Reports",
  "التقارير": "Reports",
  "استيراد البيانات": "Data Import",
  "مركز استيراد البيانات": "Data Import Center",
  "العروض الترويجية": "Promotions & Offers",
  "المراجعة والتدقيق": "Audit & Logs",
  "الرادار المحاسبي المتقدم": "Accounting Audit Radar",
  "أعمار الديون": "AR Aging",
  "إدارة السيارات": "Fleet Management",
  "رحلات التشغيل": "Fleet Operations",
  "أوامر الشغل (الرحلات)": "Fleet Operations",
  "الرواتب والأجور": "Payroll & Salaries",
  "مسير الرواتب والأجور": "Payroll & Salaries",
  "إعدادات النظام": "System Settings",
  "إعدادات النظام والنسخ الاحتياطي": "System Settings & Backup",
  "المستخدمين والصلاحيات": "Users & Permissions",
  "إدارة الفريق": "Team Management",
  "إدارة الفريق والشركاء": "Team Management",
  "الملف الشخصي": "Profile",
  "التواصل الداخلي": "Internal Communications",
  "مركز الإشعارات والتنبيهات المباشرة": "Notifications Center",
  "الصفحة الرئيسية": "Home Portal",
  "صيدلية تاج المودة البيطرية": "Taj Al-Mawadah Vet Pharmacy",
  "صيدلية تاج المودة": "Taj Al-Mawadah Pharmacy",
  "صيدلية تاج المودة البيطرية": "Taj Al-Mawadah Vet Pharmacy",
  "نظام إدارة الموارد": "ERP Management System"
};

const SUBTITLES_EN: Record<string, string> = {
  "صيدلية تاج المودة البيطرية": "Taj Al-Mawadah Unified Vet System",
  "بوابة الإدارة المركزية لصيدلية تاج المودة": "Taj Al-Mawadah Central Management Portal",
  "إدارة وتتبع بيانات العملاء والموردين والمناديب والوظائف": "Manage partners, clients, suppliers, delegates and job roles",
  "إدارة ومتابعة فواتير المبيعات وضريبة القيمة المضافة": "Track sales invoices and VAT compliance",
  "إدارة دليل الأصناف والباركود والتسعير ومستويات الأمان": "Manage item catalog, barcodes, pricing, and safety stock",
  "سندات القبض ومقبوضات العملاء والمناديب": "Receipt vouchers from clients and delegates",
  "سندات الصرف والمدفوعات والموردين": "Payment vouchers and vendor payouts",
  "تسجيل ومتابعة المصروفات والبنود التشغيلية": "Record and track operational expenses",
  "لوحة المؤشرات والتحليلات البيانية لعمليات الشركة": "Analytics dashboard and operational KPIs",
  "إدارة ومتابعة حركة المستودعات والتحويلات": "Warehouse operations and stock transfers",
  "متابعة أرصدة وذمم العملاء والتحصيلات": "Customer balances and collection tracking",
  "مراقبة العمليات والمؤشرات المالية - ريال سعودي": "Monitor operational and financial KPIs (SAR)",
  "إدارة الموردين، العملاء، المناديب، والموظفين": "Manage suppliers, clients, delegates, and staff",
  "إدارة السندات، المراجعة، والترحيل المحاسبي": "Vouchers management, auditing, and posting",
  "إدارة التكاليف والمشتريات وتوزيع الأصناف": "Cost management, purchases, and distribution",
  "استعراض حركات الأستاذ العام والتحليل المالي": "General ledger movements and financial analysis",
  "مراقبة حركات السيولة، المقبوضات، والمدفوعات بشكل لحظي وتجميعي": "Real-time cashflow, receipts, and disbursement monitoring",
  "تتبع الديون المتأخرة والذمم المدينة للعملاء مقسمة حسب فترات التأخير.": "Track overdue debts and receivables categorized by aging brackets",
  "لوحة التدقيق التفصيلية، الموازنة الآلية، والتطهير الشامل": "Detailed auditing board, automatic balancing, and system cleanup",
  "استيراد الإكسيل الموحد مع المراجعة الذكية": "Unified Excel import with intelligent verification",
  "متابعة حركة المناديب والمبيعات والتكاليف الخاصة بكل رحلة": "Monitor delegate movements, sales, and trip expenses",
  "نظرة شاملة لعمليات البيع والتوزيع والمحاسبة": "Comprehensive overview of sales, distribution, and accounting",
  "الرسائل والمحادثات بين فرق العمل": "Team communication and messaging portal",
  "بوابة الإدارة المركزية لصيدلية تاج المودة": "Central Management Portal - El-Taj Al-Mawadah Pharmacy",
  "تحديد الرتب وتوزيع صلاحيات الوصول للمنصة بأمان": "Roles definition and secure platform access distribution"
};

function getTranslatedTitle(rawTitle: string, lang: 'ar' | 'en'): string {
  if (!rawTitle || lang !== 'en') return rawTitle;
  if (PAGE_TITLES_EN[rawTitle]) return PAGE_TITLES_EN[rawTitle];
  const clean = rawTitle.replace(/[\u{1F300}-\u{1FAFF}]/gu, '').replace(/\(.*?\)/g, '').trim();
  if (PAGE_TITLES_EN[clean]) return PAGE_TITLES_EN[clean];
  for (const [k, v] of Object.entries(PAGE_TITLES_EN)) {
    if (rawTitle.includes(k) || clean.includes(k)) return v;
  }
  return rawTitle;
}

function getTranslatedSubtitle(rawSub: string | undefined, lang: 'ar' | 'en'): string {
  if (!rawSub) return lang === 'en' ? 'Taj Al-Mawadah Vet Pharmacy' : 'صيدلية تاج المودة البيطرية';
  if (lang !== 'en') return rawSub;
  if (SUBTITLES_EN[rawSub]) return SUBTITLES_EN[rawSub];
  for (const [k, v] of Object.entries(SUBTITLES_EN)) {
    if (rawSub.includes(k)) return v;
  }
  return rawSub;
}

export default function MasterPage({ title, subtitle, children, headerContent, icon, className }: any) {
  const { language, toggleLanguage, isRtl } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [pendingTotalCount, setPendingTotalCount] = useState(0);
  const [pendingDetails, setPendingDetails] = useState({
    journals: 0,
    paymentVouchers: 0,
    receiptVouchers: 0,
    invoices: 0,
    expenses: 0,
    inventory: 0,
    manual: 0,
    fleet: 0,
    shifts: 0,
    total: 0
  });
  const [isPendingMenuOpen, setIsPendingMenuOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState({ top: 0, left: 0 });
  const bellRef = useRef<HTMLButtonElement>(null);
  const { unread_messages, unread_notifications } = useUnreadCounts();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [lowGraphics, setLowGraphics] = useState(false);

  useEffect(() => { 
    setMounted(true); 
    if (typeof window !== 'undefined') {
      const isLow = localStorage.getItem('lowGraphicsMode') === 'true';
      setLowGraphics(isLow);
    }
  }, []);

  // المزامنة اللحظية لوضع الأداء السريع مع جميع أجزاء النظام
  useEffect(() => {
    const handleModeChange = (e: any) => {
      setLowGraphics(Boolean(e.detail));
    };
    window.addEventListener('lowGraphicsModeChanged', handleModeChange);
    return () => window.removeEventListener('lowGraphicsModeChanged', handleModeChange);
  }, []);

  const toggleLowGraphics = async () => {
    const nextVal = !lowGraphics;
    setLowGraphics(nextVal);
    localStorage.setItem('lowGraphicsMode', String(nextVal));

    if (nextVal) {
      document.documentElement.classList.add('low-graphics-mode');
      document.body.classList.add('low-graphics-mode');
      toast.success('⚡️ تم تفعيل وضع الأداء السريع (تخفيف الجرافيك للجوالات)');
    } else {
      document.documentElement.classList.remove('low-graphics-mode');
      document.body.classList.remove('low-graphics-mode');
      toast.success('✨ تم استعادة المظهر الزجاجي الفاخر');
    }

    window.dispatchEvent(new CustomEvent('lowGraphicsModeChanged', { detail: nextVal }));

    try {
      await supabase.auth.updateUser({
        data: { low_graphics_mode: nextVal }
      });
    } catch (e) {
      console.error('Failed to sync performance mode:', e);
    }
  };

  useEffect(() => {
    if (pathname && pathname !== '/' && !pathname.includes('login')) {
      localStorage.setItem('last_visited_route', pathname);
    }
  }, [pathname]);

  const fetchPendingCount = async () => {
    try {
      const [
        jhRes,
        pvRes,
        rvRes,
        invRes,
        expRes,
        txRes,
        mjRes,
        fleetRes,
        shiftRes
      ] = await Promise.all([
        supabase.from('journal_headers').select('id', { count: 'exact', head: true }).not('status', 'eq', 'posted'),
        supabase.from('payment_vouchers').select('id', { count: 'exact', head: true }).or('is_posted.is.null,is_posted.eq.false'),
        supabase.from('receipt_vouchers').select('id', { count: 'exact', head: true }).not('status', 'in', '("معتمد","مرحل")'),
        supabase.from('invoices').select('id', { count: 'exact', head: true }).not('status', 'in', '("posted","معتمد","مرحل")'),
        supabase.from('expenses').select('id', { count: 'exact', head: true }).or('is_posted.is.null,is_posted.eq.false'),
        supabase.from('inventory_transactions').select('id', { count: 'exact', head: true }).not('status', 'eq', 'approved'),
        supabase.from('manual_journals').select('id', { count: 'exact', head: true }).or('is_posted.is.null,is_posted.eq.false'),
        supabase.from('fleet_operations').select('id', { count: 'exact', head: true }).in('status', ['معلق', 'pending']),
        supabase.from('pos_shifts').select('id', { count: 'exact', head: true }).eq('status', 'closed')
      ]);

      const counts = {
        journals: jhRes.count || 0,
        paymentVouchers: pvRes.count || 0,
        receiptVouchers: rvRes.count || 0,
        invoices: invRes.count || 0,
        expenses: expRes.count || 0,
        inventory: txRes.count || 0,
        manual: mjRes.count || 0,
        fleet: fleetRes.count || 0,
        shifts: shiftRes.count || 0
      };

      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      setPendingDetails({ ...counts, total });
      setPendingTotalCount(total);
    } catch (e) {
      console.warn("fetchPendingCount error:", e);
    }
  };

  useEffect(() => {
    fetchPendingCount();
    // ⏱️ فحص احتياطي كل 5 ثوانٍ لضمان تحديث العدادات والمعلقات بدون ريفرش إطلاقاً
    const interval = setInterval(fetchPendingCount, 5000);

    const handleRefresh = () => fetchPendingCount();
    window.addEventListener('pending_counts_refresh', handleRefresh);
    window.addEventListener('unread_counts_refresh', handleRefresh);
    window.addEventListener('focus', handleRefresh);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') fetchPendingCount();
    });

    return () => {
      clearInterval(interval);
      window.removeEventListener('pending_counts_refresh', handleRefresh);
      window.removeEventListener('unread_counts_refresh', handleRefresh);
      window.removeEventListener('focus', handleRefresh);
    };
  }, []);

  // 🔄 مزامنة لحظية شاملة مع كافة جداول المستندات والعمليات والإشعارات
  useRealtimeListener([
    'journal_headers',
    'payment_vouchers',
    'receipt_vouchers',
    'invoices',
    'expenses',
    'inventory_transactions',
    'manual_journals',
    'fleet_operations',
    'pos_shifts',
    'notifications'
  ], fetchPendingCount);

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
          const emailName = session.user.email ? session.user.email.split('@')[0] : 'المدير';
          setUserProfile({
            ...(data || {}),
            email: session.user.email,
            displayName: data?.full_name?.trim() || emailName
          });
        }
      } catch (err) {
        console.warn("Could not fetch profile in MasterPage:", err);
      }
    };
    getUser();
  }, []);


  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMenuOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.max(10, Math.min((typeof window !== 'undefined' ? window.innerWidth : 1000) - 210, rect.left));
      setCoords({
        top: rect.bottom + 8,
        left
      });
      setIsMenuOpen(true);
      setIsPendingMenuOpen(false);
    } else {
      setIsMenuOpen(false);
    }
  };

  const togglePendingMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    fetchPendingCount(); // تحديث فوري فائق السرعة عند النقر
    if (!isPendingMenuOpen && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1000;
      const width = Math.min(320, winWidth - 20);
      let left = rect.right - width;
      if (left < 10) left = 10;
      if (left + width > winWidth - 10) {
        left = Math.max(10, winWidth - width - 10);
      }
      setPendingCoords({
        top: rect.bottom + 8,
        left
      });
      setIsPendingMenuOpen(true);
      setIsMenuOpen(false);
    } else {
      setIsPendingMenuOpen(false);
    }
  };

  useEffect(() => {
    const handleOutsideClick = () => {
      setIsMenuOpen(false);
      setIsPendingMenuOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className={`clean-page ${className || ''}`.trim()}>
      <style>{`
/* 🚀 🛠️ Prevent horizontal scroll */
html, body { 
    overflow-x: hidden !important; 
    width: 100vw !important;
    max-width: 100% !important;
    margin: 0 !important; 
    padding: 0 !important; 
}

.clean-page { 
    padding: 25px 15px 25px 15px !important; 
    margin: 0 !important;
    direction: inherit; 
    min-height: 100vh; 
    width: 100% !important;
    max-width: 100%;
    overflow-x: hidden !important;
    box-sizing: border-box !important;
}

.master-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 20px; 
    position: relative; z-index: 1000;
}

.imperial-trigger { 
    display: flex; align-items: center; gap: 12px; 
    padding: 10px 15px; border-radius: 22px; 
    background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.55) 100%);
    cursor: pointer; transition: 0.3s; 
    border: 1px solid rgba(194, 155, 98, 0.35); 
    box-shadow: 0 4px 6px rgba(44, 26, 18, 0.08);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
}
.imperial-trigger:hover { 
    background: rgba(255, 253, 250, 0.95); 
    transform: translateY(-2px); 
    border-color: rgba(194, 155, 98, 0.6); 
    box-shadow: 0 10px 15px rgba(168, 87, 60, 0.15); 
}

.u-info-text { display: flex; flex-direction: column; text-align: right; margin-right: 5px; }
.u-name { font-size: 16px; font-weight: 800; color: #2C1A12; letter-spacing: -0.3px; line-height: 1.2; }
.u-role { font-size: 12px; font-weight: 700; color: #C29B62; margin-top: 2px; }

.avatar-frame { position: relative; width: 55px; height: 55px; }
.avatar-frame img { width: 100%; height: 100%; border-radius: 50%; border: 2px solid rgba(194, 155, 98, 0.4); object-fit: cover; box-shadow: 0 4px 10px rgba(44,26,18,0.1); }
.active-dot { position: absolute; bottom: 3px; right: 3px; width: 12px; height: 12px; background: #4E734F; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 8px rgba(78, 115, 79, 0.4); }

.supreme-dropdown {
    position: fixed; width: 200px; 
    background: linear-gradient(135deg, rgba(255, 253, 250, 0.96) 0%, rgba(255, 253, 250, 0.85) 100%); 
    border-radius: 20px;
    padding: 8px; box-shadow: 0 20px 45px rgba(44, 26, 18, 0.14);
    border: 1px solid rgba(194, 155, 98, 0.35); z-index: 999999;
    transform-origin: top left;
    animation: supremeShow 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
}
@keyframes supremeShow { from { opacity: 0; transform: translateY(-10px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }

.drop-item { display: flex; align-items: center; gap: 10px; padding: 10px 15px; border-radius: 12px; font-size: 13px; font-weight: 800; color: #2C1A12; cursor: pointer; transition: 0.2s; direction: rtl; }
.drop-item:hover { background: rgba(194, 155, 98, 0.15); color: #A8573C; }
.drop-item.logout { color: #A8573C; border-top: 1px solid rgba(194, 155, 98, 0.2); margin-top: 5px; border-radius: 0 0 12px 12px; }
.drop-item.logout:hover { background: rgba(168, 87, 60, 0.1); }

.nav-btn-glass {
    width: 40px; height: 40px; border-radius: 12px;
    background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.5) 100%); 
    backdrop-filter: blur(24px) saturate(160%);
    -webkit-backdrop-filter: blur(24px) saturate(160%);
    border: 1px solid rgba(194, 155, 98, 0.3);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: 0.3s;
    box-shadow: 0 4px 6px rgba(44, 26, 18, 0.08);
    color: #2C1A12; font-size: 18px;
}
.nav-btn-glass:hover {
    background: rgba(255, 253, 250, 1); transform: translateY(-2px);
    border-color: #C29B62; color: #A8573C;
    box-shadow: 0 10px 15px rgba(168, 87, 60, 0.15);
}
.nav-group { display: flex; gap: 6px; margin-right: 12px; border-right: 1px solid rgba(194, 155, 98, 0.2); padding-right: 12px; }

/* 🌐 زر تبديل اللغة الحصين (Unbreakable Language Switcher) */
.lang-switcher-pill,
.perf-switcher-pill {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 5px !important;
    min-width: fit-content !important;
    width: auto !important;
    height: 38px !important;
    padding: 0 12px !important;
    border-radius: 12px !important;
    font-size: 12px !important;
    font-weight: 900 !important;
    white-space: nowrap !important;
    word-break: keep-all !important;
    background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.55) 100%) !important;
    backdrop-filter: blur(24px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
    border: 1.5px solid rgba(194, 155, 98, 0.3) !important;
    color: #2C1A12 !important;
    cursor: pointer !important;
    transition: all 0.25s cubic-bezier(0.165, 0.84, 0.44, 1) !important;
    box-shadow: 0 4px 6px rgba(44, 26, 18, 0.06) !important;
    flex-shrink: 0 !important;
}
.lang-switcher-pill:hover,
.perf-switcher-pill:hover {
    background: white !important;
    border-color: #C29B62 !important;
    color: #A8573C !important;
    transform: translateY(-1.5px) !important;
    box-shadow: 0 8px 15px rgba(168, 87, 60, 0.15) !important;
}
.perf-switcher-pill.active {
    background: linear-gradient(135deg, rgba(194, 155, 98, 0.25) 0%, rgba(168, 87, 60, 0.15) 100%) !important;
    border-color: #C29B62 !important;
    color: #A8573C !important;
}

.header-action-btn {
    width: 38px !important; height: 38px !important;
    border-radius: 12px !important;
    background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.55) 100%) !important;
    backdrop-filter: blur(24px) saturate(160%) !important;
    -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
    border: 1px solid rgba(194, 155, 98, 0.3) !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    cursor: pointer !important; transition: 0.25s !important;
    box-shadow: 0 4px 6px rgba(44, 26, 18, 0.06) !important;
    color: #2C1A12 !important; font-size: 18px !important;
    position: relative !important; flex-shrink: 0 !important;
    text-decoration: none !important;
}
.header-action-btn:hover {
    background: white !important;
    color: #A8573C !important;
    border-color: #C29B62 !important;
    transform: translateY(-1.5px) !important;
    box-shadow: 0 8px 15px rgba(168, 87, 60, 0.15) !important;
}

.badge-counter {
    position: absolute !important;
    top: -5px !important; right: -5px !important;
    background: #A8573C !important; color: white !important;
    font-size: 11px !important; font-weight: 900 !important;
    min-width: 19px !important; height: 19px !important;
    border-radius: 50% !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    box-shadow: 0 2px 6px rgba(168, 87, 60, 0.4) !important;
    border: 2px solid white !important;
}
.badge-counter.msg-badge { background: #C29B62 !important; }

.pending-alert-btn {
    background: rgba(254, 243, 199, 0.95) !important;
    backdrop-filter: blur(10px) !important;
    border: 1.5px solid rgba(245, 158, 11, 0.6) !important;
    color: #b45309 !important;
    font-size: 12px !important;
    font-weight: 900 !important;
    padding: 0 12px !important;
    height: 38px !important;
    border-radius: 12px !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2) !important;
    transition: 0.2s !important;
    white-space: nowrap !important;
    cursor: pointer !important;
    flex-shrink: 0 !important;
}
.pending-alert-btn:hover { transform: translateY(-1.5px) !important; }

.glass-container {
    background: transparent;
    border-radius: 24px;
    padding: 20px 15px;
    border: none !important;
    box-shadow: none !important;
}

/* 🏷️ الترويسة الرئيسية وعنوان الصفحة المتجاوب */
.master-header {
  padding: 10px 16px !important;
  margin-bottom: 14px !important;
  border-radius: 18px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 12px !important;
  background: linear-gradient(135deg, rgba(255, 253, 250, 0.88) 0%, rgba(255, 253, 250, 0.6) 100%) !important;
  backdrop-filter: blur(24px) saturate(160%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(160%) !important;
  border: 1px solid rgba(194, 155, 98, 0.3) !important;
  box-shadow: 0 4px 14px rgba(44, 26, 18, 0.05) !important;
  box-sizing: border-box !important;
  width: 100% !important;
  flex-wrap: nowrap !important;
}

.title-area {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  min-width: 0 !important;
  flex: 0 1 auto !important;
  max-width: 50% !important;
  overflow: hidden !important;
}

.title-text-box {
  display: flex !important;
  flex-direction: column !important;
  gap: 1px !important;
  min-width: 0 !important;
  overflow: hidden !important;
}

.master-page-heading {
  margin: 0 !important;
  font-size: 15.5px !important;
  font-weight: 800 !important;
  color: #2C1A12 !important;
  letter-spacing: -0.2px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  line-height: 1.25 !important;
  max-width: 100% !important;
}

.master-page-subheading {
  margin: 0 !important;
  font-size: 11px !important;
  color: rgba(44, 26, 18, 0.6) !important;
  font-weight: 600 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  line-height: 1.2 !important;
  max-width: 100% !important;
}

.header-icon {
  width: 36px !important;
  height: 36px !important;
  min-width: 36px !important;
  border-radius: 10px !important;
  background: linear-gradient(135deg, rgba(255, 253, 250, 0.95), rgba(194, 155, 98, 0.2)) !important;
  border: 1px solid rgba(194, 155, 98, 0.3) !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-shadow: 0 2px 8px rgba(44, 26, 18, 0.06) !important;
  flex-shrink: 0 !important;
}
.header-icon span {
  font-size: 18px !important;
}

@media (max-width: 1024px) {
  .master-header {
    padding: 8px 12px !important;
    gap: 8px !important;
  }
  .title-area {
    max-width: 45% !important;
  }
  .master-page-heading {
    font-size: 14px !important;
  }
  .master-page-subheading {
    font-size: 10.5px !important;
  }
  .header-icon {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px !important;
    border-radius: 9px !important;
  }
  .header-icon span {
    font-size: 16px !important;
  }
}

/* 📱 MOBILE STYLES ≤768px */
@media (max-width: 768px) {
  html, body { overflow-x: hidden !important; }
  
  .nav-group { display: none !important; }
  
  .clean-page { 
    padding: 0 !important; 
    margin: 0 !important; 
    width: 100% !important; 
    box-sizing: border-box !important;
  }
  
  .master-header { 
    padding: 8px 10px !important; 
    margin-bottom: 8px !important; 
    border-radius: 0 0 16px 16px !important;
    flex-wrap: nowrap !important;
    gap: 6px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  
  .title-area { 
    gap: 6px !important; 
    flex: 1 1 auto !important; 
    min-width: 0 !important;
    max-width: calc(100vw - 165px) !important;
  }
  
  .master-page-heading { 
    font-size: 13px !important; 
    white-space: nowrap !important; 
    overflow: hidden !important; 
    text-overflow: ellipsis !important; 
    max-width: 100% !important;
  }
  .master-page-subheading { display: none !important; }
  
  .header-icon { 
    width: 28px !important; 
    height: 28px !important; 
    min-width: 28px !important; 
    border-radius: 8px !important; 
  }
  .header-icon span { font-size: 14px !important; }
  
  .header-side { 
    gap: 4px !important; 
    flex-shrink: 0 !important; 
  }
  .header-actions { 
    border: none !important; 
    padding: 0 !important; 
    flex-direction: row !important; 
    gap: 4px !important; 
    align-items: center !important;
  }
  
  .lang-switcher-pill,
  .perf-switcher-pill {
    height: 34px !important;
    padding: 0 8px !important;
    font-size: 11px !important;
    border-radius: 9px !important;
    white-space: nowrap !important;
    word-break: keep-all !important;
    min-width: fit-content !important;
    width: auto !important;
  }
  
  .perf-switcher-pill .perf-text {
    display: none !important;
  }
  
  .header-action-btn {
    width: 34px !important;
    height: 34px !important;
    font-size: 16px !important;
    border-radius: 9px !important;
  }
  
  .header-action-btn.msg-btn {
    display: none !important;
  }
  
  .pending-alert-btn {
    height: 34px !important;
    padding: 0 6px !important;
    font-size: 10px !important;
    border-radius: 9px !important;
  }
  .pending-text-full { display: none !important; }
  
  .header-divider { display: none !important; }
  
  .glass-container { 
    padding: 10px 8px !important; 
    border-radius: 0 !important; 
    min-height: calc(100vh - 60px); 
  }
  
  .u-info-text { display: none !important; }
  
  .imperial-trigger { 
    padding: 2px !important; 
    background: transparent !important; 
    border: none !important; 
    box-shadow: none !important; 
    backdrop-filter: none !important;
  }
  .imperial-trigger:hover { 
    transform: none !important; 
    box-shadow: none !important; 
    border: none !important; 
  }
  
  .avatar-frame { 
    width: 34px !important; 
    height: 34px !important; 
  }
}`}</style>

      <header className="master-header no-print">
        {/* Right side: Icon and Title */}
        <div className="title-area">
          <div className="header-icon">
            <span>{icon || '✨'}</span>
          </div>
          <div className="title-text-box">
              <h1 
                className="master-page-heading"
                title={getTranslatedTitle(title, language)}
              >
                {getTranslatedTitle(title, language)}
              </h1>
              {subtitle && (
                <p 
                  className="master-page-subheading"
                  title={getTranslatedSubtitle(subtitle, language)}
                >
                  {getTranslatedSubtitle(subtitle, language)}
                </p>
              )}
          </div>
        </div>

        {/* Left side: Header Content, Actions, Avatar */}
        <div className="header-side" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <OfflineSyncIndicator />
          {headerContent}
          
          <div className="header-actions" style={{ display: 'flex', flexDirection: 'row', gap: '6px', alignItems: 'center', borderRight: isRtl ? '2px solid rgba(194, 155, 98, 0.2)' : 'none', borderLeft: !isRtl ? '2px solid rgba(194, 155, 98, 0.2)' : 'none', paddingRight: isRtl ? '10px' : '0', paddingLeft: !isRtl ? '10px' : '0' }}>
             
             {/* Desktop Nav Arrows & Shortcuts Button */}
             <div className="nav-group" style={{ display: 'flex', gap: '4px', margin: 0, border: 'none', background: 'rgba(255, 253, 250, 0.6)', borderRadius: '12px', padding: '3px' }}>
                <button 
                  onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }))} 
                  className="nav-btn-glass" 
                  title={language === 'en' ? 'Keyboard Shortcuts (F1)' : 'خريطة اختصارات الكيبورد (F1)'} 
                  style={{ width: '34px', height: '34px', borderRadius: '9px', fontSize: '15px', background: 'rgba(255, 253, 250, 0.85)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#C29B62' }}
                >
                  ⌨️
                </button>
                <button onClick={() => router.forward()} className="nav-btn-glass" title={language === 'en' ? 'Forward' : 'تقدم للأمام'} style={{ width: '34px', height: '34px', borderRadius: '9px', fontSize: '16px', background: 'rgba(255, 253, 250, 0.85)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#C29B62' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                </button>
                <button onClick={() => router.back()} className="nav-btn-glass" title={language === 'en' ? 'Back' : 'رجوع للخلف'} style={{ width: '34px', height: '34px', borderRadius: '9px', fontSize: '16px', background: 'rgba(255, 253, 250, 0.85)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#C29B62' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
             </div>

             {/* 🌐 زر تبديل اللغة الأنيق */}
             <button
                type="button"
                onClick={toggleLanguage}
                className="lang-switcher-pill"
                title={language === 'ar' ? 'Switch to English' : 'التحويل إلى العربية'}
             >
                <span style={{ fontSize: '14px', lineHeight: 1 }}>🌐</span>
                <span>{language === 'ar' ? 'English' : 'عربي'}</span>
             </button>

             {/* ⚡️ زر وضع الأداء السريع المباشر (Direct Performance Switcher) */}
             <button
                type="button"
                onClick={toggleLowGraphics}
                className={`perf-switcher-pill ${lowGraphics ? 'active' : ''}`}
                title={lowGraphics ? (language === 'en' ? 'Switch to Glassmorphism Mode' : 'التبديل إلى المظهر الزجاجي الفاخر') : (language === 'en' ? 'Fast Performance Mode (for older phones)' : 'وضع الأداء السريع (تخفيف الجرافيك للجوالات القديمة)')}
             >
                <span style={{ fontSize: '13px', lineHeight: 1 }}>{lowGraphics ? '⚡️' : '✨'}</span>
                <span className="perf-text">{lowGraphics ? (language === 'en' ? 'Fast' : 'أداء سريع') : (language === 'en' ? 'Glass' : 'زجاجي')}</span>
             </button>

              {/* Notifications & Pending Alert */}
              {pendingTotalCount > 0 && (
                  <button 
                      type="button"
                      onClick={togglePendingMenu}
                      title={`يوجد ${pendingTotalCount} معلق`}
                      className="pending-alert-btn"
                  >
                      <span>⚠️</span>
                      <span>{pendingTotalCount}</span>
                      <span className="pending-text-full">{language === 'en' ? 'Pending' : 'معلق'}</span>
                  </button>
              )}

              <button 
                ref={bellRef}
                className="header-action-btn" 
                onClick={togglePendingMenu} 
                title={language === 'en' ? 'Alerts' : 'التنبيهات والمعلقات'}
              >
                  🔔
                  {(unread_notifications > 0 || pendingTotalCount > 0) && (
                    <span className="badge-counter">
                      {(unread_notifications || 0) + (pendingTotalCount || 0)}
                    </span>
                  )}
              </button>

              <Link className="header-action-btn msg-btn" href="/messages" title={language === 'en' ? 'Messages' : 'الرسائل'}>
                  ✉️
                  {unread_messages > 0 && <span className="badge-counter msg-badge">{unread_messages}</span>}
              </Link>
          </div>
          
          {/* Avatar Card Restored */}
          <div className="imperial-trigger" ref={triggerRef} onClick={toggleMenu} style={{ flexShrink: 0 }}>
            <div className="u-info-text">
              <span className="u-name">{userProfile?.displayName || (language === 'en' ? 'Admin' : 'المدير')}</span>
              <span className="u-role">
                {userProfile?.role === 'super_admin' 
                  ? (language === 'en' ? 'General Manager 👑' : 'مدير عام 👑') 
                  : (language === 'en' ? 'System Admin 🛡️' : 'مسؤول نظام 🛡️')}
              </span>
            </div>
            <div className="avatar-frame">
              <img src={userProfile?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(userProfile?.displayName || 'U')}&background=A1D6E2&color=122946&bold=true`} alt="Avatar" />
              <div className="active-dot"></div>
            </div>
          </div>
        </div>
      </header>

      {mounted && isMenuOpen && typeof document !== 'undefined' && createPortal(
        <div className="supreme-dropdown" style={{ top: coords.top, left: coords.left }} onClick={(e) => e.stopPropagation()}>

            <div className="drop-item" onClick={() => router.push('/profile')}><span>👤</span> {language === 'en' ? 'My Profile' : 'بروفيلي'}</div>
            <div className="drop-item" onClick={() => { setIsMenuOpen(false); toggleLowGraphics(); }}>
              <span>{lowGraphics ? '✨' : '⚡️'}</span> 
              {lowGraphics 
                ? (language === 'en' ? 'Switch to Glass Mode' : 'التحويل للمظهر الزجاجي الفاخر') 
                : (language === 'en' ? 'Fast Performance Mode' : 'وضع الأداء السريع (تخفيف الجرافيك)')}
            </div>
            <div className="drop-item" onClick={() => router.push('/settings')}><span>⚙️</span> {language === 'en' ? 'System Settings' : 'الإعدادات'}</div>
            <div className="drop-item logout" onClick={handleLogout}><span>🚪</span> {language === 'en' ? 'Logout' : 'خروج'}</div>
        </div>,
        document.body
      )}

      {mounted && isPendingMenuOpen && typeof document !== 'undefined' && createPortal(
        <div 
          className="supreme-dropdown" 
          style={{ 
            top: pendingCoords.top, 
            left: pendingCoords.left, 
            width: '320px',
            maxWidth: 'calc(100vw - 20px)',
            maxHeight: '85vh',
            overflowY: 'auto',
            padding: '12px',
            background: 'rgba(255, 255, 255, 0.97)',
            backdropFilter: 'blur(30px) saturate(200%)',
            boxShadow: '0 20px 50px rgba(28, 115, 171, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.95)',
            borderRadius: '20px',
            zIndex: 999999
          }} 
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 10px', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '14px', fontWeight: 900, color: '#C29B62' }}>🔔 مركز التدقيق والمعلقات</span>
              <button 
                onClick={(e) => { e.stopPropagation(); fetchPendingCount(); }}
                title="تحديث لحظي"
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '2px 4px', color: '#C29B62' }}
              >
                🔄
              </button>
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, background: pendingDetails.total > 0 ? '#fee2e2' : '#dcfce7', color: pendingDetails.total > 0 ? '#dc2626' : '#16a34a', padding: '3px 9px', borderRadius: '12px' }}>
              {pendingDetails.total > 0 ? `${pendingDetails.total} معلق` : 'لا معلقات ✅'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {/* 1. قيود اليومية */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/journal'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>📝</span> قيود اليومية غير المرحلة</span>
              {pendingDetails.journals > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.journals}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 2. سندات الصرف */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/PaymentVouchers'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>📤</span> سندات صرف غير مرحلة</span>
              {pendingDetails.paymentVouchers > 0 ? (
                <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.paymentVouchers}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 3. سندات القبض */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/ReceiptVouchers'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>📥</span> سندات قبض غير معتمدة</span>
              {pendingDetails.receiptVouchers > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.receiptVouchers}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 4. فواتير المبيعات */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/invoices'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🧾</span> فواتير مبيعات غير مرحلة</span>
              {pendingDetails.invoices > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.invoices}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 5. المصروفات */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/expenses'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>💸</span> مصروفات غير مرحلة</span>
              {pendingDetails.expenses > 0 ? (
                <span style={{ background: '#ffedd5', color: '#ea580c', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.expenses}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 6. حركات المستودع */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/inventory/transactions'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>📦</span> حركات مستودع غير معتمدة</span>
              {pendingDetails.inventory > 0 ? (
                <span style={{ background: '#ffedd5', color: '#ea580c', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.inventory}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 7. قيود التسوية اليدوية */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/ManualJournals'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>⚖️</span> تسويات محاسبية غير مرحلة</span>
              {pendingDetails.manual > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.manual}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 8. حركة وتوزيع الأسطول */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/fleet_operations'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🚚</span> رحلات أسطول وتوزيع معلقة</span>
              {pendingDetails.fleet > 0 ? (
                <span style={{ background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.fleet}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* 9. ورديات نقاط البيع */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); router.push('/pos-settlements'); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🏪</span> ورديات كاشير بانتظار التوريد</span>
              {pendingDetails.shifts > 0 ? (
                <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{pendingDetails.shifts}</span>
              ) : <span style={{ color: '#10b981', fontSize: '11px' }}>0</span>}
            </div>

            {/* الفاصل وإشعارات النظام */}
            <div 
              className="drop-item" 
              onClick={() => { setIsPendingMenuOpen(false); setIsNotificationsOpen(true); }}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px dashed rgba(28, 115, 171, 0.2)', marginTop: '6px', paddingTop: '8px' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span>🔔</span> إشعارات وتنبيهات النظام</span>
              {unread_notifications > 0 ? (
                <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800 }}>{unread_notifications}</span>
              ) : <span style={{ color: '#64748b', fontSize: '11px' }}>عرض الكل</span>}
            </div>
          </div>
        </div>,
        document.body
      )}

      <main className="glass-container">
        <NotificationsModal isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
        {children}
      </main>
    </div>
  );
}
