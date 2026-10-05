"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { useDashboardLogic } from './dashboard_logic';
import DataSyncBanner from '@/components/dashboard/DataSyncBanner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';

const ROYAL_PIE_COLORS = ['#C29B62', '#1E130B', '#059669', '#A8573C', '#8C6239', '#5C4033', '#2C1A12'];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'profitability' | 'fleet' | 'liquidity'>('all');
  const logic = useDashboardLogic();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <MasterPage 
      title="لوحة القيادة التنفيذية العليا" 
      subtitle="مراقبة ربحية الصيدلية، كفاءة الأسطول، والموقف المالي الموحد - ريال سعودي"
    >
      {logic.isLoading || !logic.stats ? (
        <LoadingScreen 
          message="جاري تجميع المؤشرات التنفيذية وحساب الربحية..." 
          subMessage="نقوم الآن بتحليل فواتير المبيعات، تكاليف الأدوية، وحركات الخزينة والأسطول..." 
          fullScreen={false} 
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', paddingBottom: '60px' }}>
          
          {/* 📡 1. شريط المزامنة السحابية والمحلية */}
          <DataSyncBanner />

          {/* ⏳ 2. إنذار مراقبة تواريخ الصلاحية للأدوية البيطرية */}
          {((logic.stats?.expiredItemsCount || 0) > 0 || (logic.stats?.criticalExpiryCount || 0) > 0) && (
            <div 
              onClick={() => router.push('/expiry-alerts')}
              style={{
                background: (logic.stats?.expiredItemsCount || 0) > 0 
                  ? 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)' 
                  : 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
                border: (logic.stats?.expiredItemsCount || 0) > 0 ? '1.5px solid #A8573C' : '1.5px solid #C29B62',
                borderRadius: '16px',
                padding: '14px 22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(30, 19, 11, 0.05)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: (logic.stats?.expiredItemsCount || 0) > 0 ? '#fee2e2' : '#fde68a',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
                }}>
                  {(logic.stats?.expiredItemsCount || 0) > 0 ? '⛔' : '⏳'}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '14.5px', color: (logic.stats?.expiredItemsCount || 0) > 0 ? '#991b1b' : '#92400e' }}>
                    {(logic.stats?.expiredItemsCount || 0) > 0 
                      ? `تنبيه رقابي حاسم: يوجد ${logic.stats?.expiredItemsCount} دواء بيطري منتهي الصلاحية في المستودعات!`
                      : `إنذار استباقي: يوجد ${logic.stats?.criticalExpiryCount} صنف دوائي قارب على انتهاء فترة الصلاحية!`
                    }
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 700, marginTop: '2px' }}>
                    انقر هنا لفتح شاشة مراقبة الصلاحيات وجدولة الإتلافات أو عروض التصفية البيطرية.
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-[#1E130B] hover:bg-[#2C1A12] border border-[#C29B62]/30 cursor-pointer"
              >
                فحص الصلاحيات ⏳
              </button>
            </div>
          )}

          {/* تبويبات الفلترة السريعة للمؤشرات */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '12px' }}>
            <button 
              type="button" 
              onClick={() => setActiveTab('all')} 
              className={`dashboard-tab ${activeTab === 'all' ? 'active' : ''}`}
            >
              👑 الرؤية التنفيذية الشاملة
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab('profitability')} 
              className={`dashboard-tab ${activeTab === 'profitability' ? 'active' : ''}`}
            >
              💰 ربحية الصيدلية والمبيعات
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab('fleet')} 
              className={`dashboard-tab ${activeTab === 'fleet' ? 'active' : ''}`}
            >
              🚚 كفاءة وأداء أسطول التوزيع
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab('liquidity')} 
              className={`dashboard-tab ${activeTab === 'liquidity' ? 'active' : ''}`}
            >
              🏦 السيولة والذمم والمخزون
            </button>
          </div>

          {/* ========== 3. بطاقات ربحية الصيدلية والمركز المالي ========== */}
          {(activeTab === 'all' || activeTab === 'profitability') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="section-royal-title">📊 تحليل ربحية الصيدلية والمبيعات</h3>
                <span className="badge-live">تحديث فوري 🟢</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                {/* 1. إجمالي الإيرادات */}
                <div className="royal-stat-card" style={{ borderBottom: '4px solid #059669' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-emerald-50 text-emerald-700">💰</span>
                    <span className="stat-tag tag-green">المبيعات المعتمدة</span>
                  </div>
                  <div className="stat-number text-emerald-700">
                    {logic.formatCurrency(logic.stats?.totalRevenues || 0)}
                  </div>
                  <div className="stat-footnote">إجمالي الفواتير الصادرة والمرحلة</div>
                </div>

                {/* 2. مجمل الربح وهامشه */}
                <div className="royal-stat-card" style={{ borderBottom: '4px solid #C29B62' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-amber-50 text-[#C29B62]">📈</span>
                    <span className="stat-tag tag-gold">مجمل الربح ({logic.stats?.grossMargin || 0}%)</span>
                  </div>
                  <div className="stat-number text-[#1E130B]">
                    {logic.formatCurrency(logic.stats?.grossProfit || 0)}
                  </div>
                  <div className="stat-footnote">الإيرادات بعد خصم تكلفة الأدوية المباعة</div>
                </div>

                {/* 3. المصروفات التشغيلية */}
                <div className="royal-stat-card" style={{ borderBottom: '4px solid #A8573C' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-rose-50 text-[#A8573C]">📉</span>
                    <span className="stat-tag tag-red">المصروفات التشغيلية</span>
                  </div>
                  <div className="stat-number text-[#A8573C]">
                    {logic.formatCurrency(logic.stats?.totalExpenses || 0)}
                  </div>
                  <div className="stat-footnote">رواتب، إيجارات، وفواتير تشغيلية</div>
                </div>

                {/* 4. صافي الربح التشغيلي */}
                <div className="royal-stat-card highlight-card" style={{ borderBottom: '4px solid #1E130B' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-[#1E130B] text-white">🏆</span>
                    <span className="stat-tag tag-royal">صافي الربح ({logic.stats?.netProfitMargin || 0}%)</span>
                  </div>
                  <div className={`stat-number ${(logic.stats?.netProfit || 0) >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                    {logic.formatCurrency(logic.stats?.netProfit || 0)}
                  </div>
                  <div className="stat-footnote">الربح الصافي النهائي للمؤسسة</div>
                </div>
              </div>
            </div>
          )}

          {/* ========== 4. أداء واقتصاديات أسطول التوزيع ========== */}
          {(activeTab === 'all' || activeTab === 'fleet') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="section-royal-title">🚚 أداء واقتصاديات أسطول التوزيع والمناديب</h3>
                <span className="text-xs text-[#786b59] font-bold">Van Sales & Logistics</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px'
              }}>
                <div className="royal-stat-card cursor-pointer" onClick={() => router.push('/fleet')}>
                  <div className="stat-head">
                    <span className="stat-icon bg-stone-100 text-[#1E130B]">🚐</span>
                    <span className="stat-tag tag-neutral">المركبات</span>
                  </div>
                  <div className="stat-number">{logic.stats?.totalVehicles || 0}</div>
                  <div className="stat-footnote">مركبة مجهزة ومسجلة بالنظام</div>
                </div>

                <div className="royal-stat-card cursor-pointer" onClick={() => router.push('/fleet_operations')}>
                  <div className="stat-head">
                    <span className="stat-icon bg-emerald-50 text-emerald-700">🔄</span>
                    <span className="stat-tag tag-green">الرحلات النشطة</span>
                  </div>
                  <div className="stat-number text-emerald-700">{logic.stats?.activeTripsCount || 0}</div>
                  <div className="stat-footnote">رحلة توزيع قيد التنفيذ بالأسواق</div>
                </div>

                <div className="royal-stat-card cursor-pointer" onClick={() => router.push('/fleet_operations')}>
                  <div className="stat-head">
                    <span className="stat-icon bg-amber-50 text-[#C29B62]">📦</span>
                    <span className="stat-tag tag-gold">إجمالي الرحلات</span>
                  </div>
                  <div className="stat-number">{logic.stats?.totalFleetTrips || 0}</div>
                  <div className="stat-footnote">أوامر شغل ورحلات توزيع منجزة</div>
                </div>

                <div className="royal-stat-card">
                  <div className="stat-head">
                    <span className="stat-icon bg-rose-50 text-[#A8573C]">⛽</span>
                    <span className="stat-tag tag-red">مصروفات الأسطول</span>
                  </div>
                  <div className="stat-number text-[#A8573C]">
                    {logic.formatCurrency(logic.stats?.fleetExpenses || 0)}
                  </div>
                  <div className="stat-footnote">وقود، صيانة دورية، وبدلات</div>
                </div>
              </div>
            </div>
          )}

          {/* ========== 5. السيولة والمخزون ورأس المال العامل ========== */}
          {(activeTab === 'all' || activeTab === 'liquidity') && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 className="section-royal-title">🏦 السيولة، ديون السوق، والمخزون</h3>
                <span className="text-xs text-[#786b59] font-bold">Liquidity & Working Capital</span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px'
              }}>
                <div className="royal-stat-card" onClick={() => router.push('/cashflows')} style={{ cursor: 'pointer' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-emerald-50 text-emerald-700">💵</span>
                    <span className="stat-tag tag-green">الرصيد النقدي والبنكي</span>
                  </div>
                  <div className="stat-number text-emerald-700">
                    {logic.formatCurrency(logic.stats?.cashAndBankBalance || 0)}
                  </div>
                  <div className="stat-footnote">السيولة المتاحة في الصناديق والحسابات</div>
                </div>

                <div className="royal-stat-card" onClick={() => router.push('/statement')} style={{ cursor: 'pointer' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-amber-50 text-[#C29B62]">🤝</span>
                    <span className="stat-tag tag-gold">ديون العملاء بالسوق</span>
                  </div>
                  <div className="stat-number text-[#1E130B]">
                    {logic.formatCurrency(logic.stats?.totalReceivables || 0)}
                  </div>
                  <div className="stat-footnote">إجمالي الذمم المدينة المستحقة للتحصيل</div>
                </div>

                <div className="royal-stat-card" onClick={() => router.push('/inventory-valuation')} style={{ cursor: 'pointer' }}>
                  <div className="stat-head">
                    <span className="stat-icon bg-stone-100 text-[#1E130B]">📦</span>
                    <span className="stat-tag tag-neutral">قيمة المخزون الدوائي</span>
                  </div>
                  <div className="stat-number">
                    {logic.formatCurrency(logic.stats?.totalInventoryValue || 0)}
                  </div>
                  <div className="stat-footnote">تقييم المخزون في {logic.stats?.totalWarehouses || 0} مستودعات</div>
                </div>
              </div>
            </div>
          )}

          {/* ========== 6. المخططات البيانية التنفيذية ========== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '22px' }}>
            
            {/* تحليل التدفقات */}
            <div className="chart-royal-card">
              <h4 className="chart-royal-title">📈 التدفق المالي (المبيعات vs التكلفة vs المصروفات)</h4>
              <div style={{ width: '100%', height: '280px' }}>
                <ResponsiveContainer>
                  <BarChart data={logic.stats?.cashFlowData || []} margin={{ top: 20, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(194, 155, 98, 0.15)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#1E130B', fontWeight: 800, fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} tick={{ fill: '#786b59', fontSize: 11 }} />
                    <Tooltip 
                      formatter={(val: any) => logic.formatCurrency(Number(val))}
                      contentStyle={{ borderRadius: '12px', border: '1px solid rgba(194,155,98,0.3)', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }} 
                    />
                    <Legend wrapperStyle={{ paddingTop: '8px' }} />
                    <Bar dataKey="income" name="الإيرادات" fill="#059669" radius={[8, 8, 0, 0]} maxBarSize={45} />
                    <Bar dataKey="expense" name="التكاليف والمصروفات" fill="#A8573C" radius={[8, 8, 0, 0]} maxBarSize={45} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* توزيع المصروفات */}
            <div className="chart-royal-card">
              <h4 className="chart-royal-title">🎯 توزيع بنود المصروفات التشغيلية</h4>
              <div style={{ width: '100%', height: '280px' }}>
                {(logic.stats?.expensesByCategory || []).length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={logic.stats?.expensesByCategory || []}
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {(logic.stats?.expensesByCategory || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={ROYAL_PIE_COLORS[index % ROYAL_PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: any) => logic.formatCurrency(Number(value))} 
                        contentStyle={{ borderRadius: '12px', border: '1px solid rgba(194,155,98,0.3)' }} 
                      />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontWeight: 800 }}>
                    لا توجد بيانات مصروفات كافية
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========== 7. المهام الرقابية المعلقة ========== */}
          {(logic.stats?.pendingActions || []).length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 className="section-royal-title">⚠️ مستندات بانتظار الاعتماد والترحيل الدفتري</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                {(logic.stats?.pendingActions || []).map((action: any, idx: number) => (
                  <div 
                    key={idx} 
                    className="pending-royal-card" 
                    onClick={() => router.push(`/${action.type}`)}
                  >
                    <div style={{ fontSize: '26px' }}>📝</div>
                    <div>
                      <div style={{ fontSize: '20px', fontWeight: 900, color: '#A8573C', fontFamily: 'monospace' }}>
                        {action.count}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>
                        {action.label || `${action.type} غير مرحلة`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      <style>{`
        .dashboard-tab {
          padding: 8px 16px; border-radius: 12px; font-size: 13px; font-weight: 800;
          color: #786b59; background: #FFFFFF; border: 1px solid rgba(194, 155, 98, 0.25);
          cursor: pointer; transition: 0.2s;
        }
        .dashboard-tab:hover { background: #FDFBF7; }
        .dashboard-tab.active {
          background: #1E130B; color: #FFFFFF; border-color: #1E130B;
        }
        .section-royal-title {
          font-size: 16px; font-weight: 900; color: #1E130B; margin: 0;
        }
        .badge-live {
          font-size: 11.5px; font-weight: 800; color: #059669; background: #ecfdf5;
          padding: 4px 12px; border-radius: 20px; border: 1px solid #a7f3d0;
        }
        .royal-stat-card {
          background: #FFFFFF; border-radius: 16px; padding: 20px;
          border: 1px solid rgba(194, 155, 98, 0.25);
          box-shadow: 0 4px 16px rgba(30, 19, 11, 0.04);
          display: flex; flex-direction: column; justify-content: space-between;
          transition: 0.2s;
        }
        .royal-stat-card:hover { transform: translateY(-2px); }
        .highlight-card {
          background: linear-gradient(135deg, #FFFFFF 0%, #FDFBF7 100%);
          border: 1.5px solid #C29B62;
        }
        .stat-head {
          display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
        }
        .stat-icon {
          width: 36px; height: 36px; border-radius: 10px; display: flex;
          align-items: center; justify-content: center; font-size: 18px;
        }
        .stat-tag {
          font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;
        }
        .tag-green { background: #ecfdf5; color: #059669; }
        .tag-gold { background: #fef3c7; color: #92400e; }
        .tag-red { background: #fef2f2; color: #A8573C; }
        .tag-royal { background: #1E130B; color: #FFFFFF; }
        .tag-neutral { background: #f3f4f6; color: #374151; }
        .stat-number {
          font-size: 24px; font-weight: 900; font-family: monospace; margin-bottom: 4px;
        }
        .stat-footnote {
          font-size: 11px; font-weight: 700; color: #9ca3af;
        }
        .chart-royal-card {
          background: #FFFFFF; border-radius: 18px; padding: 20px;
          border: 1px solid rgba(194, 155, 98, 0.25);
          box-shadow: 0 4px 20px rgba(30, 19, 11, 0.05);
        }
        .chart-royal-title {
          font-size: 14px; font-weight: 900; color: #1E130B; margin: 0 0 16px 0;
        }
        .pending-royal-card {
          background: #FFFFFF; border-radius: 14px; padding: 16px 18px;
          border: 1px solid rgba(194, 155, 98, 0.25);
          box-shadow: 0 2px 10px rgba(30, 19, 11, 0.04);
          display: flex; align-items: center; gap: 14px; cursor: pointer;
          transition: 0.2s;
        }
        .pending-royal-card:hover { transform: translateY(-2px); border-color: #C29B62; }
      `}</style>
    </MasterPage>
  );
}
