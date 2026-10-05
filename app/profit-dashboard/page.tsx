"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { useProfitDashboardLogic, ItemProfitRow, DelegateProfitRow } from './profit_logic';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';

const ROYAL_PALETTE = ['#C29B62', '#1E130B', '#059669', '#A8573C', '#8C6239', '#5C4033', '#2C1A12'];

export default function ProfitDashboardPage() {
    const logic = useProfitDashboardLogic();

    return (
        <MasterPage 
            icon="💎" 
            title="لوحة تحليلات الربحية المعمقة" 
            subtitle="التحليل المالي المتقدم لربحية الأصناف، المناديب، ورحلات أسطول التوزيع - ريال سعودي"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
                
                {/* Print Stylesheet */}
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white !important; color: #1E130B !important; }
                        table { width: 100% !important; border-collapse: collapse !important; }
                        th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
                        .print-footer { display: flex !important; justify-content: space-between !important; margin-top: 40px !important; }
                    }
                    @media (max-width: 768px) {
                        .profit-kpi-grid { grid-template-columns: 1fr !important; }
                        .profit-charts-grid { grid-template-columns: 1fr !important; }
                    }
                `}</style>

                <PrintHeader 
                    title="تقرير تحليلات الربحية المعمقة - صيدلية تاج المودة البيطرية" 
                    subtitle={`الفترة من ${logic.dateFrom || 'البداية'} إلى ${logic.dateTo || 'تاريخه'}`} 
                />

                {/* 1. لوحة الفلاتر والأزرار العلوية */}
                <div className="no-print" style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    borderRadius: '20px',
                    padding: '18px 24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {/* فترات سريعة */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => logic.setPeriodPreset('today')} className="profit-chip">اليوم</button>
                            <button type="button" onClick={() => logic.setPeriodPreset('this_month')} className="profit-chip">هذا الشهر</button>
                            <button type="button" onClick={() => logic.setPeriodPreset('this_quarter')} className="profit-chip">الربع الحالي</button>
                            <button type="button" onClick={() => logic.setPeriodPreset('this_year')} className="profit-chip">هذا العام</button>
                            <button type="button" onClick={() => logic.setPeriodPreset('all')} className="profit-chip">كل الفترات</button>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#786b59' }}>من:</span>
                            <input
                                type="date"
                                value={logic.dateFrom}
                                onChange={e => logic.setDateFrom(e.target.value)}
                                className="royal-profit-input"
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#786b59' }}>إلى:</span>
                            <input
                                type="date"
                                value={logic.dateTo}
                                onChange={e => logic.setDateTo(e.target.value)}
                                className="royal-profit-input"
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={logic.refetch}
                            className="btn-royal-action neutral"
                        >
                            <span>تحديث</span>
                            <span>🔄</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => window.print()}
                            className="btn-royal-action neutral"
                        >
                            <span>طباعة التقرير</span>
                            <span>🖨️</span>
                        </button>
                        <button
                            type="button"
                            onClick={logic.exportToExcel}
                            className="btn-royal-action gold"
                        >
                            <span>تصدير Excel للربحية</span>
                            <span>📊</span>
                        </button>
                    </div>
                </div>

                {logic.isLoading ? (
                    <LoadingScreen message="جاري تحليل تكاليف الأدوية واحتساب هوامش الربحية..." />
                ) : (
                    <>
                        {/* 2. بطاقات المؤشرات المالية العليا */}
                        <div className="profit-kpi-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                            gap: '16px'
                        }}>
                            {/* المبيعات */}
                            <div className="profit-stat-card" style={{ borderBottom: '4px solid #059669' }}>
                                <div className="card-top">
                                    <span className="card-icon bg-emerald-50 text-emerald-700">📈</span>
                                    <span className="card-tag tag-green">المبيعات الإجمالية</span>
                                </div>
                                <div className="card-value text-emerald-700">
                                    {formatCurrency(logic.totalRevenue)}
                                </div>
                                <div className="card-hint">
                                    من إجمالي {logic.invoicesCount} فاتورة مبيعات
                                </div>
                            </div>

                            {/* التكلفة */}
                            <div className="profit-stat-card" style={{ borderBottom: '4px solid #A8573C' }}>
                                <div className="card-top">
                                    <span className="card-icon bg-rose-50 text-[#A8573C]">📦</span>
                                    <span className="card-tag tag-red">تكلفة البضاعة (COGS)</span>
                                </div>
                                <div className="card-value text-[#A8573C]">
                                    {formatCurrency(logic.totalCOGS)}
                                </div>
                                <div className="card-hint">
                                    تكلفة شراء الأدوية المصروفة
                                </div>
                            </div>

                            {/* مجمل الربح */}
                            <div className="profit-stat-card" style={{ borderBottom: '4px solid #C29B62' }}>
                                <div className="card-top">
                                    <span className="card-icon bg-amber-50 text-[#C29B62]">💎</span>
                                    <span className="card-tag tag-gold">مجمل الربح ({logic.grossMargin.toFixed(1)}%)</span>
                                </div>
                                <div className="card-value text-[#1E130B]">
                                    {formatCurrency(logic.grossProfit)}
                                </div>
                                <div className="card-hint">
                                    المبيعات ناقص تكلفة البضاعة
                                </div>
                            </div>

                            {/* صافي الربح التشغيلي */}
                            <div className="profit-stat-card highlight-card" style={{ borderBottom: '4px solid #1E130B' }}>
                                <div className="card-top">
                                    <span className="card-icon bg-[#1E130B] text-white">🏆</span>
                                    <span className="card-tag tag-royal">صافي الربح ({logic.netMargin.toFixed(1)}%)</span>
                                </div>
                                <div className={`card-value ${logic.netOperatingProfit >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                                    {formatCurrency(logic.netOperatingProfit)}
                                </div>
                                <div className="card-hint">
                                    بعد خصم {formatCurrency(logic.totalOperatingExpenses)} مصاريف
                                </div>
                            </div>
                        </div>

                        {/* 3. تبويبات استعراض التحليلات */}
                        <div className="no-print" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)', paddingBottom: '12px' }}>
                            <button
                                type="button"
                                onClick={() => logic.setActiveTab('overview')}
                                className={`profit-nav-tab ${logic.activeTab === 'overview' ? 'active' : ''}`}
                            >
                                📊 نظرة عامة ورسوم بيانية
                            </button>
                            <button
                                type="button"
                                onClick={() => logic.setActiveTab('items')}
                                className={`profit-nav-tab ${logic.activeTab === 'items' ? 'active' : ''}`}
                            >
                                💊 أرباح الأصناف الدوائية ({logic.allItemsList.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => logic.setActiveTab('delegates')}
                                className={`profit-nav-tab ${logic.activeTab === 'delegates' ? 'active' : ''}`}
                            >
                                👤 أرباح المناديب ونقاط البيع ({logic.allDelegatesList.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => logic.setActiveTab('fleet')}
                                className={`profit-nav-tab ${logic.activeTab === 'fleet' ? 'active' : ''}`}
                            >
                                🚚 ربحية أسطول التوزيع ({logic.trips.count} رحلة)
                            </button>
                        </div>

                        {/* ========== TAB 1: الرسوم البيانية والنظرة العامة ========== */}
                        {logic.activeTab === 'overview' && (
                            <div className="profit-charts-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '22px' }}>
                                
                                {/* أعلى الأصناف ربحية */}
                                <div className="profit-box">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                            🔥 أعلى 7 أصناف دوائية تحقيقاً للربح
                                        </h3>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#C29B62' }}>Top Profitable Drugs</span>
                                    </div>
                                    <div style={{ height: '300px' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={logic.topItems} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(194, 155, 98, 0.15)" />
                                                <XAxis type="number" hide />
                                                <YAxis 
                                                    dataKey="name" 
                                                    type="category" 
                                                    axisLine={false} 
                                                    tickLine={false} 
                                                    tick={{ fill: '#1E130B', fontWeight: 800, fontSize: 11 }} 
                                                    width={120} 
                                                />
                                                <Tooltip 
                                                    formatter={(val: any) => [formatCurrency(Number(val)), 'الربح المحقق']}
                                                    contentStyle={{ borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)', boxShadow: '0 4px 15px rgba(0,0,0,0.06)' }} 
                                                />
                                                <Bar dataKey="profit" radius={[0, 8, 8, 0]}>
                                                    {logic.topItems.map((_, index) => (
                                                        <Cell key={`bar-${index}`} fill={ROYAL_PALETTE[index % ROYAL_PALETTE.length]} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* أرباح المناديب */}
                                <div className="profit-box">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                            👤 توزيع الأرباح حسب المناديب
                                        </h3>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#C29B62' }}>Sales Reps Share</span>
                                    </div>
                                    <div style={{ height: '300px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <PieChart>
                                                <Pie 
                                                    data={logic.topDelegates} 
                                                    dataKey="profit" 
                                                    nameKey="name" 
                                                    cx="50%" 
                                                    cy="50%" 
                                                    innerRadius={55} 
                                                    outerRadius={95} 
                                                    paddingAngle={4}
                                                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                                                >
                                                    {logic.topDelegates.map((_, index) => (
                                                        <Cell key={`pie-${index}`} fill={ROYAL_PALETTE[index % ROYAL_PALETTE.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip 
                                                    formatter={(val: any) => [formatCurrency(Number(val)), 'الربح المحقق']}
                                                    contentStyle={{ borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.3)' }} 
                                                />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* بطاقة ملخص أسطول التوزيع */}
                                <div className="profit-box" style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                            🚚 مؤشرات ربحية رحلات أسطول التوزيع (Van Sales)
                                        </h3>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>
                                            هامش ربح الرحلات: {logic.trips.marginPct.toFixed(1)}%
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                                        <div className="trip-subcard">
                                            <span className="trip-lbl">عدد الرحلات</span>
                                            <span className="trip-val text-[#1E130B]">{logic.trips.count} رحلة</span>
                                        </div>
                                        <div className="trip-subcard">
                                            <span className="trip-lbl">مبيعات الرحلات</span>
                                            <span className="trip-val text-emerald-700">{formatCurrency(logic.trips.sales)}</span>
                                        </div>
                                        <div className="trip-subcard">
                                            <span className="trip-lbl">مصروفات التشغيل والوقود</span>
                                            <span className="trip-val text-[#A8573C]">{formatCurrency(logic.trips.expenses)}</span>
                                        </div>
                                        <div className="trip-subcard">
                                            <span className="trip-lbl">تكلفة البضاعة المحملة</span>
                                            <span className="trip-val text-[#A8573C]">{formatCurrency(logic.trips.invCost)}</span>
                                        </div>
                                        <div className="trip-subcard highlight">
                                            <span className="trip-lbl">صافي أرباح الرحلات</span>
                                            <span className={`trip-val ${logic.trips.profit >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                                                {formatCurrency(logic.trips.profit)}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                            </div>
                        )}

                        {/* ========== TAB 2: جدول ربحية الأصناف التفصيلي ========== */}
                        {logic.activeTab === 'items' && (
                            <div className="profit-box">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                        📋 القائمة التفصيلية لربحية الأصناف والأدوية البيطرية
                                    </h3>
                                    <span style={{ fontSize: '12px', color: '#786b59', fontWeight: 700 }}>
                                        مرتبة تنازلياً حسب أعلى ربح محقق
                                    </span>
                                </div>
                                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                        <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                            <tr>
                                                <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>#</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>اسم الصنف / الدواء</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>الكمية المباعة</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>إجمالي المبيعات</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>تكلفة البضاعة</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>مجمل الربح</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>هامش الربح %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logic.allItemsList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#786b59', fontWeight: 700 }}>
                                                        لا توجد مبيعات أصناف مسجلة خلال هذه الفترة.
                                                    </td>
                                                </tr>
                                            ) : (
                                                logic.allItemsList.map((it: ItemProfitRow, idx: number) => (
                                                    <tr 
                                                        key={it.id || idx} 
                                                        style={{ 
                                                            borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                                            background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                                        }}
                                                    >
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#8c6b32' }}>{idx + 1}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#1E130B' }}>{it.name}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace' }}>{it.quantity}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formatCurrency(it.revenue)}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#A8573C', fontFamily: 'monospace' }}>{formatCurrency(it.cogs)}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: it.profit >= 0 ? '#059669' : '#A8573C', fontFamily: 'monospace' }}>
                                                            {formatCurrency(it.profit)}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <span style={{
                                                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 900,
                                                                background: it.marginPct >= 20 ? '#ecfdf5' : '#fef3c7',
                                                                color: it.marginPct >= 20 ? '#059669' : '#92400e'
                                                            }}>
                                                                {it.marginPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ========== TAB 3: جدول ربحية المناديب التفصيلي ========== */}
                        {logic.activeTab === 'delegates' && (
                            <div className="profit-box">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                        👥 جدول كفاءة وربحية المناديب ونقاط التوزيع
                                    </h3>
                                    <span style={{ fontSize: '12px', color: '#786b59', fontWeight: 700 }}>
                                        مساهمة كل مندوب في الأرباح
                                    </span>
                                </div>
                                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                        <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                            <tr>
                                                <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>#</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>اسم المندوب / القناة</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>عدد الفواتير</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>حجم المبيعات</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>تكلفة البضاعة</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>الأرباح المحققة</th>
                                                <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>هامش المندوب %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {logic.allDelegatesList.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '30px', textAlign: 'center', color: '#786b59', fontWeight: 700 }}>
                                                        لا توجد حركات مناديب مسجلة للفترة.
                                                    </td>
                                                </tr>
                                            ) : (
                                                logic.allDelegatesList.map((del: DelegateProfitRow, idx: number) => (
                                                    <tr 
                                                        key={del.name || idx} 
                                                        style={{ 
                                                            borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                                            background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                                        }}
                                                    >
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#8c6b32' }}>{idx + 1}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#1E130B' }}>{del.name}</td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace' }}>{del.invoicesCount}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formatCurrency(del.revenue)}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 800, color: '#A8573C', fontFamily: 'monospace' }}>{formatCurrency(del.cogs)}</td>
                                                        <td style={{ padding: '10px 14px', fontWeight: 900, color: del.profit >= 0 ? '#059669' : '#A8573C', fontFamily: 'monospace' }}>
                                                            {formatCurrency(del.profit)}
                                                        </td>
                                                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                            <span style={{
                                                                padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 900,
                                                                background: '#ecfdf5', color: '#059669'
                                                            }}>
                                                                {del.marginPct.toFixed(1)}%
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ========== TAB 4: اقتصاديات أسطول التوزيع ========== */}
                        {logic.activeTab === 'fleet' && (
                            <div className="profit-box">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                        🚚 التفاصيل الاقتصادية لرحلات أسطول التوزيع
                                    </h3>
                                    <span style={{ fontSize: '12px', color: '#786b59', fontWeight: 700 }}>
                                        إجمالي الرحلات المسجلة: {logic.trips.count}
                                    </span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                    <div className="trip-summary-tile">
                                        <div className="tile-title">إجمالي المبيعات المحققة</div>
                                        <div className="tile-value text-emerald-700">{formatCurrency(logic.trips.sales)}</div>
                                        <div className="tile-sub">من فواتير رحلات التوزيع الميدانية</div>
                                    </div>
                                    <div className="trip-summary-tile">
                                        <div className="tile-title">تكلفة الأدوية المباعة</div>
                                        <div className="tile-value text-[#A8573C]">{formatCurrency(logic.trips.invCost)}</div>
                                        <div className="tile-sub">قيمة الأدوية المنصرفة من المستودع للسيارات</div>
                                    </div>
                                    <div className="trip-summary-tile">
                                        <div className="tile-title">المصروفات التشغيلية للرحلات</div>
                                        <div className="tile-value text-[#A8573C]">{formatCurrency(logic.trips.expenses)}</div>
                                        <div className="tile-sub">وقود، بدلات، صيانة ورسوم</div>
                                    </div>
                                    <div className="trip-summary-tile highlight">
                                        <div className="tile-title">صافي أرباح الأسطول</div>
                                        <div className={`tile-value ${logic.trips.profit >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                                            {formatCurrency(logic.trips.profit)}
                                        </div>
                                        <div className="tile-sub">هامش الربحية: {logic.trips.marginPct.toFixed(1)}%</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* تواقيع الطباعة الرسمية A4 */}
                        <div className="print-footer" style={{ display: 'none', justifyContent: 'space-between', marginTop: '50px', padding: '0 40px', direction: 'rtl' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B', marginBottom: '40px' }}>أعده / مسؤول التحليل المالي</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '160px', margin: '0 auto', paddingTop: '6px', fontSize: '12px', color: '#786b59' }}>التوقيع والتاريخ</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B', marginBottom: '40px' }}>اعتمده / المدير المالي (CFO)</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '160px', margin: '0 auto', paddingTop: '6px', fontSize: '12px', color: '#786b59' }}>الاعتماد الرسمي</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B', marginBottom: '40px' }}>ختم إدارة صيدلية تاج المودة</div>
                                <div style={{ border: '2px dashed #C29B62', width: '100px', height: '60px', margin: '0 auto', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#C29B62' }}>مكان الختم</div>
                            </div>
                        </div>

                    </>
                )}

            </div>

            <style>{`
                .profit-chip {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 800;
                    color: #786b59; cursor: pointer; transition: 0.2s;
                }
                .profit-chip:hover {
                    background: #C29B62; color: #FFFFFF; border-color: #C29B62;
                }
                .royal-profit-input {
                    padding: 8px 12px; border-radius: 10px; border: 1px solid rgba(194, 155, 98, 0.3);
                    background: #FDFBF7; color: #1E130B; font-weight: 700; font-size: 13px;
                    min-height: 40px; outline: none; transition: 0.2s;
                }
                .royal-profit-input:focus {
                    border-color: #C29B62; background: #FFFFFF;
                }
                .btn-royal-action {
                    padding: 10px 18px; border-radius: 12px; font-weight: 800; font-size: 13px;
                    cursor: pointer; display: flex; align-items: center; gap: 6px; min-height: 44px;
                    transition: 0.2s;
                }
                .btn-royal-action.neutral {
                    background: #FDFBF7; color: #1E130B; border: 1px solid rgba(194, 155, 98, 0.35);
                }
                .btn-royal-action.neutral:hover { background: #f5eee3; }
                .btn-royal-action.gold {
                    background: linear-gradient(135deg, #C29B62 0%, #A88348 100%);
                    color: #FFFFFF; border: none; box-shadow: 0 4px 14px rgba(194, 155, 98, 0.25);
                }
                .btn-royal-action.gold:hover { filter: brightness(1.05); }

                .profit-stat-card {
                    background: #FFFFFF; border-radius: 16px; padding: 20px;
                    border: 1px solid rgba(194, 155, 98, 0.25);
                    box-shadow: 0 4px 18px rgba(30, 19, 11, 0.04);
                    display: flex; flex-direction: column; justify-content: space-between;
                    transition: 0.2s;
                }
                .profit-stat-card:hover { transform: translateY(-2px); }
                .profit-stat-card.highlight-card {
                    background: linear-gradient(135deg, #FFFFFF 0%, #FDFBF7 100%);
                    border: 1.5px solid #C29B62;
                }
                .card-top {
                    display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
                }
                .card-icon {
                    width: 38px; height: 38px; border-radius: 10px; display: flex;
                    align-items: center; justify-content: center; font-size: 18px;
                }
                .card-tag {
                    font-size: 11px; font-weight: 800; padding: 3px 8px; border-radius: 6px;
                }
                .tag-green { background: #ecfdf5; color: #059669; }
                .tag-red { background: #fef2f2; color: #A8573C; }
                .tag-gold { background: #fef3c7; color: #92400e; }
                .tag-royal { background: #1E130B; color: #FFFFFF; }
                .card-value {
                    font-size: 24px; font-weight: 900; font-family: monospace; margin-bottom: 4px;
                }
                .card-hint { font-size: 11px; font-weight: 700; color: #786b59; }

                .profit-nav-tab {
                    padding: 8px 16px; border-radius: 12px; font-size: 13px; font-weight: 800;
                    color: #786b59; background: #FFFFFF; border: 1px solid rgba(194, 155, 98, 0.25);
                    cursor: pointer; transition: 0.2s;
                }
                .profit-nav-tab:hover { background: #FDFBF7; }
                .profit-nav-tab.active {
                    background: #1E130B; color: #FFFFFF; border-color: #1E130B;
                }

                .profit-box {
                    background: #FFFFFF; border-radius: 20px; padding: 24px;
                    border: 1px solid rgba(194, 155, 98, 0.25);
                    box-shadow: 0 4px 20px rgba(30, 19, 11, 0.04);
                }
                .trip-subcard {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.2);
                    border-radius: 12px; padding: 14px 16px; text-align: center;
                }
                .trip-subcard.highlight {
                    background: #FFFFFF; border: 1.5px solid #C29B62;
                }
                .trip-lbl { font-size: 11px; color: #786b59; font-weight: 800; display: block; margin-bottom: 4px; }
                .trip-val { font-size: 17px; font-weight: 900; font-family: monospace; display: block; }

                .trip-summary-tile {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.25);
                    border-radius: 14px; padding: 18px; text-align: center;
                }
                .trip-summary-tile.highlight {
                    background: #FFFFFF; border: 2px solid #C29B62;
                }
                .tile-title { font-size: 12px; font-weight: 800; color: #786b59; margin-bottom: 6px; }
                .tile-value { font-size: 22px; font-weight: 900; font-family: monospace; margin-bottom: 4px; }
                .tile-sub { font-size: 11px; font-weight: 700; color: #9ca3af; }
            `}</style>
        </MasterPage>
    );
}
