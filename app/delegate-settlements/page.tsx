"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { useDelegateSettlementsLogic } from './delegate_settlements_logic';
import SettlementActionModal from './SettlementActionModal';
import SettlementPrintModal from './SettlementPrintModal';

export default function DelegateSettlementsPage() {
    const {
        filteredSettlements,
        globalSearch,
        setGlobalSearch,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        statusFilter,
        setStatusFilter,
        totals,
        isLoading,
        exportToExcel,
        // Supporting data
        inventoryItems,
        accounts,
        warehouses,
        // Modals
        selectedTripForSettlement,
        setSelectedTripForSettlement,
        isSettlementModalOpen,
        setIsSettlementModalOpen,
        selectedTripForPrint,
        setSelectedTripForPrint,
        isPrintModalOpen,
        setIsPrintModalOpen,
        // Mutations
        executeSettlement,
        isSettling
    } = useDelegateSettlementsLogic();

    return (
        <MasterPage
            icon="🚚"
            title="تسوية عهد المناديب وإرجاع المخزون (Van Settlements)"
            subtitle="المطابقة المالية اليومية، توريد النقدية للخزينة، إرجاع فائض البضاعة للمستودع الرئيسي، وتوليد القيود وسندات القبض آلياً"
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '22px',
                direction: 'rtl',
                minHeight: '100vh',
                paddingBottom: '50px'
            }}>
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white !important; color: #1E130B !important; }
                        table { width: 100% !important; border-collapse: collapse !important; }
                        th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
                    }
                    .settle-table-wrapper {
                        overflow-x: auto !important;
                        -webkit-overflow-scrolling: touch !important;
                        width: 100% !important;
                    }
                    .settle-table {
                        width: 100% !important;
                        min-width: 1550px !important;
                        border-collapse: collapse !important;
                    }
                    .settle-table th, .settle-table td {
                        white-space: nowrap !important;
                        word-break: keep-all !important;
                    }
                    .filter-pill-btn {
                        padding: 8px 18px;
                        border-radius: 50px;
                        font-weight: 800;
                        font-size: 13px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                    }
                    @media (max-width: 768px) {
                        .settle-kpi-grid { grid-template-columns: 1fr !important; }
                        .settle-filter-row { flex-direction: column !important; }
                    }
                `}</style>

                <PrintHeader
                    title="تقرير تسوية عهد المناديب والمبيعات الميدانية"
                    subtitle={`تاريخ التقرير: ${new Date().toLocaleDateString('ar-SA')}`}
                />

                {/* Top Control Bar & Filters */}
                <div className="no-print" style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '22px 26px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '18px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '14px',
                                background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFFFFF',
                                fontSize: '24px',
                                boxShadow: '0 4px 14px rgba(194, 155, 98, 0.35)'
                            }}>
                                📦
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                                    مطابقة عهد الأسطول والمناديب
                                </h2>
                                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                                    تسوية النقدية المحصلة ومطابقة مرتجع البضاعة بالسيارات وتوليد القيود
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={exportToExcel}
                                disabled={filteredSettlements.length === 0}
                                style={{
                                    padding: '10px 22px',
                                    borderRadius: '12px',
                                    border: '1.5px solid rgba(194, 155, 98, 0.35)',
                                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: '#FFFFFF',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.3)',
                                    transition: 'all 0.2s',
                                    minHeight: '44px'
                                }}
                            >
                                <span>تصدير إكسيل</span>
                                <span>📑</span>
                            </button>
                        </div>
                    </div>

                    {/* Filters Row */}
                    <div className="settle-filter-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(194, 155, 98, 0.15)'
                    }}>
                        {/* Search Input */}
                        <div style={{ flex: '1 1 280px', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="بحث باسم المندوب، رقم الرحلة، رقم الجوال، أو لوحة السيارة..."
                                value={globalSearch}
                                onChange={(e) => setGlobalSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '11px 18px 11px 40px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#1E130B',
                                    outline: 'none',
                                    minHeight: '44px',
                                    boxSizing: 'border-box'
                                }}
                            />
                            <span style={{ position: 'absolute', left: '14px', top: '12px', fontSize: '16px', color: '#C29B62' }}>🔍</span>
                        </div>

                        {/* Date From */}
                        <div style={{ flex: '0 1 170px' }}>
                            <input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#1E130B',
                                    outline: 'none',
                                    minHeight: '44px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* Date To */}
                        <div style={{ flex: '0 1 170px' }}>
                            <input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px 14px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#1E130B',
                                    outline: 'none',
                                    minHeight: '44px',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* Status Filter Tabs */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '2px' }}>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setStatusFilter('all')}
                                style={{
                                    background: statusFilter === 'all' ? '#1E130B' : '#FDFBF7',
                                    color: statusFilter === 'all' ? '#FDFBF7' : '#1E130B',
                                    border: statusFilter === 'all' ? '1px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.3)'
                                }}
                            >
                                الكل ({totals.totalTrips})
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setStatusFilter('pending')}
                                style={{
                                    background: statusFilter === 'pending' ? '#C29B62' : '#FDFBF7',
                                    color: statusFilter === 'pending' ? '#FFFFFF' : '#8c6b32',
                                    border: statusFilter === 'pending' ? '1px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.3)'
                                }}
                            >
                                ⏳ بانتظار التسوية ({totals.pendingTrips})
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setStatusFilter('settled')}
                                style={{
                                    background: statusFilter === 'settled' ? '#059669' : '#FDFBF7',
                                    color: statusFilter === 'settled' ? '#FFFFFF' : '#059669',
                                    border: statusFilter === 'settled' ? '1px solid #059669' : '1px solid rgba(5, 150, 105, 0.3)'
                                }}
                            >
                                ✅ تمت التسوية ({totals.settledTrips})
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setStatusFilter('shortage')}
                                style={{
                                    background: statusFilter === 'shortage' ? '#A8573C' : '#FDFBF7',
                                    color: statusFilter === 'shortage' ? '#FFFFFF' : '#A8573C',
                                    border: statusFilter === 'shortage' ? '1px solid #A8573C' : '1px solid rgba(168, 87, 60, 0.3)'
                                }}
                            >
                                ⚠️ عهد معلقة
                            </button>
                        </div>
                    </div>
                </div>

                {/* Global KPI Metrics Grid */}
                <div className="settle-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px'
                }}>
                    {/* KPI 1: Active Trips */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#C29B62' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#C29B62' }}>رحلات الأسطول 🚚</span>
                            <span style={{ fontSize: '20px' }}>📦</span>
                        </div>
                        <div style={{ fontSize: '30px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {totals.totalTrips}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            <span style={{ color: '#b45309' }}>{totals.pendingTrips} نشطة</span> | <span style={{ color: '#059669' }}>{totals.settledTrips} مغلقة</span>
                        </div>
                    </div>

                    {/* KPI 2: Total Sales */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#1E130B' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>إجمالي المبيعات 📈</span>
                            <span style={{ fontSize: '20px' }}>💰</span>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {formatCurrency(totals.totalSales)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            كاش: <b style={{ color: '#1E130B' }}>{formatCurrency(totals.cashSales)}</b> | آجل: <b>{formatCurrency(totals.creditSales)}</b>
                        </div>
                    </div>

                    {/* KPI 3: Net Cash Due */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#b45309' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#b45309' }}>المطالبة النقدية للعهد 💵</span>
                            <span style={{ fontSize: '20px' }}>⚖️</span>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#b45309', margin: '8px 0 4px 0' }}>
                            {formatCurrency(totals.totalNetCashDue)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            (مبيعات كاش + تحصيلات) - مصروفات
                        </div>
                    </div>

                    {/* KPI 4: Handed Over Cash */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#059669' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>المورد للخزينة ✅</span>
                            <span style={{ fontSize: '20px' }}>🏦</span>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', margin: '8px 0 4px 0' }}>
                            {formatCurrency(totals.totalHandedOverCash)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            سندات قبض مقيدة بالخزينة
                        </div>
                    </div>

                    {/* KPI 5: Remaining Cash Custody */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: totals.totalRemainingCash > 0 ? '#A8573C' : '#059669' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: totals.totalRemainingCash > 0 ? '#A8573C' : '#059669' }}>العهد المعلقة / العجز ⚠️</span>
                            <span style={{ fontSize: '20px' }}>⏳</span>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: totals.totalRemainingCash > 0 ? '#A8573C' : '#059669', margin: '8px 0 4px 0' }}>
                            {formatCurrency(totals.totalRemainingCash)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            صافي المبالغ بذمة المناديب
                        </div>
                    </div>

                    {/* KPI 6: Remaining Stock in Vehicles */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#C29B62' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#8c6b32' }}>بضائع بانتظار الإرجاع 🔄</span>
                            <span style={{ fontSize: '20px' }}>🚐</span>
                        </div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {totals.totalRemainingItems} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>حبة</span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            متبقية في شاحنات التوزيع
                        </div>
                    </div>
                </div>

                {/* Settlements Table Card */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    overflow: 'hidden'
                }}>
                    {isLoading ? (
                        <div style={{ padding: '80px', textAlign: 'center', color: '#C29B62', fontWeight: 800, fontSize: '16px' }}>
                            <div style={{ fontSize: '40px', marginBottom: '15px' }}>⏳</div>
                            جاري تحميل ومطابقة عهد المناديب والأسطول...
                        </div>
                    ) : (
                        <div className="settle-table-wrapper">
                            <table className="settle-table" style={{ width: '100%', minWidth: '1550px', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px', color: '#1E130B' }}>
                                <thead style={{ background: '#FDFBF7', borderBottom: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                    <tr>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, minWidth: '170px' }}>الرحلة والسيارة 🚚</th>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, minWidth: '130px' }}>التاريخ 📅</th>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, minWidth: '220px' }}>المندوب / السائق 👤</th>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, textAlign: 'center', minWidth: '190px' }}>المبيعات 📦</th>
                                        <th style={{ padding: '16px 20px', color: '#A8573C', fontWeight: 900, textAlign: 'center', minWidth: '140px' }}>المصروفات (-)</th>
                                        <th style={{ padding: '16px 20px', color: '#b45309', fontWeight: 900, textAlign: 'center', minWidth: '160px' }}>المطالبة النقدية 💰</th>
                                        <th style={{ padding: '16px 20px', color: '#059669', fontWeight: 900, textAlign: 'center', minWidth: '160px' }}>المورد للخزينة 💵</th>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, textAlign: 'center', minWidth: '160px' }}>متبقي العهدة ⚠️</th>
                                        <th style={{ padding: '16px 20px', color: '#8c6b32', fontWeight: 900, textAlign: 'center', minWidth: '180px' }}>بضاعة السيارة 🔄</th>
                                        <th style={{ padding: '16px 20px', color: '#1E130B', fontWeight: 900, textAlign: 'center', minWidth: '160px' }}>حالة التسوية</th>
                                        <th className="no-print" style={{ padding: '16px 20px', color: '#C29B62', fontWeight: 900, textAlign: 'center', minWidth: '220px' }}>الإجراءات</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredSettlements.length > 0 ? filteredSettlements.map((item, idx) => {
                                        const isSettled = item.settlementStatus === 'settled';
                                        const isPartial = item.settlementStatus === 'partial';

                                        return (
                                            <tr key={item.id || idx} style={{
                                                borderBottom: '1px solid rgba(194, 155, 98, 0.12)',
                                                transition: 'background 0.2s',
                                                background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                            }}>
                                                {/* Trip & Vehicle */}
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{
                                                        background: 'rgba(194, 155, 98, 0.15)',
                                                        color: '#8c6b32',
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        fontWeight: 900,
                                                        fontSize: '13px'
                                                    }}>
                                                        #{item.operationNumber}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', fontWeight: 700 }}>
                                                        🚗 {item.vehiclePlate}
                                                    </div>
                                                </td>

                                                {/* Date */}
                                                <td style={{ padding: '16px 20px', fontWeight: 700 }}>
                                                    {formatDate(item.date)}
                                                </td>

                                                {/* Delegate Name & Partner ID */}
                                                <td style={{ padding: '16px 20px' }}>
                                                    <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
                                                        {item.driverName}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#8c6b32', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        {item.driverPhone && <span>📞 {item.driverPhone}</span>}
                                                        {item.driverId && (
                                                            <span title={item.driverId} style={{ background: 'rgba(194, 155, 98, 0.1)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                                ID: {item.driverId.slice(0, 6)}..
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Sales */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
                                                        {formatCurrency(item.totalSales)}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                                                        كاش: {formatCurrency(item.cashSales)} | آجل: {formatCurrency(item.creditSales)}
                                                    </div>
                                                </td>

                                                {/* Expenses */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 800, color: '#A8573C' }}>
                                                    {item.totalExpenses > 0 ? formatCurrency(item.totalExpenses) : '---'}
                                                </td>

                                                {/* Net Cash Due */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 900, color: '#b45309', fontSize: '14px' }}>
                                                    {formatCurrency(item.netCashDue)}
                                                </td>

                                                {/* Handed Over Cash */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 900, color: '#059669', fontSize: '14px' }}>
                                                    {formatCurrency(item.handedOverCash)}
                                                </td>

                                                {/* Remaining Cash */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div style={{
                                                        fontWeight: 900,
                                                        fontSize: '14px',
                                                        color: item.remainingCashCustody <= 0 ? '#059669' : '#A8573C'
                                                    }}>
                                                        {item.remainingCashCustody <= 0 ? '0.00 ر.س' : formatCurrency(item.remainingCashCustody)}
                                                    </div>
                                                </td>

                                                {/* Remaining Items */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    {item.totalRemainingQty > 0 ? (
                                                        <span style={{
                                                            background: 'rgba(217, 119, 6, 0.1)',
                                                            color: '#b45309',
                                                            padding: '5px 12px',
                                                            borderRadius: '20px',
                                                            fontWeight: 900,
                                                            fontSize: '12px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}>
                                                            {item.totalRemainingQty} حبة بالسيارة
                                                        </span>
                                                    ) : (
                                                        <span style={{ color: '#059669', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                            تم الإرجاع بالكامل ✔️
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Status Badge */}
                                                <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    {isSettled ? (
                                                        <span style={{
                                                            background: 'rgba(5, 150, 105, 0.1)',
                                                            color: '#059669',
                                                            border: '1px solid rgba(5, 150, 105, 0.3)',
                                                            padding: '6px 14px',
                                                            borderRadius: '50px',
                                                            fontWeight: 900,
                                                            fontSize: '12px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}>
                                                            تمت التسوية ✅
                                                        </span>
                                                    ) : isPartial ? (
                                                        <span style={{
                                                            background: 'rgba(194, 155, 98, 0.15)',
                                                            color: '#8c6b32',
                                                            border: '1px solid rgba(194, 155, 98, 0.35)',
                                                            padding: '6px 14px',
                                                            borderRadius: '50px',
                                                            fontWeight: 900,
                                                            fontSize: '12px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}>
                                                            تسوية جزئية 🔄
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            background: 'rgba(217, 119, 6, 0.1)',
                                                            color: '#b45309',
                                                            border: '1px solid rgba(217, 119, 6, 0.3)',
                                                            padding: '6px 14px',
                                                            borderRadius: '50px',
                                                            fontWeight: 900,
                                                            fontSize: '12px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px'
                                                        }}>
                                                            بانتظار التسوية ⏳
                                                        </span>
                                                    )}
                                                </td>

                                                {/* Actions */}
                                                <td className="no-print" style={{ padding: '16px 20px', textAlign: 'center' }}>
                                                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                                                        {/* Settle button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedTripForSettlement(item);
                                                                setIsSettlementModalOpen(true);
                                                            }}
                                                            style={{
                                                                padding: '8px 14px',
                                                                borderRadius: '10px',
                                                                border: 'none',
                                                                background: isSettled ? 'rgba(194, 155, 98, 0.15)' : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                                                color: isSettled ? '#8c6b32' : '#FFFFFF',
                                                                fontWeight: 800,
                                                                fontSize: '12px',
                                                                cursor: 'pointer',
                                                                boxShadow: isSettled ? 'none' : '0 2px 10px rgba(194, 155, 98, 0.3)',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                transition: 'all 0.2s',
                                                                minHeight: '38px'
                                                            }}
                                                            title="تسوية العهدة النقدية وإرجاع البضاعة"
                                                        >
                                                            <span>{isSettled ? 'تعديل التسوية' : '🤝 تسوية العهدة'}</span>
                                                        </button>

                                                        {/* Print clearance button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedTripForPrint(item);
                                                                setIsPrintModalOpen(true);
                                                            }}
                                                            style={{
                                                                padding: '8px 14px',
                                                                borderRadius: '10px',
                                                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                                                background: '#FFFFFF',
                                                                color: '#1E130B',
                                                                fontWeight: 800,
                                                                fontSize: '12px',
                                                                cursor: 'pointer',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '5px',
                                                                transition: 'all 0.2s',
                                                                minHeight: '38px'
                                                            }}
                                                            title="طباعة سند تسوية ومخالصة عهدة رسمية"
                                                        >
                                                            <span>🖨️ طباعة</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={11} style={{ padding: '80px 20px', textAlign: 'center', color: '#64748b' }}>
                                                <div style={{ fontSize: '48px', marginBottom: '12px' }}>🚐</div>
                                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                                                    لا توجد رحلات أو عهد مطابقة لخيارات البحث المحددة
                                                </div>
                                                <p style={{ fontSize: '13px', color: '#64748b', marginTop: '6px' }}>
                                                    جرب تغيير فترة التاريخ أو مسح شريط البحث لعرض كافة الرحلات.
                                                </p>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Settlement Action Modal */}
                <SettlementActionModal
                    isOpen={isSettlementModalOpen}
                    onClose={() => {
                        setIsSettlementModalOpen(false);
                        setSelectedTripForSettlement(null);
                    }}
                    trip={selectedTripForSettlement}
                    inventoryItems={inventoryItems}
                    accounts={accounts}
                    warehouses={warehouses}
                    onExecuteSettlement={executeSettlement}
                    isSubmitting={isSettling}
                />

                {/* Official Print Modal */}
                <SettlementPrintModal
                    isOpen={isPrintModalOpen}
                    onClose={() => {
                        setIsPrintModalOpen(false);
                        setSelectedTripForPrint(null);
                    }}
                    trip={selectedTripForPrint}
                />
            </div>
        </MasterPage>
    );
}
