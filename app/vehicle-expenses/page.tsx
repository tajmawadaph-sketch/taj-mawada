"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { useVehicleExpensesLogic } from './vehicle_expenses_logic';
import Link from 'next/link';

export default function VehicleExpensesPage() {
    const {
        filteredData,
        globalSearch,
        setGlobalSearch,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        exportToExcel,
        totals,
        isLoading
    } = useVehicleExpensesLogic();

    return (
        <MasterPage
            title="مصفوفة مصروفات السيارات ومراكز التكلفة"
            subtitle="تحليل وتتبع تكاليف المحروقات والصيانة والتشغيل لكل شاحنة وفان في أسطول التوزيع"
            icon="⛽"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl', minHeight: '100vh', paddingBottom: '40px' }}>
                
                {/* Print Styles */}
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white !important; color: #1E130B !important; }
                        table { width: 100% !important; border-collapse: collapse !important; }
                        th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
                    }
                    @media (max-width: 768px) {
                        .ve-kpi-grid { grid-template-columns: 1fr !important; }
                        .ve-filter-row { flex-direction: column !important; }
                    }
                `}</style>

                <PrintHeader title="تقرير مصروفات أسطول السيارات ومراكز التكلفة" subtitle={`عن الفترة من ${dateFrom || 'البداية'} إلى ${dateTo || 'اليوم'}`} />

                {/* 1. Header Toolbar */}
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
                        <input
                            type="text"
                            placeholder="ابحث برقم اللوحة أو الموديل..."
                            value={globalSearch}
                            onChange={(e) => setGlobalSearch(e.target.value)}
                            style={{
                                padding: '10px 16px',
                                borderRadius: '12px',
                                border: '1px solid rgba(194, 155, 98, 0.3)',
                                background: '#FDFBF7',
                                color: '#1E130B',
                                fontWeight: 700,
                                fontSize: '13px',
                                width: '220px',
                                minHeight: '44px',
                                outline: 'none'
                            }}
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>من:</span>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
                            />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إلى:</span>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                style={{ padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(194, 155, 98, 0.3)', background: '#FDFBF7', color: '#1E130B', fontWeight: 700, fontSize: '13px', minHeight: '40px' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Link
                            href="/fixed-assets"
                            style={{
                                background: '#FDFBF7',
                                color: '#8c6b32',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                padding: '10px 16px',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '13px',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                minHeight: '44px'
                            }}
                        >
                            <span>سجل الأصول والإهلاك</span>
                            <span>🏗️</span>
                        </Link>
                        <button
                            onClick={() => window.print()}
                            style={{
                                background: '#FDFBF7',
                                color: '#1E130B',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                padding: '10px 16px',
                                borderRadius: '12px',
                                fontWeight: 800,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
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
                                padding: '10px 20px',
                                borderRadius: '12px',
                                fontWeight: 900,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.25)',
                                minHeight: '44px'
                            }}
                        >
                            <span>تصدير Excel</span>
                            <span>📊</span>
                        </button>
                    </div>
                </div>

                {/* 2. Top Luxury KPI Cards Grid */}
                <div className="ve-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '14px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        border: '1.5px solid rgba(5, 150, 105, 0.3)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>إجمالي الديزل / المحروقات</span>
                            <span style={{ fontSize: '18px' }}>⛽</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '6px' }}>
                            {formatCurrency(totals.totalDiesel)}
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        border: '1.5px solid rgba(194, 155, 98, 0.35)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>إجمالي مصاريف الصيانة</span>
                            <span style={{ fontSize: '18px' }}>🔧</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '6px' }}>
                            {formatCurrency(totals.totalMaintenance)}
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>مصاريف أخرى ورحلات</span>
                            <span style={{ fontSize: '18px' }}>📦</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#6e5d4f', marginTop: '6px' }}>
                            {formatCurrency(totals.totalOther + totals.totalTrips)}
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        border: '1.5px solid rgba(168, 87, 60, 0.3)',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        boxShadow: '0 4px 20px rgba(168, 87, 60, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 900, color: '#A8573C' }}>الإجمالي الكلي لمصروفات الأسطول</span>
                            <span style={{ fontSize: '18px' }}>💰</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#A8573C', marginTop: '6px' }}>
                            {formatCurrency(totals.grandTotal)}
                        </div>
                    </div>
                </div>

                {/* 3. Table */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    borderRadius: '20px',
                    padding: '24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                }}>
                    <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid rgba(194, 155, 98, 0.2)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                            <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>رقم اللوحة</th>
                                    <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900 }}>الموديل والنوع</th>
                                    <th style={{ padding: '12px 14px', color: '#1E130B', fontWeight: 900, textAlign: 'center' }}>عدد الرحلات</th>
                                    <th style={{ padding: '12px 14px', color: '#059669', fontWeight: 900 }}>تكلفة الديزل</th>
                                    <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>تكلفة الصيانة</th>
                                    <th style={{ padding: '12px 14px', color: '#6e5d4f', fontWeight: 900 }}>مصاريف أخرى</th>
                                    <th style={{ padding: '12px 14px', color: '#A8573C', fontWeight: 900 }}>إجمالي التكلفة</th>
                                    <th style={{ padding: '12px 14px', color: '#8c6b32', fontWeight: 900 }}>مركز التكلفة</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '30px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                                            لا توجد بيانات مصروفات سيارات مطابقة لمعايير البحث.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredData.map((v, idx) => (
                                        <tr
                                            key={v.id || idx}
                                            style={{
                                                borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                            }}
                                        >
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#1E130B', fontFamily: 'monospace' }}>
                                                {v.plate_number}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#1E130B' }}>
                                                {v.vehicle_model}
                                            </td>
                                            <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 800, color: '#1E130B' }}>
                                                {v.totalTrips} رحلة
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#059669' }}>
                                                {formatCurrency(v.dieselCost)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#8c6b32' }}>
                                                {formatCurrency(v.maintenanceCost)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 800, color: '#6e5d4f' }}>
                                                {formatCurrency(v.otherCost + v.tripExpenses)}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 900, color: '#A8573C', fontSize: '14px' }}>
                                                {formatCurrency(v.totalCost)}
                                            </td>
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{ padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, background: 'rgba(194, 155, 98, 0.12)', color: '#8c6b32' }}>
                                                    CC-FLEET
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </MasterPage>
    );
}
