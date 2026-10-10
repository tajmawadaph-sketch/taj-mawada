"use client";
import { useEffect, useState, createContext, useContext, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import LoadingScreen from '@/components/LoadingScreen';
import { supabase } from "@/lib/supabase";

const AuthContext = createContext<{
  user: any;
  profile: any;
  loading: boolean;
  can: (module: string, action: string) => boolean;
} | null>(null);

const ROUTE_MODULE_MAP: Record<string, string> = {
  '/Dashboard': 'dashboard',
  '/GlobalSummary': 'global_summary',
  '/kpis': 'global_summary',
  
  '/pos': 'pos',
  '/pos/dashboard': 'pos_dashboard',
  
  '/fleet': 'fleet',
  '/fleet_operations': 'fleet_operations',
  '/invoices': 'invoices',
  
  '/inventory': 'inventory',
  '/item-card': 'inventory',
  '/dead-stock': 'inventory',
  '/reorder-alerts': 'inventory',
  '/inventory-valuation': 'inventory',
  
  '/purchase_orders': 'purchase_orders',
  '/inventory/warehouses': 'warehouses',
  '/inventory/transactions': 'inventory_transactions',
  
  '/ReceiptVouchers': 'receipts',
  '/PaymentVouchers': 'payments',
  '/expenses': 'expenses',
  '/journal': 'journal',
  '/ManualJournals': 'manual_journals',
  '/accounts': 'accounts',
  '/ledger': 'ledger',
  '/trialbalance': 'trialbalance',
  
  '/financial-center': 'financial_center',
  '/financialplan': 'financial_center',
  '/financial-statements': 'financial_statements',
  '/cashflows': 'cashflows',
  
  '/partners': 'partners',
  '/PartnerBalances': 'partner_balances',
  '/delegate-debts': 'delegate_debts',
  '/delegate-settlements': 'delegate_settlements',
  '/statement': 'statement',
  
  '/reports': 'reports',
  '/sales-analysis': 'reports',
  '/trip-profitability': 'reports',
  '/ar-aging': 'reports',
  '/vehicle-expenses': 'reports',
  '/vat-return': 'reports',
  '/profit-dashboard': 'reports',
  
  '/import': 'import',
  '/audit': 'audit',
  '/payroll': 'payroll',
  '/settings': 'settings',
  '/diagnostics': 'settings',
  '/settings/permissions': 'team',
  '/team': 'team',
  '/messages': 'messages',
  '/promotions': 'invoices',
  '/service-operations': 'fleet_operations',
  '/pos-settlements': 'pos',
};

function getInitialAuthUser() {
  if (typeof window === 'undefined') return { user: null, hasStoredToken: false };
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key);
        if (item) {
          const parsed = JSON.parse(item);
          const cachedUser = parsed?.user || parsed?.currentSession?.user;
          if (cachedUser) {
            return { user: cachedUser, hasStoredToken: true };
          }
          return { user: null, hasStoredToken: true };
        }
      }
    }
  } catch (_) {}
  return { user: null, hasStoredToken: false };
}

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let isMounted = true;
    const { user: initialUser, hasStoredToken } = getInitialAuthUser();

    // ⚡ مسار سريع: إذا كان المستخدم في مسار محمي ولا يوجد أي توكن إطلاقاً
    if (!hasStoredToken && pathname !== '/login' && pathname !== '/signup') {
      setLoading(false);
      window.location.replace('/login');
      return;
    }

    // إذا وجدنا يوزر مخزن محلياً، نضعه فوراً لتفادي أي وميض أو تأخير
    if (initialUser && !user) {
      setUser(initialUser);
      setLoading(false);
    }

    // 🛡️ مؤقت أمان فوري (1.5 ثانية كحد أقصى) لضمان عدم تعليق الشاشة تحت أي ظرف
    const safetyTimer = setTimeout(() => {
      if (isMounted) {
        setLoading(false);
      }
    }, 1500);

    const purgeDeadSession = async () => {
      try {
        await supabase.auth.signOut();
      } catch (_) {}
      try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
            localStorage.removeItem(key);
          }
        }
      } catch (_) {}
    };

    const handleSession = async (session: any) => {
      if (!isMounted) return;

      if (!session?.user) {
        setUser(null);
        setProfile(null);
        setLoading(false);
        if (pathname !== '/login' && pathname !== '/signup') {
          await purgeDeadSession();
          window.location.replace('/login');
        }
        return;
      }

      setUser(session.user);

      try {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();

        if (!isMounted) return;

        if (profileData?.is_active === false) {
          await purgeDeadSession();
          alert("⛔ تم إيقاف حسابك من قبل الإدارة. يرجى مراجعة مدير النظام.");
          window.location.replace("/login");
          setLoading(false);
          return;
        }

        setProfile(profileData || { id: session.user.id, role: 'admin', is_admin: true });
      } catch (err) {
        console.warn("⚠️ لم نتمكن من جلب بيانات البروفايل، السماح بالدخول الافتراضي:", err);
        if (isMounted) {
          setProfile({ id: session.user.id, role: 'admin', is_admin: true });
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // 1. فحص الجلسة الحالية
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error || !session) {
        handleSession(null);
      } else {
        handleSession(session);
      }
    }).catch(() => {
      if (isMounted) setLoading(false);
    });

    // 2. الاستماع لتغييرات الجلسة (تسجيل دخول، خروج، تجديد توكن)
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
          if (pathname !== '/login' && pathname !== '/signup') {
            window.location.replace('/login');
          }
        }
      } else if (session) {
        handleSession(session);
      } else {
        if (isMounted) {
          setUser(null);
          setProfile(null);
          setLoading(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      authListener.subscription.unsubscribe();
    };
  }, []); // 👈 يعمل مرة واحدة فقط عند التحميل

  // 🛡️ توجيه ذكي منفصل بناء على المسار وحالة الدخول
  useEffect(() => {
    if (loading) return;

    if (!user) {
      if (pathname !== "/login" && pathname !== "/signup") {
        window.location.replace("/login");
      }
    } else {
      if (pathname === "/login" || pathname === "/signup") {
        router.replace("/");
      }
    }
  }, [user, loading, pathname, router]);

  const can = (moduleName: string, action: string) => {
    if (!profile) return false;
    if (profile.role === 'admin' || profile.role === 'super_admin' || profile.is_admin) return true; 
    
    const perms = profile.permissions || {};
    // Check for array format (old) or object format (new)
    if (Array.isArray(perms[moduleName])) {
      return perms[moduleName].includes(action);
    } else if (perms[moduleName] && typeof perms[moduleName] === 'object') {
      return !!perms[moduleName][action];
    }
    return false;
  };

  const isAuthorized = useMemo(() => {
    if (loading || !user || !profile) return true; // Don't block while loading
    if (pathname === '/' || pathname === '/login' || pathname === '/signup' || pathname.startsWith('/api')) return true;
    
    // 🛡️ السماح دائماً للملف الشخصي والتنبيهات
    if (pathname === '/profile' || pathname === '/notifications') return true;

    // Check for exact match first (case-insensitive)
    const lowerPath = pathname.toLowerCase();
    let requiredModule = Object.entries(ROUTE_MODULE_MAP).find(([k]) => k.toLowerCase() === lowerPath)?.[1];
    
    // If no exact match, check for matching prefixes for sub-routes
    if (!requiredModule) {
      const matching = Object.entries(ROUTE_MODULE_MAP)
        .sort((a, b) => b[0].length - a[0].length)
        .find(([k]) => lowerPath.startsWith(k.toLowerCase() + '/'));
      
      if (matching) {
        requiredModule = matching[1];
      }
    }

    if (!requiredModule) return true; // If route not mapped, let it pass (safe fallback)

    return can(requiredModule, 'view');
  }, [pathname, profile, loading, user]);

  return (
    <AuthContext.Provider value={{ user, profile, loading, can }}>
      {loading && !user && pathname !== '/login' && pathname !== '/signup' ? (
        <LoadingScreen message="جاري الدخول..." subMessage="لحظات وستكون جاهزاً" fullScreen={true} />
      ) : !user && pathname !== '/login' && pathname !== '/signup' ? (
        <LoadingScreen message="جاري التحويل لصفحة الدخول..." subMessage="يرجى الانتظار" fullScreen={true} />
      ) : !isAuthorized ? (
        <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.6)', padding: '20px', textAlign: 'center' }}>
          <div style={{ marginBottom: '15px', fontSize: '60px' }}>
            🛑
          </div>
          <h1 style={{ color: '#dc2626', fontWeight: 900, fontSize: '32px', margin: '0' }}>عفواً، ليس لديك صلاحية للوصول إلى هذه الصفحة!</h1>
          <button 
            onClick={() => router.push('/')}
            style={{ marginTop: '25px', padding: '14px 30px', background: '#dc2626', color: 'white', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: '16px', boxShadow: '0 4px 15px rgba(220,38,38,0.4)', transition: '0.3s' }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            🏠 العودة للرئيسية
          </button>
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: null,
      profile: null,
      loading: false,
      can: () => false,
    };
  }
  return context;
};


