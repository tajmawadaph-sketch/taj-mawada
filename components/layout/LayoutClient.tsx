"use client";
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { menuGroups } from '@/lib/menuData';
import { supabase } from '@/lib/supabase';
import RawasiFilterSidebar from '@/components/rawasifiltersidebar';
import { useSidebar } from '@/lib/SidebarContext'; 
import { usePermissions } from '@/lib/PermissionsContext'; 
import { useUnreadCounts } from '@/hooks/useUnreadCounts';
import { usePresence } from '@/hooks/usePresence';
import LoadingScreen from '@/components/LoadingScreen';
import { useLanguage } from '@/lib/LanguageContext';
import { 
  Menu, 
  X, 
  LogOut, 
  Home, 
  ShoppingBag, 
  FileText, 
  Package, 
  ArrowUpRight,
  Zap,
  Search,
  Layers,
  Compass,
  DollarSign,
  Users,
  BarChart3,
  Truck
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function LayoutClient({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [customPosition, setCustomPosition] = useState<{ x: number, y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false); 
  const currentPosRef = useRef<{ x: number, y: number } | null>(null);
  const lastTouchTime = useRef(0);
  const dragStartPos = useRef({ x: 0, y: 0, startX: 0, startY: 0, hasMoved: false });

  // بحث وتصنيف الشاشات داخل مركز القيادة
  const [hubSearch, setHubSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');

  // لمنع مشاكل Hydration
  const [mounted, setMounted] = useState(false);

  // السايد بار للفلترة
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const { actions, summary, customFilters } = useSidebar(); 
  const { role, can, loading } = usePermissions();
  const unreadCounts = useUnreadCounts();
  const { onlineUsers, onlineCount } = usePresence();
  const { t, language, dir, isRtl } = useLanguage();

  const [lowGraphics, setLowGraphics] = useState(false);

  // تحديث ref الموقع عند تغييره لتفادي مشاكل الـ closure
  useEffect(() => {
    currentPosRef.current = customPosition;
  }, [customPosition]);

  // تحميل الموقع المخصص مع التحقق من ملاءمته لأبعاد الشاشة الحالية
  useEffect(() => {
    const savedPos = localStorage.getItem('fabPosition_v2');
    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') {
          const fabSize = typeof window !== 'undefined' && window.innerWidth <= 768 ? 65 : 75;
          const maxX = (typeof window !== 'undefined' ? window.innerWidth : 1000) - fabSize - 10;
          const maxY = (typeof window !== 'undefined' ? window.innerHeight : 1000) - fabSize - 10;
          const clamped = {
            x: Math.max(10, Math.min(parsed.x, maxX)),
            y: Math.max(10, Math.min(parsed.y, maxY))
          };
          setCustomPosition(clamped);
          currentPosRef.current = clamped;
        }
      } catch(e) {}
    }
    setMounted(true);
    setTimeout(() => setIsInitialized(true), 100); 
  }, []);

  // ضبط الموقع عند تغيير حجم الشاشة أو تدوير الجوال
  useEffect(() => {
    const handleResize = () => {
      setCustomPosition(prev => {
        if (!prev) return null;
        const fabSize = window.innerWidth <= 768 ? 65 : 75;
        const maxX = window.innerWidth - fabSize - 10;
        const maxY = window.innerHeight - fabSize - 10;
        const clamped = {
          x: Math.max(10, Math.min(prev.x, maxX)),
          y: Math.max(10, Math.min(prev.y, maxY))
        };
        currentPosRef.current = clamped;
        return clamped;
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // إغلاق القائمة بالضغط على Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem('lowGraphicsMode');
    const isLow = saved === 'true';
    setLowGraphics(isLow);
    if (isLow) {
      document.documentElement.classList.add('low-graphics-mode');
      document.body.classList.add('low-graphics-mode');
    } else {
      document.documentElement.classList.remove('low-graphics-mode');
      document.body.classList.remove('low-graphics-mode');
    }

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.user_metadata?.low_graphics_mode !== undefined) {
        const profilePref = Boolean(user.user_metadata.low_graphics_mode);
        if (saved === null) {
          localStorage.setItem('lowGraphicsMode', String(profilePref));
          setLowGraphics(profilePref);
          if (profilePref) {
            document.documentElement.classList.add('low-graphics-mode');
            document.body.classList.add('low-graphics-mode');
          } else {
            document.documentElement.classList.remove('low-graphics-mode');
            document.body.classList.remove('low-graphics-mode');
          }
        }
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const handleModeChange = (e: any) => {
      setLowGraphics(Boolean(e.detail));
    };
    window.addEventListener('lowGraphicsModeChanged', handleModeChange);
    return () => window.removeEventListener('lowGraphicsModeChanged', handleModeChange);
  }, []);

  const toggleLowGraphics = async () => {
    const newVal = !lowGraphics;
    setLowGraphics(newVal);
    localStorage.setItem('lowGraphicsMode', String(newVal));
    
    if (newVal) {
      document.documentElement.classList.add('low-graphics-mode');
      document.body.classList.add('low-graphics-mode');
      toast.success('⚡️ تم تفعيل وضع الأداء السريع (تخفيف الجرافيك للجوالات)');
    } else {
      document.documentElement.classList.remove('low-graphics-mode');
      document.body.classList.remove('low-graphics-mode');
      toast.success('✨ تم استعادة المظهر الزجاجي الفاخر');
    }

    window.dispatchEvent(new CustomEvent('lowGraphicsModeChanged', { detail: newVal }));

    try {
      await supabase.auth.updateUser({
        data: { low_graphics_mode: newVal }
      });
    } catch (err) {
      console.error('Failed to sync performance mode with profile:', err);
    }
  };

  // 📱 معالج سحب القائمة العائمة باللمس على الجوال (Touch Drag)
  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartPos.current = {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
      startX: touch.clientX,
      startY: touch.clientY,
      hasMoved: false
    };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - dragStartPos.current.startX);
    const dy = Math.abs(touch.clientY - dragStartPos.current.startY);

    if (dx > 6 || dy > 6) {
      if (!dragStartPos.current.hasMoved) {
        dragStartPos.current.hasMoved = true;
        setIsDragging(true);
      }
    }

    if (dragStartPos.current.hasMoved) {
      const fabSize = window.innerWidth <= 768 ? 62 : 75;
      const maxX = window.innerWidth - fabSize - 8;
      const maxY = window.innerHeight - fabSize - 8;

      const newX = touch.clientX - dragStartPos.current.x;
      const newY = touch.clientY - dragStartPos.current.y;

      const pos = {
        x: Math.max(8, Math.min(newX, maxX)),
        y: Math.max(8, Math.min(newY, maxY))
      };
      currentPosRef.current = pos;
      setCustomPosition(pos);
    }
  };

  const onTouchEnd = () => {
    lastTouchTime.current = Date.now();
    if (dragStartPos.current.hasMoved) {
      if (currentPosRef.current) {
        localStorage.setItem('fabPosition_v2', JSON.stringify(currentPosRef.current));
      }
      setTimeout(() => setIsDragging(false), 50);
    } else {
      setIsDragging(false);
      setIsOpen(prev => !prev);
    }
  };

  // 🖱️ معالج سحب القائمة العائمة بالماوس على الكمبيوتر (Mouse Drag)
  const onMouseDown = (e: React.MouseEvent) => {
    if (Date.now() - lastTouchTime.current < 500) return;
    const rect = e.currentTarget.getBoundingClientRect();
    dragStartPos.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      startX: e.clientX,
      startY: e.clientY,
      hasMoved: false
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const dx = Math.abs(moveEvent.clientX - dragStartPos.current.startX);
      const dy = Math.abs(moveEvent.clientY - dragStartPos.current.startY);

      if (dx > 5 || dy > 5) {
        if (!dragStartPos.current.hasMoved) {
          dragStartPos.current.hasMoved = true;
          setIsDragging(true);
        }
      }

      if (dragStartPos.current.hasMoved) {
        const fabSize = window.innerWidth <= 768 ? 62 : 75;
        const maxX = window.innerWidth - fabSize - 8;
        const maxY = window.innerHeight - fabSize - 8;

        const newX = moveEvent.clientX - dragStartPos.current.x;
        const newY = moveEvent.clientY - dragStartPos.current.y;

        const pos = {
          x: Math.max(8, Math.min(newX, maxX)),
          y: Math.max(8, Math.min(newY, maxY))
        };
        currentPosRef.current = pos;
        setCustomPosition(pos);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (dragStartPos.current.hasMoved) {
        if (currentPosRef.current) {
          localStorage.setItem('fabPosition_v2', JSON.stringify(currentPosRef.current));
        }
        setTimeout(() => setIsDragging(false), 50);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleClick = () => {
    if (Date.now() - lastTouchTime.current < 500) return;
    if (isDragging || dragStartPos.current.hasMoved) return;
    setIsOpen(prev => !prev);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  // فلترة القوائم حسب الصلاحيات
  const canView = (menuId: string) => {
    if (role === 'super_admin' || role === 'admin') return true;
    
    switch(menuId) {
      case 'dashboard': return can('dashboard', 'view');
      case 'global_summary': return can('dashboard', 'view') || can('reports', 'view');
      case 'pos': return can('pos', 'view') || can('invoices', 'create') || can('invoices', 'view');
      case 'pos_dashboard': return can('pos', 'view') || can('reports', 'view') || can('invoices', 'view');
      case 'pos_settlements': return can('pos', 'view') || can('receipts', 'view');
      case 'fleet_operations': return can('fleet_operations', 'view') || can('fleet', 'view');
      case 'service_operations': return can('fleet_operations', 'view') || can('invoices', 'view');
      case 'invoices': return can('invoices', 'view');
      case 'inventory': return can('inventory', 'view');
      case 'purchase_orders': return can('inventory', 'view') || can('expenses', 'view');
      case 'warehouses': return can('inventory', 'view');
      case 'inventory_transactions': return can('inventory', 'view');
      case 'receipts': case 'receipt_vouchers': return can('receipts', 'view');
      case 'payments': case 'payment_vouchers': return can('payments', 'view');
      case 'expenses': return can('expenses', 'view');
      case 'journal': return can('journal', 'view') || can('accounts', 'view');
      case 'manual_journals': return can('journal', 'view') || can('accounts', 'view') || can('manual_journals', 'view');
      case 'accounts': return can('accounts', 'view');
      case 'ledger': case 'ledgers': return can('accounts', 'view') || can('journal', 'view');
      case 'trialbalance': case 'trial_balance': return can('accounts', 'view') || can('reports', 'view');
      case 'financial_center': return can('accounts', 'view') || can('reports', 'view');
      case 'financial_statements': return can('accounts', 'view') || can('reports', 'view');
      case 'cashflows': return can('accounts', 'view') || can('reports', 'view');
      case 'partners': return can('partners', 'view');
      case 'partner_balances': return can('partners', 'view') || can('reports', 'view');
      case 'delegate_debts': return can('partners', 'view') || can('fleet_operations', 'view');
      case 'delegate_settlements': return can('partners', 'view') || can('fleet_operations', 'view');
      case 'statement': return can('partners', 'view') || can('accounts', 'view');
      case 'reports': return can('reports', 'view');
      case 'import': return can('settings', 'view');
      case 'promotions': return can('invoices', 'view') || can('settings', 'view');
      case 'audit': return can('settings', 'view') || can('reports', 'view');
      case 'fleet': return can('fleet_operations', 'view') || can('fleet', 'view');
      case 'payroll': return can('expenses', 'view') || can('settings', 'view');
      case 'settings': return can('settings', 'view');
      case 'team': return can('settings', 'view') || can('team', 'view');
      default: return true; 
    }
  };

  const currentMargin = isSidebarOpen ? '320px' : '0px';

  const groupKeyMap: Record<string, string> = {
    "الرئيسية والملخصات": "menu_group_home",
    "التشغيل والمبيعات": "menu_group_sales",
    "المستودع": "menu_group_inventory",
    "الحسابات والمالية": "menu_group_finance",
    "العملاء والمندوبين": "menu_group_partners",
    "النظام والتقارير": "menu_group_system",
  };

  // Helper function to find currentPage item dynamically based on path
  const currentMenuItem = (() => {
    for (let group of menuGroups) {
      const match = group.items.find(i => i.path === pathname);
      if (match) return match;
    }
    return null;
  })();

  const currentPageTitle = currentMenuItem 
    ? (t('menu_' + currentMenuItem.id) || currentMenuItem.title)
    : (t('menu_dashboard') || 'الرئيسية');

  // فلترة عناصر القائمة حسب الصلاحيات
  const authorizedMenuGroups = useMemo(() => {
    return menuGroups.map(group => ({
      ...group,
      items: group.items.filter(item => canView(item.id))
    })).filter(group => group.items.length > 0);
  }, [role, can]);

  // إجمالي عدد الشاشات المتاحة
  const totalScreensCount = useMemo(() => {
    return authorizedMenuGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [authorizedMenuGroups]);

  // تابات سطح المكتب السريعة (Desktop Quick Navigation Tabs)
  const primaryNavTabs = useMemo(() => [
    { id: 'dashboard', title: 'الرئيسية', icon: '🏠', path: '/Dashboard' },
    { id: 'pos', title: 'الكاشير (POS)', icon: '🛍️', path: '/pos' },
    { id: 'invoices', title: 'الفواتير', icon: '🧾', path: '/invoices' },
    { id: 'inventory', title: 'المخزون', icon: '📦', path: '/inventory' },
    { id: 'receipts', title: 'القبض والصرف', icon: '💵', path: '/ReceiptVouchers' },
    { id: 'partners', title: 'العملاء', icon: '👥', path: '/partners' },
    { id: 'reports', title: 'التقارير', icon: '📊', path: '/reports' },
    { id: 'fleet', title: 'الأسطول', icon: '🚚', path: '/fleet_operations' },
  ].filter(tab => canView(tab.id)), [role, can]);

  // فلترة الشاشات داخل مركز القيادة حسب البحث والتبويب المحدد
  const filteredMenuGroups = useMemo(() => {
    return authorizedMenuGroups.map(group => {
      if (activeCategory !== 'all' && group.group !== activeCategory) {
        return null;
      }
      const items = group.items.filter(item => {
        if (!hubSearch.trim()) return true;
        const q = hubSearch.toLowerCase().trim();
        const title = (t('menu_' + item.id) || item.title).toLowerCase();
        const path = item.path.toLowerCase();
        return title.includes(q) || path.includes(q);
      });
      if (items.length === 0) return null;
      return { ...group, items };
    }).filter(Boolean) as typeof authorizedMenuGroups;
  }, [authorizedMenuGroups, activeCategory, hubSearch, t]);

  let animationDelayCounter = 0;

  if (pathname === '/login' || pathname === '/signup') {
    return <>{children}</>;
  }

  if (!mounted || !isInitialized || loading) {
    return <LoadingScreen message="جاري تهيئة نظام صيدلية تاج المودة..." />; 
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', overflowX: 'hidden' }}>
      
      {/* 🏜️ أنماط Desert Glassmorphism المتقدمة للـ Layout الفاخر */}
      <style dangerouslySetInnerHTML={{__html: `
        :root {
          --desert-brown: #1E130B;
          --desert-gold: #C29B62;
          --desert-clay: #A8573C;
          --desert-pearl: #FDFBF7;
          --desert-oasis: #059669;
        }

        /* =================== شريط تابات سطح المكتب الفاخر (Desktop Quick Tabs Bar) =================== */
        .desktop-luxury-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #FFFFFF;
          border-bottom: 1.5px solid rgba(194, 155, 98, 0.25);
          padding: 6px 16px;
          position: sticky;
          top: 0;
          z-index: 990;
          box-shadow: 0 4px 18px rgba(30, 19, 11, 0.04);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          transition: all 0.3s ease;
        }
        @media (max-width: 768px) {
          .desktop-luxury-nav {
            display: none !important;
          }
        }
        .desktop-nav-inner {
          width: 100%;
          max-width: 1400px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .desktop-nav-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 12px;
          transition: all 0.2s;
        }
        .desktop-nav-brand:hover {
          background: rgba(194, 155, 98, 0.1);
        }
        .desktop-brand-logo {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid rgba(194, 155, 98, 0.4);
          object-fit: contain;
        }
        .desktop-brand-meta {
          display: flex;
          flex-direction: column;
          line-height: 1.1;
        }
        .desktop-brand-name {
          font-size: 13px;
          font-weight: 900;
          color: #1E130B;
        }
        .desktop-brand-badge {
          font-size: 9.5px;
          font-weight: 800;
          color: #C29B62;
        }
        .desktop-tabs-track {
          display: flex;
          align-items: center;
          gap: 4px;
          overflow-x: auto;
          padding: 2px 0;
          scrollbar-width: none;
        }
        .desktop-tabs-track::-webkit-scrollbar {
          display: none;
        }
        .desktop-nav-tab {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 10px;
          text-decoration: none;
          font-size: 12.5px;
          font-weight: 800;
          color: #6e5d4f;
          border: 1px solid transparent;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          white-space: nowrap;
          position: relative;
        }
        .desktop-nav-tab:hover {
          color: #1E130B;
          background: rgba(194, 155, 98, 0.1);
          transform: translateY(-1px);
        }
        .desktop-nav-tab.active {
          color: #1E130B;
          background: linear-gradient(135deg, rgba(194, 155, 98, 0.18) 0%, rgba(168, 87, 60, 0.08) 100%);
          border-color: rgba(194, 155, 98, 0.45);
          box-shadow: 0 2px 8px rgba(194, 155, 98, 0.15);
        }
        .tab-glow-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #059669;
          box-shadow: 0 0 6px #059669;
        }
        .desktop-nav-hub-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 10px;
          background: linear-gradient(135deg, #C29B62 0%, #A8573C 100%);
          color: #FFFFFF;
          border: none;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(168, 87, 60, 0.25);
          transition: all 0.2s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .desktop-nav-hub-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(168, 87, 60, 0.35);
          filter: brightness(1.08);
        }
        .hub-screens-badge {
          background: rgba(255, 255, 255, 0.25);
          color: white;
          font-size: 10px;
          font-weight: 900;
          padding: 1px 6px;
          border-radius: 8px;
        }

        /* =================== الزر العائم القابل للسحب (Draggable FAB) =================== */
        .fab-main {
          position: fixed;
          bottom: 30px; left: 30px; right: auto;
          width: 66px; height: 66px;
          border-radius: 50%;
          background: linear-gradient(135deg, rgba(255, 253, 250, 0.94) 0%, rgba(255, 253, 250, 0.7) 100%);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1.5px solid rgba(194, 155, 98, 0.5);
          box-shadow: 0 10px 30px rgba(44, 26, 18, 0.15), inset 0 0 12px rgba(255, 253, 250, 0.8);
          cursor: grab; z-index: 9990;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
          user-select: none; padding: 10px;
          touch-action: none;
          -webkit-tap-highlight-color: transparent;
          ${isOpen ? 'transform: scale(0.85) rotate(-15deg); opacity: 0.8;' : 'transform: scale(1) rotate(0deg); opacity: 1;'}
        }
        .fab-main.fab-has-custom-pos {
          bottom: auto !important;
          right: auto !important;
        }
        .fab-main.fab-dragging {
          cursor: grabbing !important;
          transition: none !important;
          transform: scale(1.12) !important;
          box-shadow: 0 15px 35px rgba(168, 87, 60, 0.35) !important;
          opacity: 0.95 !important;
        }
        .fab-main:hover { 
          transform: scale(1.08) rotate(6deg); 
          background: rgba(255, 253, 250, 0.98); 
          border-color: #C29B62; 
          box-shadow: 0 12px 35px rgba(194, 155, 98, 0.35);
        }
        .fab-main:active { transform: scale(0.95); }
        .fab-logo { 
          width: 100%; height: 100%; 
          object-fit: contain; 
          pointer-events: none; 
          filter: drop-shadow(0 2px 4px rgba(44,26,18,0.25));
        }

        /* =================== مركز القيادة الزجاجي (Command Hub Overlay) =================== */
        .overlay-backdrop {
          position: fixed; inset: 0;
          background: rgba(30, 19, 11, 0.65);
          backdrop-filter: blur(14px) saturate(180%);
          -webkit-backdrop-filter: blur(14px) saturate(180%);
          z-index: 99998;
          opacity: ${isOpen ? 1 : 0};
          pointer-events: ${isOpen ? 'auto' : 'none'};
          transition: opacity 0.35s cubic-bezier(0.165, 0.84, 0.44, 1);
        }

        .overlay-screen {
          position: fixed; inset: 0; z-index: 99999;
          display: flex; justify-content: center; align-items: flex-start;
          padding: 24px 16px;
          overflow-y: auto; overflow-x: hidden;
          opacity: ${isOpen ? 1 : 0};
          pointer-events: ${isOpen ? 'auto' : 'none'};
          transition: opacity 0.35s cubic-bezier(0.165, 0.84, 0.44, 1);
          direction: ${dir};
        }

        .command-center {
          width: 100%; max-width: 1200px;
          display: flex; flex-direction: column; gap: 16px;
          margin-top: 10px; margin-bottom: 40px;
          transform: ${isOpen ? 'translateY(0) scale(1)' : 'translateY(25px) scale(0.98)'};
          transition: transform 0.35s cubic-bezier(0.165, 0.84, 0.44, 1);
        }

        .admin-header-glass {
          background: linear-gradient(135deg, rgba(255, 253, 250, 0.95) 0%, rgba(255, 253, 250, 0.8) 100%);
          backdrop-filter: blur(24px) saturate(160%);
          -webkit-backdrop-filter: blur(24px) saturate(160%);
          border: 1.5px solid rgba(194, 155, 98, 0.4);
          border-radius: 24px; padding: 18px 24px;
          display: flex; align-items: center; justify-content: space-between;
          box-shadow: 0 10px 30px rgba(44, 26, 18, 0.08);
          flex-wrap: wrap; gap: 12px;
        }
        .brand-logo-wrap {
          width: 48px; height: 48px; border-radius: 14px;
          background: linear-gradient(135deg, rgba(255, 253, 250, 0.95), rgba(194, 155, 98, 0.25));
          border: 1.5px solid rgba(194, 155, 98, 0.45);
          display: flex; align-items: center; justify-content: center;
          padding: 4px; box-shadow: 0 4px 12px rgba(44, 26, 18, 0.08);
        }
        .brand-logo-img { width: 100%; height: 100%; object-fit: contain; }
        .brand-text-block { display: flex; flex-direction: column; }
        .brand-title { font-size: 17px; font-weight: 900; color: #1E130B; line-height: 1.2; }
        .brand-subtitle { font-size: 12px; font-weight: 700; color: #C29B62; letter-spacing: 0.3px; }

        .online-status-chip {
          display: flex; align-items: center; gap: 6px;
          background: rgba(5, 150, 105, 0.12);
          border: 1px solid rgba(5, 150, 105, 0.35);
          color: #059669; padding: 6px 14px; border-radius: 20px;
          font-size: 12px; font-weight: 800;
        }
        .online-dot-pulse {
          width: 8px; height: 8px; background: #059669; border-radius: 50%;
          box-shadow: 0 0 10px #059669; animation: pulseGreen 2s infinite ease-in-out;
        }
        @keyframes pulseGreen {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.25); }
        }

        .btn-logout-header {
          display: flex; align-items: center; gap: 6px;
          background: rgba(220, 38, 38, 0.08); color: #dc2626;
          border: 1px solid rgba(220, 38, 38, 0.25);
          padding: 8px 16px; border-radius: 12px;
          font-size: 12.5px; font-weight: 800; cursor: pointer; transition: all 0.2s ease;
        }
        .btn-logout-header:hover { background: #fee2e2; border-color: #dc2626; }

        .btn-close-modal {
          width: 42px; height: 42px; border-radius: 12px;
          background: rgba(44, 26, 18, 0.06); border: 1px solid rgba(194, 155, 98, 0.25);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #1E130B; transition: all 0.2s ease;
        }
        .btn-close-modal:hover {
          background: #A8573C; color: #FFFFFF; border-color: #A8573C; transform: translateY(-2px);
        }

        /* شريط البحث وتصنيف التابات داخل مركز القيادة */
        .hub-search-container {
          background: #FFFFFF;
          border: 1.5px solid rgba(194, 155, 98, 0.3);
          border-radius: 20px; padding: 14px 18px;
          box-shadow: 0 4px 18px rgba(30, 19, 11, 0.05);
          display: flex; flex-direction: column; gap: 12px;
        }
        .hub-search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .hub-search-icon {
          position: absolute; right: 14px; color: #C29B62; font-size: 16px; pointer-events: none;
        }
        .hub-search-input {
          width: 100%; height: 44px;
          padding: 0 42px 0 36px;
          border-radius: 12px;
          border: 1px solid rgba(194, 155, 98, 0.3);
          background: #FDFBF7; color: #1E130B;
          font-size: 13.5px; font-weight: 700; outline: none;
          transition: all 0.2s;
        }
        .hub-search-input:focus {
          border-color: #C29B62; background: #FFFFFF;
          box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.2);
        }
        .hub-clear-search-btn {
          position: absolute; left: 12px; background: none; border: none;
          color: #94a3b8; font-size: 14px; cursor: pointer; padding: 4px;
        }
        .hub-categories-track {
          display: flex; align-items: center; gap: 6px;
          overflow-x: auto; padding-bottom: 2px;
          scrollbar-width: none;
        }
        .hub-categories-track::-webkit-scrollbar { display: none; }
        .hub-category-pill {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 10px;
          border: 1px solid rgba(194, 155, 98, 0.25);
          background: #FDFBF7; color: #6e5d4f;
          font-size: 12px; font-weight: 800; cursor: pointer;
          transition: all 0.2s; white-space: nowrap;
        }
        .hub-category-pill:hover {
          background: rgba(194, 155, 98, 0.12); color: #1E130B;
        }
        .hub-category-pill.active {
          background: #1E130B; color: #FFFFFF;
          border-color: #1E130B; box-shadow: 0 2px 8px rgba(30, 19, 11, 0.2);
        }
        .hub-cat-count {
          padding: 1px 6px; border-radius: 6px; font-size: 10px; font-weight: 900;
          background: rgba(194, 155, 98, 0.2); color: inherit;
        }

        .group-section {
          background: #FFFFFF;
          border: 1px solid rgba(194, 155, 98, 0.25);
          border-radius: 20px; padding: 20px;
          box-shadow: 0 4px 18px rgba(30, 19, 11, 0.04);
          display: flex; flex-direction: column; gap: 14px;
        }

        .group-header {
          font-size: 14px; font-weight: 900; color: #1E130B;
          border-bottom: 1.5px solid rgba(194, 155, 98, 0.25);
          padding-bottom: 8px; margin-bottom: 4px;
          display: flex; align-items: center; justify-content: space-between;
          letter-spacing: 0.3px;
        }

        .items-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 12px;
        }

        .nav-card {
          background: #FDFBF7;
          border: 1px solid rgba(194, 155, 98, 0.25);
          border-radius: 14px; padding: 12px 16px;
          display: flex; align-items: center; justify-content: space-between;
          text-decoration: none; color: #1E130B;
          transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-shadow: 0 2px 6px rgba(30, 19, 11, 0.03);
          position: relative; overflow: hidden;
          opacity: ${isOpen ? 1 : 0};
          transform: ${isOpen ? 'translateY(0)' : 'translateY(16px)'};
          animation: ${isOpen ? 'slideUpFade 0.4s forwards' : 'none'};
        }

        .nav-card:hover {
          background: #FFFFFF;
          transform: translateY(-3px) !important;
          box-shadow: 0 8px 20px rgba(168, 87, 60, 0.12) !important;
          border-color: #C29B62;
        }

        .nav-card.active {
          background: #FFFFFF;
          border: 1.5px solid #C29B62;
          box-shadow: 0 6px 18px rgba(194, 155, 98, 0.2);
        }

        .nav-card-left {
          display: flex; align-items: center; gap: 12px;
          min-width: 0; flex: 1; overflow: hidden;
        }

        .icon-wrapper {
          width: 38px; height: 38px; min-width: 38px;
          background: rgba(194, 155, 98, 0.12);
          border-radius: 10px; display: flex; align-items: center; justify-content: center;
          font-size: 18px; border: 1px solid rgba(194, 155, 98, 0.3);
          flex-shrink: 0;
        }

        .nav-title-block {
          display: flex; flex-direction: column; min-width: 0; overflow: hidden;
        }
        .nav-title {
          font-weight: 800; font-size: 13px; color: #1E130B;
          line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .nav-card-active-dot {
          width: 7px; height: 7px; background: #059669; border-radius: 50%;
          box-shadow: 0 0 8px #059669;
        }

        .hub-empty-state {
          text-align: center; padding: 40px 20px;
          background: #FFFFFF; border-radius: 20px;
          border: 1.5px dashed rgba(194, 155, 98, 0.3);
        }
        .hub-reset-btn {
          margin-top: 10px; padding: 8px 16px; border-radius: 10px;
          background: rgba(194, 155, 98, 0.15); color: #C29B62;
          border: 1px solid rgba(194, 155, 98, 0.3);
          font-size: 12px; font-weight: 800; cursor: pointer;
        }

        @keyframes slideUpFade {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* =================== شريط التنقل السفلي الذكي للجوال (Bottom Dock) =================== */
        .desert-bottom-dock {
          display: none;
        }

        @media (max-width: 768px) {
          .fab-main {
            display: none !important;
          }
          .command-center { margin-top: 6px; gap: 12px; }
          .group-section { padding: 14px; border-radius: 16px; }
          .items-grid { grid-template-columns: 1fr; gap: 8px; }
          .nav-card { padding: 10px 14px; }

          .main-content {
            margin-right: 0 !important;
            margin-left: 0 !important;
            padding-bottom: 80px !important;
          }

          /* الشريط السفلي للجوال */
          .desert-bottom-dock {
            display: flex;
            position: fixed;
            bottom: 8px;
            left: 10px;
            right: 10px;
            height: 60px;
            background: #FFFFFF;
            border: 1.5px solid rgba(194, 155, 98, 0.35);
            border-radius: 18px;
            box-shadow: 0 8px 30px rgba(30, 19, 11, 0.16);
            z-index: 995;
            align-items: center;
            justify-content: space-around;
            padding: 0 4px;
            box-sizing: border-box;
          }
          .dock-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 2px;
            text-decoration: none;
            color: #6e5d4f;
            font-size: 10.5px;
            font-weight: 800;
            padding: 6px 8px;
            border-radius: 12px;
            transition: all 0.2s ease;
            position: relative;
            flex: 1;
            min-height: 44px;
          }
          .dock-item:active {
            transform: scale(0.95);
          }
          .dock-item.active {
            color: #1E130B;
            background: rgba(194, 155, 98, 0.16);
            border: 1px solid rgba(194, 155, 98, 0.3);
          }
          .dock-item.active::after {
            content: '';
            position: absolute;
            bottom: 3px;
            width: 5px;
            height: 5px;
            border-radius: 50%;
            background: #C29B62;
          }
          .dock-item svg {
            width: 19px;
            height: 19px;
            flex-shrink: 0;
          }
        }
      `}} />

      {/* 🌟 1️⃣ شريط تابات التنقل السريع الفاخر لسطح المكتب (Desktop Quick Tabs Bar) */}
      <nav className="desktop-luxury-nav no-print" aria-label="التنقل السريع">
        <div className="desktop-nav-inner">
          <div className="desktop-nav-brand" onClick={() => setIsOpen(true)} title="فتح القائمة الشاملة">
            <img src="/taj_logo.png" alt="تاج المودة" className="desktop-brand-logo" />
            <div className="desktop-brand-meta">
              <span className="desktop-brand-name">تاج المودة</span>
              <span className="desktop-brand-badge">ERP & POS</span>
            </div>
          </div>

          <div className="desktop-tabs-track">
            {primaryNavTabs.map((tab) => {
              const isActive = pathname === tab.path || (tab.path !== '/Dashboard' && pathname.startsWith(tab.path));
              return (
                <Link
                  key={tab.path}
                  href={tab.path}
                  prefetch={false}
                  className={`desktop-nav-tab ${isActive ? 'active' : ''}`}
                >
                  <span className="tab-icon">{tab.icon}</span>
                  <span className="tab-text">{tab.title}</span>
                  {isActive && <span className="tab-glow-dot" />}
                </Link>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="desktop-nav-hub-btn"
            title="فتح مركز القيادة الشامل لجميع الشاشات (F1)"
          >
            <span>🧭</span>
            <span>جميع الشاشات</span>
            <span className="hub-screens-badge">{totalScreensCount}</span>
          </button>
        </div>
      </nav>

      {/* 2️⃣ السايد بار المتقدم للفلترة والعمليات */}
      <RawasiFilterSidebar 
        title={currentPageTitle}
        extraActions={actions}
        summarySlot={summary}
        customFilters={customFilters}
        isOpenStatus={isSidebarOpen}
        setIsOpenStatus={setIsSidebarOpen}
        onSearch={(term) => window.dispatchEvent(new CustomEvent('globalSearch', { detail: term }))}
        onDateChange={(start, end) => window.dispatchEvent(new CustomEvent('globalDateFilter', { detail: { start, end } }))}
      />

      {/* 3️⃣ الزر العائم الذكي القابل للسحب (Draggable FAB) */}
      <div 
        className={`fab-main no-print ${customPosition ? 'fab-has-custom-pos' : ''} ${isDragging ? 'fab-dragging' : ''}`} 
        style={customPosition ? { 
          left: `${customPosition.x}px`, 
          top: `${customPosition.y}px`, 
          bottom: 'auto', 
          right: 'auto',
          touchAction: 'none'
        } : { 
          touchAction: 'none' 
        }}
        onMouseDown={onMouseDown} 
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
        title="القائمة العائمة (يمكنك سحبها وتحريكها في أي مكان)"
      >
        <img src="/taj_logo.png" alt="شعار صيدلية تاج المودة" className="fab-logo" draggable="false" />
      </div>

      {/* 4️⃣ مركز القيادة الشامل (Command Hub Modal) */}
      <div className="overlay-backdrop no-print"></div>
      <nav 
        className="overlay-screen no-print" 
        onClick={(e) => {
          if (e.target === e.currentTarget) setIsOpen(false); 
        }}
      >
        <div className="command-center" onClick={(e) => e.stopPropagation()}>
          
          {/* ترويسة مركز القيادة والقائمة */}
          <div className="admin-header-glass">
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div className="brand-logo-wrap">
                <img src="/taj_logo.png" alt="شعار صيدلية تاج المودة" className="brand-logo-img" />
              </div>
              <div className="brand-text-block">
                <span className="brand-title">صيدلية تاج المودة البيطرية</span>
                <span className="brand-subtitle">
                  {language === 'en' ? `Management Portal | ${role === 'super_admin' ? 'Super Admin' : 'Staff'}` : `بوابة الإدارة الشاملة | ${role === 'super_admin' ? 'مدير النظام' : 'صلاحيات مستخدم'}`}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div className="online-status-chip">
                <span className="online-dot-pulse"></span>
                <span>{language === 'en' ? `${onlineCount} Online` : `${onlineCount} متصل`}</span>
              </div>

              <button 
                onClick={toggleLowGraphics}
                className="btn-logout-header"
                style={{ 
                  color: lowGraphics ? '#C29B62' : '#1E130B', 
                  background: lowGraphics ? 'rgba(194, 155, 98, 0.15)' : 'rgba(44, 26, 18, 0.05)',
                  borderColor: lowGraphics ? 'rgba(194, 155, 98, 0.4)' : 'rgba(44, 26, 18, 0.1)'
                }}
                title={language === 'en' ? 'Performance Mode' : 'وضع الأداء السريع (للجوالات القديمة)'}
              >
                <Zap size={15} />
                <span style={{ display: typeof window !== 'undefined' && window.innerWidth <= 768 ? 'none' : 'inline' }}>
                  {language === 'en' ? 'Performance' : 'وضع الأداء'}
                </span>
              </button>

              <button className="btn-logout-header" onClick={handleLogout} title="تسجيل الخروج">
                <LogOut size={15} />
                <span>{language === 'en' ? 'Logout' : 'تسجيل الخروج'}</span>
              </button>

              <button 
                onClick={() => setIsOpen(false)} 
                className="btn-close-modal"
                title="إغلاق القائمة (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* شريط البحث وتصنيف التابات داخل مركز القيادة */}
          <div className="hub-search-container">
            <div className="hub-search-input-wrapper">
              <span className="hub-search-icon">🔍</span>
              <input
                type="text"
                placeholder={language === 'en' ? "Search any screen or report..." : "ابحث عن أي شاشة أو تقرير (مثلاً: كاشير، فواتير، مخزون، أرباح...)"}
                value={hubSearch}
                onChange={(e) => setHubSearch(e.target.value)}
                className="hub-search-input"
                autoFocus={isOpen}
              />
              {hubSearch && (
                <button type="button" onClick={() => setHubSearch('')} className="hub-clear-search-btn">
                  ✕
                </button>
              )}
            </div>

            {/* تابات تصنيف الأقسام */}
            <div className="hub-categories-track">
              <button
                type="button"
                className={`hub-category-pill ${activeCategory === 'all' ? 'active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                <span>🌟 {language === 'en' ? 'All Screens' : 'جميع الشاشات'}</span>
                <span className="hub-cat-count">{totalScreensCount}</span>
              </button>
              {authorizedMenuGroups.map((group) => {
                const groupTitle = groupKeyMap[group.group] ? t(groupKeyMap[group.group]) : group.group;
                return (
                  <button
                    key={group.group}
                    type="button"
                    className={`hub-category-pill ${activeCategory === group.group ? 'active' : ''}`}
                    onClick={() => setActiveCategory(group.group)}
                  >
                    <span>{groupTitle}</span>
                    <span className="hub-cat-count">{group.items.length}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* شبكة البطاقات المفروزة والمنقحة */}
          {filteredMenuGroups.length > 0 ? (
            filteredMenuGroups.map((group, gIdx) => {
              const groupTitle = groupKeyMap[group.group] ? t(groupKeyMap[group.group]) : group.group;

              return (
                <div key={gIdx} className="group-section">
                  <div className="group-header">
                    <span>{groupTitle}</span>
                    <span style={{ fontSize: '11px', color: '#C29B62', background: 'rgba(194, 155, 98, 0.15)', padding: '2px 8px', borderRadius: '10px' }}>
                      {group.items.length} {language === 'en' ? 'Screens' : 'شاشات'}
                    </span>
                  </div>
                  <div className="items-grid">
                    {group.items.map((item, iIdx) => {
                      const delay = (animationDelayCounter++) * 0.02;
                      const isActive = pathname === item.path;
                      const itemTitle = t('menu_' + item.id) || item.title;
                      return (
                        <Link key={iIdx} href={item.path} prefetch={false} onClick={() => setIsOpen(false)}>
                          <div className={`nav-card ${isActive ? 'active' : ''}`} style={{ animationDelay: isOpen ? `${delay}s` : '0s' }}>
                            <div className="nav-card-left">
                              <div className="icon-wrapper">{item.icon}</div>
                              <div className="nav-title-block">
                                <span className="nav-title">{itemTitle}</span>
                                <span style={{ fontSize: '11px', color: 'rgba(44, 26, 18, 0.5)', fontWeight: 600 }}>{item.path}</span>
                              </div>
                            </div>
                            {isActive ? (
                              <div className="nav-card-active-dot" title="الشاشة المفتوحة حالياً"></div>
                            ) : (
                              <ArrowUpRight size={16} color="rgba(44, 26, 18, 0.35)" />
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="hub-empty-state">
              <div style={{ fontSize: '32px' }}>🔍</div>
              <div style={{ fontWeight: 900, fontSize: '15px', color: '#1E130B', marginTop: '6px' }}>
                {language === 'en' ? 'No matching screens found' : `لا توجد نتائج مطابقة لـ "${hubSearch}"`}
              </div>
              <button type="button" onClick={() => { setHubSearch(''); setActiveCategory('all'); }} className="hub-reset-btn">
                {language === 'en' ? 'Reset search' : 'إعادة ضبط البحث وتصفية الشاشات'}
              </button>
            </div>
          )}

          {/* المتصلين حالياً بالنظام */}
          {onlineUsers.length > 0 && (
            <div className="group-section" style={{ marginTop: '6px' }}>
              <div className="group-header" style={{ borderColor: 'rgba(5, 150, 105, 0.3)', color: '#059669' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="online-dot-pulse"></span>
                  <span>{language === 'en' ? `Team Online (${onlineCount})` : `فريق العمل المتصل الآن (${onlineCount})`}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '6px' }}>
                {onlineUsers.map((user, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#FFFFFF', padding: '8px 14px', borderRadius: '12px', border: '1px solid rgba(5, 150, 105, 0.25)', boxShadow: '0 2px 8px rgba(44,26,18,0.03)' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#059669', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '13px' }}>
                      {user.full_name?.charAt(0) || 'م'}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 900, color: '#1E130B' }}>{user.full_name}</span>
                      <span style={{ fontSize: '10.5px', color: '#C29B62', fontWeight: 700 }}>
                        {language === 'en' ? (user.role === 'super_admin' ? 'Admin' : 'Staff') : (user.role === 'super_admin' ? 'مدير' : 'موظف')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </nav>

      {/* 5️⃣ شريط التنقل السفلي الذكي للجوال (Mobile Bottom Dock) */}
      <div className="desert-bottom-dock no-print">
        <Link href="/Dashboard" prefetch={false} className={`dock-item ${pathname === '/Dashboard' ? 'active' : ''}`}>
          <Home />
          <span>الرئيسية</span>
        </Link>
        <Link href="/pos" prefetch={false} className={`dock-item ${pathname === '/pos' ? 'active' : ''}`}>
          <ShoppingBag />
          <span>الكاشير</span>
        </Link>
        <Link href="/invoices" prefetch={false} className={`dock-item ${pathname === '/invoices' ? 'active' : ''}`}>
          <FileText />
          <span>الفواتير</span>
        </Link>
        <Link href="/inventory" prefetch={false} className={`dock-item ${pathname === '/inventory' ? 'active' : ''}`}>
          <Package />
          <span>الأصناف</span>
        </Link>
        <button 
          onClick={() => setIsOpen(prev => !prev)} 
          className={`dock-item ${isOpen ? 'active' : ''}`}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <Menu />
          <span>المزيد</span>
        </button>
      </div>

      {/* 6️⃣ المحتوى الرئيسي للصفحة */}
      <main className="main-content" style={{ 
          flex: 1, 
          boxSizing: 'border-box',
          marginRight: isRtl ? currentMargin : '0px', 
          marginLeft: !isRtl ? currentMargin : '0px',
          paddingRight: '15px', 
          paddingLeft: '15px',
          paddingTop: '15px',
          minHeight: '100vh', 
          position: 'relative', 
          zIndex: 1,
          overflowX: 'hidden',
          transition: isRtl ? 'margin-right 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)' : 'margin-left 0.4s cubic-bezier(0.165, 0.84, 0.44, 1)' 
      }}>
        {children}
      </main>
    </div>
  );
}
