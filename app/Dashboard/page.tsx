"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { THEME } from '@/lib/theme';
import { useDashboardLogic } from './dashboard_logic';
import DataSyncBanner from '@/components/dashboard/DataSyncBanner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell
} from 'recharts';

const DESERT_COLORS = ['#C29B62', '#A8573C', '#2C1A12', '#4E734F', '#D4AF37', '#8C6239', '#5C4033'];

export default function DashboardPage() {
  const [mounted, setMounted] = useState(false);
  const logic = useDashboardLogic();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const moduleLabels: Record<string, string> = {
    expenses: 'المصروفات العامة',
    invoices: 'فواتير المبيعات',
    payments: 'سندات الصرف',
    receipts: 'سندات القبض'
  };

  return (
    <MasterPage title="لوحة القيادة المركزية" subtitle="مراقبة العمليات والمؤشرات المالية - ريال سعودي">
      
      {logic.isLoading || !logic.stats ? (
        <LoadingScreen message="جاري تحميل لوحة القيادة..." subMessage="نقوم الآن بتجميع البيانات وتحديث المؤشرات..." fullScreen={false} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', animation: 'fadeUp 0.6s ease-out', paddingBottom: '50px' }}>
          
          {/* 📡 شريط تزامن وربط البيانات الحية المربوطة بالسحابة والهارد ديسك */}
          <DataSyncBanner />

          {/* ⏳ إنذار مراقبة تواريخ الصلاحية */}
          {((logic.stats?.expiredItemsCount || 0) > 0 || (logic.stats?.criticalExpiryCount || 0) > 0) && (
            <div 
              onClick={() => router.push('/expiry-alerts')}
              style={{
                background: (logic.stats?.expiredItemsCount || 0) > 0 
                  ? 'linear-gradient(135deg, rgba(254, 226, 226, 0.95) 0%, rgba(254, 242, 242, 0.85) 100%)' 
                  : 'linear-gradient(135deg, rgba(254, 243, 199, 0.95) 0%, rgba(255, 251, 235, 0.85) 100%)',
                border: (logic.stats?.expiredItemsCount || 0) > 0 ? '1.5px solid #ef4444' : '1.5px solid #f59e0b',
                borderRadius: '16px',
                padding: '14px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(44, 26, 18, 0.06)',
                backdropFilter: 'blur(16px)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: (logic.stats?.expiredItemsCount || 0) > 0 ? '#fee2e2' : '#fef3c7',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
                }}>
                  {(logic.stats?.expiredItemsCount || 0) > 0 ? '⛔' : '⏳'}
                </div>
                <div>
                  <div style={{ fontWeight: 900, fontSize: '14px', color: (logic.stats?.expiredItemsCount || 0) > 0 ? '#991b1b' : '#92400e' }}>
                    {(logic.stats?.expiredItemsCount || 0) > 0 
                      ? `تنبيه أمان: يوجد ${logic.stats?.expiredItemsCount} صنف منتهي الصلاحية في المستودعات!`
                      : `إنذار صلاحية: يوجد ${logic.stats?.criticalExpiryCount} صنف قارب على انتهاء الصلاحية!`
                    }
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 700, marginTop: '2px' }}>
                    انقر هنا لفتح شاشة مراقبة الصلاحيات، تحرير تواريخ الانتهاء، أو جدولة الإتلافات والعروض.
                  </div>
                </div>
              </div>
              <button
                type="button"
                style={{
                  background: (logic.stats?.expiredItemsCount || 0) > 0 ? 'linear-gradient(135deg, #dc2626, #b91c1c)' : 'linear-gradient(135deg, #d97706, #b45309)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 16px',
                  fontSize: '12.5px',
                  fontWeight: 900,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span>فحص السلع ⏳</span>
              </button>
            </div>
          )}

          {/* ========== 1. القسم العلوي: المؤشرات المالية الأساسية ========== */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
              <h3 className="section-title">📊 الموقف المالي للمؤسسة</h3>
              <span style={{ fontSize: '12px', fontWeight: 900, color: '#64748b', background: 'rgba(255, 255, 255, 0.4)', padding: '6px 15px', borderRadius: '20px' }}>تحديث فوري 🟢</span>
            </div>
            <div className="premium-grid-3">
              <div className="premium-card" style={{ borderBottom: '4px solid #10b981' }}>
                <div className="card-header-flex">
                  <div className="icon-wrapper" style={{ background: 'linear-gradient(135deg, #10b98120, #05966920)', color: '#10b981' }}>💰</div>
                  <span className="trend-badge positive">إجمالي الإيرادات</span>
                </div>
                <div className="card-value">{logic.formatCurrency(logic.stats?.totalRevenues || 0)}</div>
                <div className="card-subtitle">إجمالي المبالغ من الفواتير المعتمدة</div>
              </div>

              <div className="premium-card" style={{ borderBottom: '4px solid #ef4444' }}>
                <div className="card-header-flex">
                  <div className="icon-wrapper" style={{ background: 'linear-gradient(135deg, #ef444420, #dc262620)', color: '#ef4444' }}>📉</div>
                  <span className="trend-badge negative">إجمالي المصروفات</span>
                </div>
                <div className="card-value">{logic.formatCurrency(logic.stats?.totalExpenses || 0)}</div>
                <div className="card-subtitle">المصروفات التشغيلية المعتمدة</div>
              </div>

              <div className="premium-card" style={{ borderBottom: `4px solid ${THEME.primary}` }}>
                <div className="card-header-flex">
                  <div className="icon-wrapper" style={{ background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.2), rgba(168, 87, 60, 0.2))', color: THEME.primary }}>🏦</div>
                  <span className="trend-badge neutral">الرصيد النقدي والبنكي</span>
                </div>
                <div className="card-value">{logic.formatCurrency(logic.stats?.cashAndBankBalance || 0)}</div>
                <div className="card-subtitle">رصيد الصناديق والبنوك الحالي</div>
              </div>
            </div>
          </div>

          {/* ========== 2. حركة المستودعات والأسطول ========== */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
              <h3 className="section-title">📦 الحركة التشغيلية والمخزون</h3>
            </div>
            <div className="premium-grid-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="premium-card center-content" onClick={() => router.push('/inventory')} style={{ cursor: 'pointer' }}>
                <div className="icon-wrapper lg" style={{ background: '#f8fafc', color: THEME.primary }}>🏭</div>
                <div className="card-value sm">{logic.stats?.totalWarehouses || 0}</div>
                <div className="card-title">مستودع نشط</div>
              </div>

              <div className="premium-card center-content" onClick={() => router.push('/inventory')} style={{ cursor: 'pointer' }}>
                <div className="icon-wrapper lg" style={{ background: '#f8fafc', color: '#f59e0b' }}>📦</div>
                <div className="card-value sm">{(logic.stats?.totalInventoryValue || 0) > 0 ? logic.formatCurrency(logic.stats?.totalInventoryValue || 0) : '0'}</div>
                <div className="card-title">قيمة المخزون الإجمالية</div>
              </div>

              <div className="premium-card center-content" onClick={() => router.push('/expiry-alerts')} style={{ cursor: 'pointer', border: (logic.stats?.expiredItemsCount || 0) > 0 ? '1.5px solid #ef4444' : undefined }}>
                <div className="icon-wrapper lg" style={{ background: (logic.stats?.expiredItemsCount || 0) > 0 ? '#fee2e2' : '#f8fafc', color: (logic.stats?.expiredItemsCount || 0) > 0 ? '#dc2626' : '#C29B62' }}>⏳</div>
                <div className="card-value sm" style={{ color: (logic.stats?.expiredItemsCount || 0) > 0 ? '#dc2626' : '#2C1A12' }}>
                  {(logic.stats?.expiredItemsCount || 0) + (logic.stats?.criticalExpiryCount || 0)}
                </div>
                <div className="card-title">تنبيهات الصلاحية</div>
              </div>

              <div className="premium-card center-content" onClick={() => router.push('/fleet')} style={{ cursor: 'pointer' }}>
                <div className="icon-wrapper lg" style={{ background: '#f8fafc', color: '#8b5cf6' }}>🚚</div>
                <div className="card-value sm">{logic.stats?.totalVehicles || 0}</div>
                <div className="card-title">مركبة مسجلة</div>
              </div>

              <div className="premium-card center-content" onClick={() => router.push('/fleet_operations')} style={{ cursor: 'pointer' }}>
                <div className="icon-wrapper lg" style={{ background: '#f8fafc', color: '#10b981' }}>🔄</div>
                <div className="card-value sm">{logic.stats?.totalFleetTrips || 0}</div>
                <div className="card-title">أمر شغل (رحلة)</div>
              </div>
            </div>
          </div>

          {/* ========== 3. المخططات البيانية ========== */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px' }}>
            
            {/* أداء الإيرادات والمصروفات */}
            <div className="glass-chart-container">
              <h4 className="chart-title">📈 تحليل التدفقات (الإيرادات vs المصروفات)</h4>
              <div style={{ width: '100%', height: '300px' }}>
                <ResponsiveContainer>
                  <BarChart data={logic.stats?.cashFlowData || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.4)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontWeight: 'bold' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${val / 1000}k`} tick={{ fill: '#475569' }} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.2)' }} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar dataKey="income" name="الإيرادات" fill="#10b981" radius={[8, 8, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="expense" name="المصروفات" fill="#ef4444" radius={[8, 8, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* توزيع المصروفات */}
            <div className="glass-chart-container">
              <h4 className="chart-title">🎯 توزيع المصروفات التشغيلية</h4>
              <div style={{ width: '100%', height: '300px' }}>
                {(logic.stats?.expensesByCategory || []).length > 0 ? (
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={logic.stats?.expensesByCategory || []}
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {(logic.stats?.expensesByCategory || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={DESERT_COLORS[index % DESERT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => logic.formatCurrency(value)} contentStyle={{ borderRadius: '15px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                      <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontWeight: 'bold' }}>
                    لا توجد بيانات مصروفات كافية
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ========== 4. مهام معلقة تحتاج مراجعة ========== */}
          {(logic.stats?.pendingActions || []).length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
                <h3 className="section-title">⚠️ مستندات قيد الانتظار (تحتاج مراجعة/ترحيل)</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                {(logic.stats?.pendingActions || []).map((action: any, idx: number) => (
                  <div key={idx} className="warning-card" onClick={() => router.push(`/${action.type}`)} style={{ cursor: 'pointer' }}>
                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>📝</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#b45309' }}>{action.count}</div>
                    <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#92400e' }}>
                      {moduleLabels[action.type] || action.type} غير مرحلة
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

    </MasterPage>
  );
}
