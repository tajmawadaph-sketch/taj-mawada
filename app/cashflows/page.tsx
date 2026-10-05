"use client";
import React, { useMemo, useState } from 'react';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { useCashFlowsLogic } from './cash_flows_logic';
import LoadingScreen from '@/components/LoadingScreen';

export default function CashFlowsPage() {
    const logic = useCashFlowsLogic();
    const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
    const [groupBy, setGroupBy] = useState<'date' | 'partner' | 'none'>('date');

    const toggleGroup = (groupName: string) => {
        if (expandedGroups.includes(groupName)) {
            setExpandedGroups(expandedGroups.filter(g => g !== groupName));
        } else {
            setExpandedGroups([...expandedGroups, groupName]);
        }
    };

    const expandAll = (groupNames: string[]) => {
        setExpandedGroups(groupNames);
    };

    const collapseAll = () => {
        setExpandedGroups([]);
    };

    // Grouping computation
    const groupedData = useMemo(() => {
        if (groupBy === 'none') {
            return [{
                name: 'كافة الحركات المسجلة',
                totalIn: logic.stats.totalIn,
                totalOut: logic.stats.totalOut,
                net: logic.stats.netCash,
                items: logic.filteredData
            }];
        }

        const groups: { [key: string]: { name: string, totalIn: number, totalOut: number, net: number, items: any[] } } = {};

        logic.filteredData.forEach((row: any) => {
            let groupKey = 'حركات عامة';
            if (groupBy === 'date') {
                groupKey = row.transaction_date ? formatDate(row.transaction_date) : 'تاريخ غير محدد';
            } else if (groupBy === 'partner') {
                groupKey = row.partner?.name || 'حركات عامة (بدون شريك محدد)';
            }

            if (!groups[groupKey]) {
                groups[groupKey] = { name: groupKey, totalIn: 0, totalOut: 0, net: 0, items: [] };
            }

            const amt = Math.abs(Number(row.amount) || 0);
            const dir = logic.getFlowDirection(row);

            if (dir === 'inflow') {
                groups[groupKey].totalIn += amt;
            } else {
                groups[groupKey].totalOut += amt;
            }

            groups[groupKey].items.push(row);
        });

        // Compute net
        Object.values(groups).forEach(g => {
            g.net = g.totalIn - g.totalOut;
        });

        return Object.values(groups);
    }, [logic.filteredData, groupBy, logic.stats, logic]);

    const allGroupNames = useMemo(() => groupedData.map(g => g.name), [groupedData]);

    return (
        <MasterPage
            icon="🌊"
            title="كشف مطابقة السيولة وحركة الخزينة اليومية (Daily Cash Flows)"
            subtitle="رصد ومطابقة التدفقات النقدية والبنكية، تسوية حركات الصندوق، وتدقيق مقبوضات ومنصرفات اليومية"
        >
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
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
                        .cf-group-box { break-inside: avoid; border: 1px solid #C29B62 !important; margin-bottom: 15px !important; }
                        .cf-group-items { display: block !important; }
                    }
                    .filter-pill-btn {
                        padding: 8px 16px;
                        border-radius: 50px;
                        font-weight: 800;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        display: inline-flex;
                        align-items: center;
                        gap: 6px;
                        white-space: nowrap;
                    }
                    @media (max-width: 768px) {
                        .cf-kpi-grid { grid-template-columns: 1fr !important; }
                        .cf-toolbar-row { flex-direction: column !important; }
                    }
                `}</style>

                <PrintHeader
                    title="كشف حركة السيولة النقدية والمطابقة اليومية"
                    subtitle={`الفترة: ${logic.dateFrom || 'البداية'} إلى ${logic.dateTo || 'اليوم'}`}
                />

                {/* 1. Header Toolbar */}
                <div className="no-print" style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    padding: '22px 26px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
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
                                🌊
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                                    مطابقة حركة السيولة اليومية
                                </h2>
                                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                                    تتبع النقدية الموردة والمنصرفة عبر الصندوق والبنوك والعهد
                                </p>
                            </div>
                        </div>

                        {/* Export & Print Actions */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={logic.exportToExcel}
                                disabled={logic.filteredData.length === 0}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: '#FFFFFF',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.35)',
                                    minHeight: '44px'
                                }}
                            >
                                <span>تصدير إكسيل</span>
                                <span>📑</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => window.print()}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: '12px',
                                    border: '1.5px solid rgba(194, 155, 98, 0.35)',
                                    background: '#FFFFFF',
                                    color: '#1E130B',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    minHeight: '44px'
                                }}
                            >
                                <span>طباعة الكشف</span>
                                <span>🖨️</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => logic.refetch()}
                                style={{
                                    padding: '10px 16px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(194, 155, 98, 0.25)',
                                    background: '#FDFBF7',
                                    color: '#8c6b32',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    minHeight: '44px'
                                }}
                            >
                                <span>تحديث</span>
                                <span>🔄</span>
                            </button>
                        </div>
                    </div>

                    {/* Filters Toolbar */}
                    <div className="cf-toolbar-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(194, 155, 98, 0.15)'
                    }}>
                        {/* Search Input */}
                        <div style={{ flex: '1 1 240px', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="بحث بالبيان، المرجع، الشريك، أو التصنيف..."
                                value={logic.searchTerm}
                                onChange={(e) => logic.setSearchTerm(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '11px 18px 11px 38px',
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

                        {/* Dates */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="date"
                                value={logic.dateFrom}
                                onChange={(e) => logic.setDateFrom(e.target.value)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#1E130B',
                                    minHeight: '44px'
                                }}
                            />
                            <input
                                type="date"
                                value={logic.dateTo}
                                onChange={(e) => logic.setDateTo(e.target.value)}
                                style={{
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#1E130B',
                                    minHeight: '44px'
                                }}
                            />
                        </div>

                        {/* Direction Filter Tabs */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setFilterType('all')}
                                style={{
                                    background: logic.filterType === 'all' ? '#1E130B' : '#FDFBF7',
                                    color: logic.filterType === 'all' ? '#FDFBF7' : '#1E130B',
                                    border: logic.filterType === 'all' ? '1px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.3)'
                                }}
                            >
                                كافة الحركات
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setFilterType('inflow')}
                                style={{
                                    background: logic.filterType === 'inflow' ? '#059669' : '#FDFBF7',
                                    color: logic.filterType === 'inflow' ? '#FFFFFF' : '#059669',
                                    border: logic.filterType === 'inflow' ? '1px solid #059669' : '1px solid rgba(5, 150, 105, 0.3)'
                                }}
                            >
                                وارد فقط (+)
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setFilterType('outflow')}
                                style={{
                                    background: logic.filterType === 'outflow' ? '#A8573C' : '#FDFBF7',
                                    color: logic.filterType === 'outflow' ? '#FFFFFF' : '#A8573C',
                                    border: logic.filterType === 'outflow' ? '1px solid #A8573C' : '1px solid rgba(168, 87, 60, 0.3)'
                                }}
                            >
                                منصرف فقط (-)
                            </button>
                        </div>

                        {/* Payment Method Filter */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setMethodFilter('all')}
                                style={{
                                    background: logic.methodFilter === 'all' ? '#C29B62' : '#FFFFFF',
                                    color: logic.methodFilter === 'all' ? '#FFFFFF' : '#8c6b32',
                                    border: logic.methodFilter === 'all' ? '1px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)'
                                }}
                            >
                                كاش وبنوك
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setMethodFilter('cash')}
                                style={{
                                    background: logic.methodFilter === 'cash' ? '#C29B62' : '#FFFFFF',
                                    color: logic.methodFilter === 'cash' ? '#FFFFFF' : '#8c6b32',
                                    border: logic.methodFilter === 'cash' ? '1px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)'
                                }}
                            >
                                💵 نقدية الخزينة
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setMethodFilter('bank')}
                                style={{
                                    background: logic.methodFilter === 'bank' ? '#C29B62' : '#FFFFFF',
                                    color: logic.methodFilter === 'bank' ? '#FFFFFF' : '#8c6b32',
                                    border: logic.methodFilter === 'bank' ? '1px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)'
                                }}
                            >
                                🏦 البنوك والشبكة
                            </button>
                        </div>

                        {/* Grouping Options */}
                        <div style={{ display: 'flex', gap: '6px', marginRight: 'auto' }}>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', alignSelf: 'center' }}>تجميع:</span>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setGroupBy('date')}
                                style={{
                                    background: groupBy === 'date' ? '#FDFBF7' : '#FFFFFF',
                                    color: '#1E130B',
                                    border: groupBy === 'date' ? '1.5px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.2)'
                                }}
                            >
                                📅 باليوم
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => setGroupBy('partner')}
                                style={{
                                    background: groupBy === 'partner' ? '#FDFBF7' : '#FFFFFF',
                                    color: '#1E130B',
                                    border: groupBy === 'partner' ? '1.5px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.2)'
                                }}
                            >
                                👤 بالشريك
                            </button>
                        </div>
                    </div>
                </div>

                {/* 2. Luxury KPI Cards */}
                <div className="cf-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px'
                }}>
                    {/* KPI 1: Inflows */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>التدفقات الداخلة (وارد) 📥</span>
                            <span style={{ fontSize: '20px' }}>💰</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.stats.totalIn)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            خزينة: {formatCurrency(logic.stats.cashSafeIn)} | بنك: {formatCurrency(logic.stats.bankIn)}
                        </div>
                    </div>

                    {/* KPI 2: Outflows */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: '#A8573C' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>التدفقات الخارجة (منصرف) 📤</span>
                            <span style={{ fontSize: '20px' }}>💸</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#A8573C', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.stats.totalOut)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            خزينة: {formatCurrency(logic.stats.cashSafeOut)} | بنك: {formatCurrency(logic.stats.bankOut)}
                        </div>
                    </div>

                    {/* KPI 3: Net Cash Flow */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '18px',
                        padding: '20px 22px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: logic.stats.netCash >= 0 ? '#C29B62' : '#A8573C' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: logic.stats.netCash >= 0 ? '#8c6b32' : '#A8573C' }}>صافي حركة السيولة ⚖️</span>
                            <span style={{ fontSize: '20px' }}>📊</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: logic.stats.netCash >= 0 ? '#059669' : '#A8573C', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.stats.netCash)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            {logic.stats.totalTransactions} حركة نقدية وبنكية مسجلة
                        </div>
                    </div>

                    {/* KPI 4: Cash Safe Movement */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>صافي نقدية الصندوق 🏦</span>
                            <span style={{ fontSize: '20px' }}>📦</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.stats.netCashSafe)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            توريد عهد المناديب: <b style={{ color: '#059669' }}>{formatCurrency(logic.stats.delegateCustodyIn)}</b>
                        </div>
                    </div>
                </div>

                {/* 3. Tree / Grouped Movement Cockpit */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>
                        سجل الحركات التفصيلية ({groupedData.length} مجموعة)
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => expandAll(allGroupNames)}
                            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.25)', background: '#FFFFFF', color: '#1E130B', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                        >
                            فتح الكل ▼
                        </button>
                        <button
                            type="button"
                            onClick={collapseAll}
                            style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid rgba(194, 155, 98, 0.25)', background: '#FFFFFF', color: '#1E130B', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                        >
                            طي الكل ▲
                        </button>
                    </div>
                </div>

                {logic.isLoading ? (
                    <LoadingScreen message="جاري جلب ومطابقة حركة السيولة..." fullScreen={false} />
                ) : groupedData.length === 0 ? (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        padding: '60px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontWeight: 800,
                        border: '1px dashed rgba(194, 155, 98, 0.3)'
                    }}>
                        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🌊</div>
                        لا توجد حركات سيولة مطابقة لخيارات البحث
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {groupedData.map((group, gIdx) => {
                            const isExpanded = expandedGroups.includes(group.name);

                            return (
                                <div
                                    key={group.name || gIdx}
                                    className="cf-group-box"
                                    style={{
                                        background: '#FFFFFF',
                                        borderRadius: '18px',
                                        border: '1px solid rgba(194, 155, 98, 0.25)',
                                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    {/* Group Header */}
                                    <div
                                        onClick={() => toggleGroup(group.name)}
                                        style={{
                                            padding: '16px 22px',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            background: isExpanded ? '#FDFBF7' : '#FFFFFF',
                                            borderBottom: isExpanded ? '1px solid rgba(194, 155, 98, 0.2)' : 'none',
                                            flexWrap: 'wrap',
                                            gap: '12px'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '36px',
                                                height: '36px',
                                                borderRadius: '10px',
                                                background: 'rgba(194, 155, 98, 0.15)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#8c6b32',
                                                fontWeight: 900,
                                                fontSize: '14px'
                                            }}>
                                                {groupBy === 'date' ? '📅' : '👤'}
                                            </div>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                                    {group.name}
                                                </h3>
                                                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                                                    {group.items.length} حركة مسجلة
                                                </span>
                                            </div>
                                        </div>

                                        {/* Group Totals */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                            <div style={{ textAlign: 'left' }}>
                                                <span style={{ fontSize: '11px', color: '#059669', fontWeight: 800, display: 'block' }}>
                                                    وارد: +{formatCurrency(group.totalIn)}
                                                </span>
                                                <span style={{ fontSize: '11px', color: '#A8573C', fontWeight: 800, display: 'block' }}>
                                                    منصرف: -{formatCurrency(group.totalOut)}
                                                </span>
                                            </div>
                                            <div style={{
                                                padding: '6px 14px',
                                                borderRadius: '12px',
                                                background: group.net >= 0 ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                                                color: group.net >= 0 ? '#059669' : '#A8573C',
                                                fontWeight: 900,
                                                fontSize: '13px'
                                            }}>
                                                الصافي: {formatCurrency(group.net)}
                                            </div>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '8px',
                                                background: '#FDFBF7',
                                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#8c6b32',
                                                fontSize: '11px',
                                                fontWeight: 900
                                            }}>
                                                {isExpanded ? '▲' : '▼'}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Group Items Table */}
                                    {isExpanded && (
                                        <div className="cf-group-items" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                            <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px', color: '#1E130B' }}>
                                                <thead style={{ background: '#FDFBF7', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                                                    <tr>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900, width: '120px' }}>التاريخ</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900, width: '120px' }}>نوع الحركة</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900, width: '140px' }}>طريقة الدفع</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900 }}>الجهة / الشريك</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900 }}>البيان والتصنيف</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900, width: '130px' }}>الرقم المرجعي</th>
                                                        <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 900, textAlign: 'center', width: '140px' }}>المبلغ</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.items.map((row: any, rIdx: number) => {
                                                        const dir = logic.getFlowDirection(row);
                                                        const isInflow = dir === 'inflow';
                                                        const amt = Math.abs(Number(row.amount) || 0);

                                                        return (
                                                            <tr
                                                                key={row.id || rIdx}
                                                                style={{
                                                                    borderBottom: '1px solid rgba(194, 155, 98, 0.1)',
                                                                    background: rIdx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                                                }}
                                                            >
                                                                <td style={{ padding: '10px 18px', fontWeight: 700, color: '#64748b' }}>
                                                                    {formatDate(row.transaction_date)}
                                                                </td>
                                                                <td style={{ padding: '10px 18px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        padding: '3px 8px',
                                                                        borderRadius: '6px',
                                                                        fontSize: '11px',
                                                                        fontWeight: 900,
                                                                        background: isInflow ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                                                                        color: isInflow ? '#059669' : '#A8573C'
                                                                    }}>
                                                                        {isInflow ? 'وارد (+)' : 'منصرف (-)'}
                                                                    </span>
                                                                </td>
                                                                <td style={{ padding: '10px 18px', fontWeight: 800 }}>
                                                                    {row.payment_method || 'نقدي'}
                                                                </td>
                                                                <td style={{ padding: '10px 18px', fontWeight: 800, color: '#1E130B' }}>
                                                                    {row.partner?.name || '---'}
                                                                </td>
                                                                <td style={{ padding: '10px 18px' }}>
                                                                    <div style={{ fontWeight: 800, color: '#1E130B' }}>{row.category || 'عام'}</div>
                                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{row.description}</div>
                                                                </td>
                                                                <td style={{ padding: '10px 18px', fontWeight: 800, color: '#8c6b32' }}>
                                                                    {row.reference_number || '---'}
                                                                </td>
                                                                <td style={{ padding: '10px 18px', textAlign: 'center', fontWeight: 900, fontSize: '14px', color: isInflow ? '#059669' : '#A8573C' }}>
                                                                    {isInflow ? '+' : '-'}{formatCurrency(amt)}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </MasterPage>
    );
}
