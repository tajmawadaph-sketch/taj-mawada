"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { formatCurrency } from '@/lib/helpers';
import { useSalesAnalysisLogic } from './sales_analysis_logic';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts';
import PrintHeader from '@/components/PrintHeader';

export default function SalesAnalysisPage() {
    const {
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        itemSearch,
        setItemSearch,
        itemSortBy,
        setItemSortBy,
        topClients,
        topDelegates,
        topItems,
        filteredProfitabilityItems,
        totalRevenue,
        totalInvoices,
        averageInvoiceValue,
        totalCOGS,
        grossProfit,
        grossMargin,
        totalOutstanding,
        isLoading,
        exportToExcel
    } = useSalesAnalysisLogic();

    const getMarginBadge = (margin: number) => {
        if (margin >= 30) {
            return {
                bg: 'rgba(5, 150, 105, 0.1)',
                text: '#059669',
                border: 'rgba(5, 150, 105, 0.3)',
                label: 'ممتاز'
            };
        } else if (margin >= 15) {
            return {
                bg: 'rgba(194, 155, 98, 0.15)',
                text: '#8c6b32',
                border: 'rgba(194, 155, 98, 0.4)',
                label: 'جيد'
            };
        } else if (margin >= 0) {
            return {
                bg: 'rgba(217, 119, 6, 0.1)',
                text: '#b45309',
                border: 'rgba(217, 119, 6, 0.3)',
                label: 'منخفض'
            };
        } else {
            return {
                bg: 'rgba(168, 87, 60, 0.12)',
                text: '#A8573C',
                border: 'rgba(168, 87, 60, 0.35)',
                label: 'خسارة'
            };
        }
    };

    return (
        <MasterPage
            title="تحليل المبيعات ومصفوفة ربحية الأصناف"
            subtitle="تحليل متكامل للإيرادات، وهوامش الربح بمتوسط التكلفة WAC، وأداء العملاء والمناديب"
            icon="📊"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '40px' }}>
                
                {/* Print Styles */}
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white !important; color: #1E130B !important; }
                        .sales-table th, .sales-table td { padding: 6px 8px !important; font-size: 11px !important; }
                        .page-content { padding: 0 !important; }
                    }
                    @media (max-width: 768px) {
                        .sales-filter-row { flex-direction: column !important; }
                        .sales-filter-dates { width: 100% !important; flex-direction: column !important; }
                        .sales-kpi-grid { grid-template-columns: 1fr !important; }
                        .sales-chart-grid { grid-template-columns: 1fr !important; }
                    }
                `}</style>

                <PrintHeader title="تقرير تحليل المبيعات وهوامش ربحية الأصناف" subtitle={`الفترة: ${dateFrom || 'البداية'} إلى ${dateTo || 'اليوم'}`} />

                {/* 1. Filter & Actions Toolbar */}
                <div className="no-print" style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    borderRadius: '20px',
                    padding: '20px 24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '16px'
                }}>
                    <div className="sales-filter-dates" style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '6px' }}>من تاريخ:</div>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    outline: 'none',
                                    minHeight: '44px'
                                }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f', marginBottom: '6px' }}>إلى تاريخ:</div>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    fontWeight: 700,
                                    fontSize: '14px',
                                    outline: 'none',
                                    minHeight: '44px'
                                }}
                            />
                        </div>
                        {(dateFrom || dateTo) && (
                            <button
                                onClick={() => { setDateFrom(''); setDateTo(''); }}
                                style={{
                                    marginTop: '22px',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    background: 'rgba(168, 87, 60, 0.1)',
                                    color: '#A8573C',
                                    border: '1px solid rgba(168, 87, 60, 0.25)',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    minHeight: '44px'
                                }}
                            >
                                إعادة تعيين الفترة
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => window.print()}
                            style={{
                                background: '#FDFBF7',
                                color: '#1E130B',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                padding: '10px 18px',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                minHeight: '44px'
                            }}
                        >
                            <span>طباعة التقرير</span>
                            <span>🖨️</span>
                        </button>
                        <button
                            onClick={exportToExcel}
                            style={{
                                background: 'linear-gradient(135deg, #C29B62 0%, #A88348 100%)',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '10px 22px',
                                borderRadius: '12px',
                                fontWeight: 900,
                                fontSize: '14px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.25)',
                                minHeight: '44px'
                            }}
                        >
                            <span>تصدير Excel متكامل</span>
                            <span>📑</span>
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <LoadingScreen message="جاري تحليل مبيعات الفترة وحساب متوسطات التكلفة والأرباح..." />
                ) : (
                    <>
                        {/* 2. Top Luxury KPI Cards Grid */}
                        <div className="sales-kpi-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '14px'
                        }}>
                            {/* Total Revenue */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(194, 155, 98, 0.3)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي المبيعات</span>
                                    <span style={{ fontSize: '18px' }}>💰</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                                    {formatCurrency(totalRevenue)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
                                    {totalInvoices} فاتورة معتمدة
                                </div>
                            </div>

                            {/* Total COGS (WAC) */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.2)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>تكلفة المبيعات (COGS بـ WAC)</span>
                                    <span style={{ fontSize: '18px' }}>📉</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#6e5d4f', marginTop: '8px' }}>
                                    {formatCurrency(totalCOGS)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>
                                    حساب تراكمي بالمتوسط المرجح
                                </div>
                            </div>

                            {/* Gross Profit */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(5, 150, 105, 0.3)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>مجمل الأرباح المحققة</span>
                                    <span style={{ fontSize: '18px' }}>✨</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '8px' }}>
                                    {formatCurrency(grossProfit)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#047857', marginTop: '4px', fontWeight: 700 }}>
                                    صافي الربح قبل المصاريف الإدارية
                                </div>
                            </div>

                            {/* Gross Margin % */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(194, 155, 98, 0.35)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>هامش الربح الإجمالي</span>
                                    <span style={{ fontSize: '18px' }}>📊</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#C29B62', marginTop: '8px' }}>
                                    {grossMargin.toFixed(1)}%
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    متوسط الفاتورة: {formatCurrency(averageInvoiceValue)}
                                </div>
                            </div>

                            {/* Total Outstanding */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(168, 87, 60, 0.25)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>الذمم والمستحقات المتبقية</span>
                                    <span style={{ fontSize: '18px' }}>⏳</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#A8573C', marginTop: '8px' }}>
                                    {formatCurrency(totalOutstanding)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    مبالغ فواتير آجلة قيد التحصيل
                                </div>
                            </div>
                        </div>

                        {/* 3. Analytics Charts Grid */}
                        <div className="no-print sales-chart-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                            gap: '18px'
                        }}>
                            {/* Top Clients Chart */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '20px',
                                padding: '20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(194, 155, 98, 0.15)', paddingBottom: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                        🌟 أفضل العملاء مبيعاً
                                    </h3>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#8c6b32' }}>حسب الإيراد</span>
                                </div>
                                <div style={{ height: '280px', width: '100%' }} dir="ltr">
                                    <ResponsiveContainer>
                                        <BarChart data={topClients} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" horizontal={false} />
                                            <XAxis type="number" tick={{ fill: '#6e5d4f', fontSize: 11 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} />
                                            <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#1E130B', fontSize: 11, fontWeight: 700 }} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(194, 155, 98, 0.08)' }}
                                                contentStyle={{ background: '#FFFFFF', border: '1px solid #C29B62', borderRadius: '12px', color: '#1E130B', textAlign: 'right', fontWeight: 700 }}
                                                formatter={(val: any) => [formatCurrency(Number(val) || 0), 'إجمالي المشتريات']}
                                            />
                                            <Bar dataKey="total" radius={[0, 6, 6, 0]}>
                                                {topClients.map((_, index) => (
                                                    <Cell key={`client-${index}`} fill={index === 0 ? '#C29B62' : 'rgba(194, 155, 98, 0.65)'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top Delegates Chart */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '20px',
                                padding: '20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(194, 155, 98, 0.15)', paddingBottom: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                        🚚 أداء المناديب ومسؤولي التوزيع
                                    </h3>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>حسب الإيراد</span>
                                </div>
                                <div style={{ height: '280px', width: '100%' }} dir="ltr">
                                    <ResponsiveContainer>
                                        <BarChart data={topDelegates} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fill: '#1E130B', fontSize: 11, fontWeight: 700 }} />
                                            <YAxis type="number" tick={{ fill: '#6e5d4f', fontSize: 11 }} tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`} width={50} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(5, 150, 105, 0.08)' }}
                                                contentStyle={{ background: '#FFFFFF', border: '1px solid #059669', borderRadius: '12px', color: '#1E130B', textAlign: 'right', fontWeight: 700 }}
                                                formatter={(val: any) => [formatCurrency(Number(val) || 0), 'إجمالي المبيعات']}
                                            />
                                            <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                                                {topDelegates.map((_, index) => (
                                                    <Cell key={`del-${index}`} fill={index === 0 ? '#059669' : 'rgba(5, 150, 105, 0.65)'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Top Items by Quantity */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '20px',
                                padding: '20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(194, 155, 98, 0.15)', paddingBottom: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                        📦 أعلى 10 أصناف حركةً بالكمية
                                    </h3>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#8c6b32' }}>بالوحدات</span>
                                </div>
                                <div style={{ height: '280px', width: '100%' }} dir="ltr">
                                    <ResponsiveContainer>
                                        <BarChart data={topItems} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f1efe9" vertical={false} />
                                            <XAxis dataKey="name" tick={{ fill: '#1E130B', fontSize: 10, fontWeight: 700 }} />
                                            <YAxis type="number" tick={{ fill: '#6e5d4f', fontSize: 11 }} width={45} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(194, 155, 98, 0.08)' }}
                                                contentStyle={{ background: '#FFFFFF', border: '1px solid #C29B62', borderRadius: '12px', color: '#1E130B', textAlign: 'right', fontWeight: 700 }}
                                                formatter={(val: any) => [`${val} وحدة`, 'الكمية المباعة']}
                                            />
                                            <Bar dataKey="qty" radius={[6, 6, 0, 0]}>
                                                {topItems.map((_, index) => (
                                                    <Cell key={`item-${index}`} fill={index === 0 ? '#1E130B' : 'rgba(30, 19, 11, 0.65)'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* 4. Complete Item Profitability Matrix Table */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid rgba(194, 155, 98, 0.25)',
                            borderRadius: '20px',
                            padding: '24px',
                            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                        }}>
                            {/* Table Header & Controls */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                                <div>
                                    <h2 style={{ margin: '0 0 6px 0', fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                                        💊 مصفوفة ربحية وهوامش الأصناف الدوائية
                                    </h2>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#6e5d4f', fontWeight: 600 }}>
                                        مقارنة دقيقة بين إيرادات المبيعات وتكلفة الوحدة المرجحة (WAC) لحساب صافي الربحية الحقيقية.
                                    </p>
                                </div>

                                <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                    {/* Search Box */}
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="text"
                                            placeholder="بحث باسم الدواء أو الكود..."
                                            value={itemSearch}
                                            onChange={(e) => setItemSearch(e.target.value)}
                                            style={{
                                                padding: '10px 16px',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(194, 155, 98, 0.3)',
                                                background: '#FDFBF7',
                                                color: '#1E130B',
                                                fontWeight: 700,
                                                fontSize: '13px',
                                                width: '240px',
                                                outline: 'none',
                                                minHeight: '44px'
                                            }}
                                        />
                                        {itemSearch && (
                                            <button
                                                onClick={() => setItemSearch('')}
                                                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    {/* Sorting Options */}
                                    <div style={{ display: 'flex', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', borderRadius: '12px', padding: '3px' }}>
                                        <button
                                            onClick={() => setItemSortBy('revenue')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                background: itemSortBy === 'revenue' ? '#C29B62' : 'transparent',
                                                color: itemSortBy === 'revenue' ? '#FFFFFF' : '#6e5d4f',
                                                fontWeight: 800,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                minHeight: '38px'
                                            }}
                                        >
                                            الأعلى إيراداً
                                        </button>
                                        <button
                                            onClick={() => setItemSortBy('profit')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                background: itemSortBy === 'profit' ? '#059669' : 'transparent',
                                                color: itemSortBy === 'profit' ? '#FFFFFF' : '#6e5d4f',
                                                fontWeight: 800,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                minHeight: '38px'
                                            }}
                                        >
                                            الأعلى ربحاً
                                        </button>
                                        <button
                                            onClick={() => setItemSortBy('margin')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                background: itemSortBy === 'margin' ? '#8c6b32' : 'transparent',
                                                color: itemSortBy === 'margin' ? '#FFFFFF' : '#6e5d4f',
                                                fontWeight: 800,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                minHeight: '38px'
                                            }}
                                        >
                                            هامش الربح %
                                        </button>
                                        <button
                                            onClick={() => setItemSortBy('qty')}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '9px',
                                                border: 'none',
                                                background: itemSortBy === 'qty' ? '#1E130B' : 'transparent',
                                                color: itemSortBy === 'qty' ? '#FFFFFF' : '#6e5d4f',
                                                fontWeight: 800,
                                                fontSize: '12px',
                                                cursor: 'pointer',
                                                minHeight: '38px'
                                            }}
                                        >
                                            الأكثر كمية
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Responsive Table */}
                            <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                                <table className="sales-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                    <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                        <tr>
                                            <th style={{ padding: '14px 16px', color: '#8c6b32', fontWeight: 900 }}>#</th>
                                            <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>الصنف الدوائي</th>
                                            <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>الكود</th>
                                            <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>الكمية المباعة</th>
                                            <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>متوسط سعر البيع</th>
                                            <th style={{ padding: '14px 16px', color: '#6e5d4f', fontWeight: 900 }}>تكلفة WAC</th>
                                            <th style={{ padding: '14px 16px', color: '#1E130B', fontWeight: 900 }}>إجمالي الإيراد</th>
                                            <th style={{ padding: '14px 16px', color: '#6e5d4f', fontWeight: 900 }}>تكلفة المبيعات (COGS)</th>
                                            <th style={{ padding: '14px 16px', color: '#059669', fontWeight: 900 }}>مجمل الربح</th>
                                            <th style={{ padding: '14px 16px', color: '#8c6b32', fontWeight: 900, textAlign: 'center' }}>هامش الربح %</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredProfitabilityItems.length === 0 ? (
                                            <tr>
                                                <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                                                    لا توجد بيانات مبيعات مطابقة لمعايير البحث في الفترة المحددة.
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredProfitabilityItems.map((item, idx) => {
                                                const badge = getMarginBadge(item.marginPct);
                                                return (
                                                    <tr
                                                        key={item.id || idx}
                                                        style={{
                                                            borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                                            background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                                        }}
                                                    >
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#8c6b32' }}>{idx + 1}</td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#1E130B' }}>
                                                            {item.name}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', color: '#6e5d4f', fontWeight: 700, fontFamily: 'monospace' }}>
                                                            {item.code || '-'}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: '#1E130B' }}>
                                                            {item.qty} <span style={{ fontSize: '11px', color: '#6e5d4f', fontWeight: 600 }}>{item.unit}</span>
                                                        </td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1E130B' }}>
                                                            {formatCurrency(item.avgSellingPrice)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#6e5d4f' }}>
                                                            {formatCurrency(item.wacUnitCost)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: '#1E130B' }}>
                                                            {formatCurrency(item.revenue)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#6e5d4f' }}>
                                                            {formatCurrency(item.cogs)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: item.profit >= 0 ? '#059669' : '#A8573C' }}>
                                                            {formatCurrency(item.profit)}
                                                        </td>
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '12px',
                                                                fontWeight: 900,
                                                                background: badge.bg,
                                                                color: badge.text,
                                                                border: `1px solid ${badge.border}`
                                                            }}>
                                                                {item.marginPct.toFixed(1)}% ({badge.label})
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </MasterPage>
    );
}
