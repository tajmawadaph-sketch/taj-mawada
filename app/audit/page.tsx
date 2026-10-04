"use client";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import MasterPage from '@/components/MasterPage';
import { useAdvancedAuditLogic } from './audit_logic';
import { useStocktakingLogic, getStocktakingHistory, StocktakingItem, StocktakingSession } from '@/app/inventory/stocktaking_logic';
import { THEME } from '@/lib/theme';
import LoadingScreen from '@/components/LoadingScreen';
import { useSearchParams } from 'next/navigation';

export default function AccountingAuditPage() {
    const searchParams = useSearchParams();
    const initialTab = searchParams.get('tab') === 'stocktaking' ? 'stocktaking' : 'stocktaking'; // Default to stocktaking as requested, with instant toggle to accounting

    // 🌟 التبديل بين محرك جرد المخزون والرادار المحاسبي
    const [activeEngineTab, setActiveEngineTab] = useState<'stocktaking' | 'accounting'>(initialTab);

    // =========================================================================
    // 1. منطق التدقيق المحاسبي (Accounting Radar Logic)
    // =========================================================================
    const auditLogic = useAdvancedAuditLogic();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const rowsPerPage = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [auditLogic.searchQuery, auditLogic.activeTab]);

    const totalPages = Math.ceil(auditLogic.errors.length / rowsPerPage) || 1;
    const paginatedErrors = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return auditLogic.errors.slice(start, start + rowsPerPage);
    }, [auditLogic.errors, currentPage]);

    const errorCategories = [
        { id: 'unbalanced', keys: ['unbalanced', 'غير متزن'], title: 'قيود غير متزنة', icon: '⚖️', color: '#ef4444', bg: '#fef2f2' },
        { id: 'missing', keys: ['missing', 'مفقود', 'نقص', 'غير مكتملة'], title: 'حسابات وتوجيهات مفقودة', icon: '🔗', color: '#d97706', bg: '#fef3c7' },
        { id: 'orphan', keys: ['orphan', 'يتيم'], title: 'سجلات يتيمة (مقطوعة الرأس)', icon: '🕳️', color: '#3b82f6', bg: '#eff6ff' },
        { id: 'ghost', keys: ['ghost', 'شبح'], title: 'سجلات شبح (فارغة بدون تفاصيل)', icon: '👻', color: '#8b5cf6', bg: '#f3e8ff' },
    ];

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const handleToggleSelectCategory = (catErrors: any[]) => {
        const catIds = catErrors.map(e => e.error_id);
        const isAllChecked = catIds.length > 0 && catIds.every(id => selectedIds.includes(id));
        if (isAllChecked) {
            setSelectedIds(prev => prev.filter(id => !catIds.includes(id)));
        } else {
            setSelectedIds(prev => [...new Set([...prev, ...catIds])]);
        }
    };

    const handleBulkDelete = async () => {
        if (confirm(`⚠️ هل أنت متأكد من الحذف النهائي لـ (${selectedIds.length}) من السجلات والتشوهات المحددة؟`)) {
            try {
                await auditLogic.bulkDelete();
                setSelectedIds([]); 
            } catch (err) {
                console.error("Bulk delete error:", err);
            }
        }
    };

    // =========================================================================
    // 2. منطق جرد المخزون الدوري والتسويات (Stocktaking Engine Logic)
    // =========================================================================
    const stockLogic = useStocktakingLogic();
    const barcodeInputRef = useRef<HTMLInputElement>(null);
    const [pastSessions, setPastSessions] = useState<StocktakingSession[]>([]);
    const [showHistoryModal, setShowHistoryModal] = useState(false);

    useEffect(() => {
        setPastSessions(getStocktakingHistory());
    }, [stockLogic.isSubmitting]);

    const formatMoney = (val: number) => {
        return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(val || 0);
    };

    const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && stockLogic.barcodeInput.trim()) {
            e.preventDefault();
            stockLogic.handleScanBarcode(stockLogic.barcodeInput);
        }
    };

    const getStockStatusBadge = (item: StocktakingItem) => {
        if (item.status === 'matched') {
            return (
                <span style={{
                    background: 'rgba(5, 150, 105, 0.12)',
                    color: '#059669',
                    border: '1px solid rgba(5, 150, 105, 0.3)',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                }}>
                    <span>🟢</span>
                    <span>مطابق (0)</span>
                </span>
            );
        }
        if (item.status === 'deficit') {
            return (
                <span style={{
                    background: 'rgba(168, 87, 60, 0.12)',
                    color: '#A8573C',
                    border: '1px solid rgba(168, 87, 60, 0.35)',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                }}>
                    <span>🔴</span>
                    <span>عجز ({item.variance_qty})</span>
                </span>
            );
        }
        return (
            <span style={{
                background: 'rgba(194, 155, 98, 0.15)',
                color: '#8c6b32',
                border: '1px solid rgba(194, 155, 98, 0.4)',
                padding: '3px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px'
            }}>
                <span>🔵</span>
                <span>فائض (+{item.variance_qty})</span>
            </span>
        );
    };

    return (
        <MasterPage 
            title={activeEngineTab === 'stocktaking' ? "جرد المخزون الدوري ومطابقة الأرصدة" : "الرادار المحاسبي المتقدم"} 
            subtitle={activeEngineTab === 'stocktaking' ? "محرك الجرد الفعلي، مسح الباركود، واحتساب الفروقات وترحيل التسويات والقيود آلياً" : "لوحة التدقيق التفصيلية، الموازنة الآلية، والتطهير الشامل"}
            icon={activeEngineTab === 'stocktaking' ? "📋" : "⚖️"}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl' }}>

                {/* 🎛️ أزرار التبديل الرئيسية للهوية الملكية الفاخرة */}
                <div style={{
                    background: '#FFFFFF',
                    border: '1.5px solid rgba(194, 155, 98, 0.3)',
                    borderRadius: '16px',
                    padding: '6px',
                    display: 'flex',
                    gap: '8px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                }}>
                    <button
                        type="button"
                        onClick={() => setActiveEngineTab('stocktaking')}
                        style={{
                            flex: 1,
                            minHeight: '44px',
                            padding: '10px 18px',
                            borderRadius: '12px',
                            border: 'none',
                            background: activeEngineTab === 'stocktaking' ? 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)' : 'transparent',
                            color: activeEngineTab === 'stocktaking' ? '#FFFFFF' : '#1E130B',
                            fontSize: '13px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            boxShadow: activeEngineTab === 'stocktaking' ? '0 4px 14px rgba(194, 155, 98, 0.3)' : 'none',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>📋</span>
                        <span>جرد المخزون الدوري والتسويات المخزنية (Stocktaking & Reconciliation)</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveEngineTab('accounting')}
                        style={{
                            flex: 1,
                            minHeight: '44px',
                            padding: '10px 18px',
                            borderRadius: '12px',
                            border: 'none',
                            background: activeEngineTab === 'accounting' ? '#1E130B' : 'transparent',
                            color: activeEngineTab === 'accounting' ? '#FFFFFF' : '#1E130B',
                            fontSize: '13px',
                            fontWeight: 900,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>⚖️</span>
                        <span>الرادار المحاسبي وموازنة الدفاتر (General Ledger Audit)</span>
                    </button>
                </div>

                {/* ================================================================= */}
                {/* 📋 الشاشة الأولى: محرك جرد المخزون الدوري والتسويات المخزنية */}
                {/* ================================================================= */}
                {activeEngineTab === 'stocktaking' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                        {/* 1. لوحة إعدادات الجلسة والمستودع */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid rgba(194, 155, 98, 0.25)',
                            borderRadius: '16px',
                            padding: '16px 20px',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '14px',
                            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                        }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                                    🏢 المستودع المراد جرده *
                                </label>
                                <select
                                    value={stockLogic.selectedWarehouseId}
                                    onChange={(e) => stockLogic.setSelectedWarehouseId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        minHeight: '44px',
                                        padding: '8px 14px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(194, 155, 98, 0.35)',
                                        background: '#FDFBF7',
                                        color: '#1E130B',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        outline: 'none',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {stockLogic.warehouses.map((w: any) => (
                                        <option key={w.id} value={w.id}>
                                            {w.name} ({w.type === 'main' ? 'رئيسي' : (w.type === 'vehicle' ? 'سيارة' : 'فرعي')})
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                                    🎯 نوع الجرد
                                </label>
                                <select
                                    value={stockLogic.countType}
                                    onChange={(e) => stockLogic.setCountType(e.target.value as any)}
                                    style={{
                                        width: '100%',
                                        minHeight: '44px',
                                        padding: '8px 14px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(194, 155, 98, 0.35)',
                                        background: '#FDFBF7',
                                        color: '#1E130B',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        outline: 'none'
                                    }}
                                >
                                    <option value="full">جرد شامل لكافة أصناف المستودع</option>
                                    <option value="partial">جرد جزئي / دوري (Cycle Counting)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                                    👤 المسؤول عن الجرد
                                </label>
                                <input
                                    type="text"
                                    value={stockLogic.auditorName}
                                    onChange={(e) => stockLogic.setAuditorName(e.target.value)}
                                    placeholder="اسم أمين المستودع أو الجارد"
                                    style={{
                                        width: '100%',
                                        minHeight: '44px',
                                        padding: '8px 14px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(194, 155, 98, 0.35)',
                                        background: '#FDFBF7',
                                        color: '#1E130B',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={stockLogic.handleSetAllToBook}
                                    style={{
                                        flex: 1,
                                        minHeight: '44px',
                                        padding: '8px 12px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(5, 150, 105, 0.35)',
                                        background: 'rgba(5, 150, 105, 0.08)',
                                        color: '#059669',
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    مطابقة مع الدفتري
                                </button>
                                <button
                                    type="button"
                                    onClick={stockLogic.handleSetAllToZero}
                                    style={{
                                        flex: 1,
                                        minHeight: '44px',
                                        padding: '8px 12px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(168, 87, 60, 0.35)',
                                        background: 'rgba(168, 87, 60, 0.08)',
                                        color: '#A8573C',
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        cursor: 'pointer'
                                    }}
                                >
                                    تصفير لبدء العد
                                </button>
                                {pastSessions.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowHistoryModal(true)}
                                        style={{
                                            minHeight: '44px',
                                            padding: '8px 12px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(194, 155, 98, 0.35)',
                                            background: '#FFFFFF',
                                            color: '#8c6b32',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        📜 السجل ({pastSessions.length})
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* 2. شريط مسح الباركود الفوري */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1.5px solid rgba(194, 155, 98, 0.4)',
                            borderRadius: '16px',
                            padding: '14px 20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            flexWrap: 'wrap',
                            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                        }}>
                            <div style={{ fontSize: '26px' }}>📟</div>
                            <div style={{ flex: '1 1 320px' }}>
                                <input
                                    ref={barcodeInputRef}
                                    type="text"
                                    placeholder="امسح الباركود بقارئ الباركود اللاسلكي أو اضغط Enter للإضافة السريعة (+1)..."
                                    value={stockLogic.barcodeInput}
                                    onChange={(e) => stockLogic.setBarcodeInput(e.target.value)}
                                    onKeyDown={handleBarcodeKeyDown}
                                    style={{
                                        width: '100%',
                                        minHeight: '44px',
                                        padding: '10px 16px',
                                        borderRadius: '12px',
                                        border: '1.5px solid #C29B62',
                                        background: '#FDFBF7',
                                        color: '#1E130B',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        outline: 'none'
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => stockLogic.barcodeInput && stockLogic.handleScanBarcode(stockLogic.barcodeInput)}
                                style={{
                                    minHeight: '44px',
                                    padding: '8px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: '#FFFFFF',
                                    fontSize: '13px',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>مسح الصنف</span>
                                <span>↵</span>
                            </button>
                            <button
                                type="button"
                                onClick={stockLogic.exportToExcel}
                                style={{
                                    minHeight: '44px',
                                    padding: '8px 18px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: '#059669',
                                    color: '#FFFFFF',
                                    fontSize: '13px',
                                    fontWeight: 900,
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>📊</span>
                                <span>تصدير Excel</span>
                            </button>
                        </div>

                        {/* 3. بطاقات مؤشرات الأداء الحية (KPI Cards) */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '12px'
                        }}>
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '14px',
                                padding: '16px',
                                textAlign: 'center',
                                boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
                            }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#786c62' }}>الأصناف المجرودة 📦</span>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }}>
                                    {stockLogic.metrics.totalItems} صنف
                                </div>
                            </div>

                            <div 
                                onClick={() => stockLogic.setStatusFilter('matched')}
                                style={{
                                    background: '#FFFFFF',
                                    border: stockLogic.statusFilter === 'matched' ? '2px solid #059669' : '1px solid rgba(5, 150, 105, 0.25)',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
                                }}
                            >
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#059669' }}>أصناف متطابقة 🟢</span>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                                    {stockLogic.metrics.matchedCount} صنف
                                </div>
                            </div>

                            <div 
                                onClick={() => stockLogic.setStatusFilter('deficit')}
                                style={{
                                    background: '#FFFFFF',
                                    border: stockLogic.statusFilter === 'deficit' ? '2px solid #A8573C' : '1px solid rgba(168, 87, 60, 0.25)',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
                                }}
                            >
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#A8573C' }}>أصناف بها عجز 🔴</span>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#A8573C', marginTop: '4px' }}>
                                    {stockLogic.metrics.deficitCount} صنف
                                </div>
                                <div style={{ fontSize: '11px', color: '#A8573C', fontWeight: 800, marginTop: '2px' }}>
                                    خسارة: {formatMoney(stockLogic.metrics.totalDeficitValue)}
                                </div>
                            </div>

                            <div 
                                onClick={() => stockLogic.setStatusFilter('surplus')}
                                style={{
                                    background: '#FFFFFF',
                                    border: stockLogic.statusFilter === 'surplus' ? '2px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.25)',
                                    borderRadius: '14px',
                                    padding: '16px',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
                                }}
                            >
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#8c6b32' }}>أصناف بها فائض 🔵</span>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#C29B62', marginTop: '4px' }}>
                                    {stockLogic.metrics.surplusCount} صنف
                                </div>
                                <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 800, marginTop: '2px' }}>
                                    إيراد: {formatMoney(stockLogic.metrics.totalSurplusValue)}
                                </div>
                            </div>

                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '14px',
                                padding: '16px',
                                textAlign: 'center',
                                boxShadow: '0 4px 15px rgba(30, 19, 11, 0.03)'
                            }}>
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#786c62' }}>صافي الفارق المالي ⚖️</span>
                                <div style={{
                                    fontSize: '22px',
                                    fontWeight: 900,
                                    color: stockLogic.metrics.netVarianceValue === 0 ? '#059669' : (stockLogic.metrics.netVarianceValue > 0 ? '#C29B62' : '#A8573C'),
                                    marginTop: '4px'
                                }}>
                                    {formatMoney(stockLogic.metrics.netVarianceValue)}
                                </div>
                            </div>
                        </div>

                        {/* 4. شريط البحث والتصفية */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {[
                                    { id: 'all', label: 'كافة الأصناف' },
                                    { id: 'variance_only', label: `⚠️ الفروقات فقط (${stockLogic.metrics.varianceItemsCount})` },
                                    { id: 'deficit', label: `🔴 العجز فقط (${stockLogic.metrics.deficitCount})` },
                                    { id: 'surplus', label: `🔵 الفائض فقط (${stockLogic.metrics.surplusCount})` },
                                    { id: 'matched', label: `🟢 المتطابقة (${stockLogic.metrics.matchedCount})` }
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => stockLogic.setStatusFilter(tab.id as any)}
                                        style={{
                                            minHeight: '38px',
                                            padding: '8px 14px',
                                            borderRadius: '10px',
                                            border: 'none',
                                            background: stockLogic.statusFilter === tab.id ? '#1E130B' : '#FFFFFF',
                                            color: stockLogic.statusFilter === tab.id ? '#FFFFFF' : '#1E130B',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            boxShadow: '0 2px 8px rgba(30, 19, 11, 0.05)'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ flex: '1 1 240px', maxWidth: '360px' }}>
                                <input
                                    type="text"
                                    placeholder="ابحث بالاسم أو الكود أو الباركود..."
                                    value={stockLogic.searchFilter}
                                    onChange={(e) => stockLogic.setSearchFilter(e.target.value)}
                                    style={{
                                        width: '100%',
                                        minHeight: '38px',
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(194, 155, 98, 0.35)',
                                        background: '#FFFFFF',
                                        color: '#1E130B',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        {/* 5. جدول مطابقة الجرد الفعلي مقابل الدفتري */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1px solid rgba(194, 155, 98, 0.25)',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                        }}>
                            <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '12px' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FDFBF7' }}>
                                        <tr style={{
                                            borderBottom: '1.5px solid rgba(194, 155, 98, 0.25)',
                                            color: '#1E130B'
                                        }}>
                                            <th style={{ padding: '12px 16px', fontWeight: 900 }}>الصنف والكود</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900 }}>الرصيد الدفتري</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900, textAlign: 'center' }}>الرصيد الفعلي المجرود</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900 }}>فارق الكمية</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900 }}>التكلفة</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900 }}>الفارق المالي</th>
                                            <th style={{ padding: '12px 16px', fontWeight: 900, textAlign: 'center' }}>حالة المطابقة</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stockLogic.isLoading ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '50px', textAlign: 'center' }}>
                                                    <LoadingScreen text="جارٍ تهيئة وفحص بنود المستودع..." />
                                                </td>
                                            </tr>
                                        ) : stockLogic.items.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '50px', textAlign: 'center', color: '#786c62', fontWeight: 800 }}>
                                                    لا توجد أصناف مطابقة للبحث أو الفلتر المحدد 🎉
                                                </td>
                                            </tr>
                                        ) : (
                                            stockLogic.items.map((item) => {
                                                const isRecent = stockLogic.recentScannedId === item.item_id;

                                                return (
                                                    <tr
                                                        key={item.item_id}
                                                        style={{
                                                            borderBottom: '1px solid rgba(194, 155, 98, 0.15)',
                                                            background: isRecent ? 'rgba(194, 155, 98, 0.18)' : (
                                                                item.status === 'deficit' ? 'rgba(168, 87, 60, 0.04)' : (
                                                                    item.status === 'surplus' ? 'rgba(194, 155, 98, 0.04)' : 'transparent'
                                                                )
                                                            ),
                                                            transition: 'background 0.3s'
                                                        }}
                                                    >
                                                        {/* Name & Code */}
                                                        <td style={{ padding: '12px 16px' }}>
                                                            <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                                                                {item.name}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: '#786c62', marginTop: '2px', fontWeight: 700 }}>
                                                                {item.code ? `كود: ${item.code}` : ''} {item.barcode ? `| باركود: ${item.barcode}` : ''}
                                                            </div>
                                                        </td>

                                                        {/* Book Qty */}
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#786c62' }}>
                                                            {item.book_qty} {item.unit}
                                                        </td>

                                                        {/* Stepper Physical Count */}
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => stockLogic.handleUpdatePhysicalQty(item.item_id, item.physical_qty - 1)}
                                                                    disabled={item.physical_qty <= 0}
                                                                    style={{
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid rgba(194, 155, 98, 0.3)',
                                                                        background: '#FFFFFF',
                                                                        color: '#1E130B',
                                                                        fontWeight: 900,
                                                                        cursor: item.physical_qty <= 0 ? 'not-allowed' : 'pointer'
                                                                    }}
                                                                >
                                                                    -
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    value={item.physical_qty}
                                                                    onChange={(e) => stockLogic.handleUpdatePhysicalQty(item.item_id, Number(e.target.value))}
                                                                    style={{
                                                                        width: '74px',
                                                                        minHeight: '32px',
                                                                        textAlign: 'center',
                                                                        borderRadius: '8px',
                                                                        border: '1.5px solid #C29B62',
                                                                        background: '#FFFFFF',
                                                                        color: '#1E130B',
                                                                        fontSize: '14px',
                                                                        fontWeight: 900,
                                                                        outline: 'none'
                                                                    }}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => stockLogic.handleUpdatePhysicalQty(item.item_id, item.physical_qty + 1)}
                                                                    style={{
                                                                        width: '32px',
                                                                        height: '32px',
                                                                        borderRadius: '8px',
                                                                        border: '1px solid rgba(194, 155, 98, 0.3)',
                                                                        background: '#FFFFFF',
                                                                        color: '#1E130B',
                                                                        fontWeight: 900,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    +
                                                                </button>
                                                            </div>
                                                        </td>

                                                        {/* Variance Qty */}
                                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: item.variance_qty === 0 ? '#059669' : (item.variance_qty > 0 ? '#8c6b32' : '#A8573C') }}>
                                                            {item.variance_qty > 0 ? `+${item.variance_qty}` : item.variance_qty} {item.unit}
                                                        </td>

                                                        {/* Cost */}
                                                        <td style={{ padding: '12px 16px', fontWeight: 800, color: '#786c62' }}>
                                                            {formatMoney(item.cost_price)}
                                                        </td>

                                                        {/* Variance Financial Value */}
                                                        <td style={{ padding: '12px 16px', fontWeight: 900, color: item.variance_value === 0 ? '#059669' : (item.variance_value > 0 ? '#8c6b32' : '#A8573C') }}>
                                                            {formatMoney(item.variance_value)}
                                                        </td>

                                                        {/* Status */}
                                                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                            {getStockStatusBadge(item)}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* 6. اعتماد محضر الجرد وتوليد التسويات المخزنية والقيود فورياً */}
                        <div style={{
                            background: '#FFFFFF',
                            border: '1.5px solid rgba(194, 155, 98, 0.3)',
                            borderRadius: '16px',
                            padding: '16px 20px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '14px',
                            boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                        }}>
                            <div style={{ flex: '1 1 350px' }}>
                                <input
                                    type="text"
                                    placeholder="ملاحظات محضر الجرد واعتماد الإدارة (اختياري)..."
                                    value={stockLogic.sessionNotes}
                                    onChange={(e) => stockLogic.setSessionNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        minHeight: '44px',
                                        padding: '10px 16px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(194, 155, 98, 0.35)',
                                        background: '#FDFBF7',
                                        color: '#1E130B',
                                        fontSize: '13px',
                                        fontWeight: 700,
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <button
                                type="button"
                                disabled={stockLogic.isSubmitting || stockLogic.metrics.varianceItemsCount === 0}
                                onClick={stockLogic.handleApproveStocktaking}
                                style={{
                                    minHeight: '48px',
                                    padding: '10px 28px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: stockLogic.metrics.varianceItemsCount === 0 ? '#e2e8f0' : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: stockLogic.metrics.varianceItemsCount === 0 ? '#94a3b8' : '#FFFFFF',
                                    fontSize: '14px',
                                    fontWeight: 900,
                                    cursor: (stockLogic.isSubmitting || stockLogic.metrics.varianceItemsCount === 0) ? 'not-allowed' : 'pointer',
                                    boxShadow: stockLogic.metrics.varianceItemsCount === 0 ? 'none' : '0 4px 18px rgba(194, 155, 98, 0.35)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}
                            >
                                <span>📋</span>
                                <span>{stockLogic.isSubmitting ? 'جارٍ ترحيل القيود وتحديث الأرصدة...' : `اعتماد المحضر وتوليد التسويات المخزنية (${stockLogic.metrics.varianceItemsCount} صنف) 🚀`}</span>
                            </button>
                        </div>

                    </div>
                )}

                {/* ================================================================= */}
                {/* ⚖️ الشاشة الثانية: الرادار المحاسبي وموازنة الدفاتر (GL Audit) */}
                {/* ================================================================= */}
                {activeEngineTab === 'accounting' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        {/* 📊 الإحصائيات العلوية */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px' }}>
                            <div className="audit-stat-card">
                                <div><h3 style={{ margin: '0 0 5px 0', color: THEME.primary || '#3b82f6', fontSize: '26px' }}>{auditLogic.stats.total}</h3><p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#64748b' }}>إجمالي التشوهات</p></div><div style={{ fontSize: '32px' }}>🚨</div>
                            </div>
                            <div className="audit-stat-card">
                                <div><h3 style={{ margin: '0 0 5px 0', color: '#ef4444', fontSize: '26px' }}>{auditLogic.stats.unbalanced}</h3><p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#64748b' }}>قيود غير متزنة</p></div><div style={{ fontSize: '32px' }}>⚖️</div>
                            </div>
                            <div className="audit-stat-card">
                                <div><h3 style={{ margin: '0 0 5px 0', color: '#8b5cf6', fontSize: '26px' }}>{auditLogic.stats.ghosts}</h3><p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#64748b' }}>سجلات شبح</p></div><div style={{ fontSize: '32px' }}>👻</div>
                            </div>
                            <div className="audit-stat-card">
                                <div><h3 style={{ margin: '0 0 5px 0', color: '#f59e0b', fontSize: '26px' }}>{auditLogic.stats.brokenRef}</h3><p style={{ margin: 0, fontSize: '13px', fontWeight: 800, color: '#64748b' }}>بيانات مفقودة</p></div><div style={{ fontSize: '32px' }}>🔗</div>
                            </div>
                        </div>

                        {/* 🎛️ شريط التحكم */}
                        <div style={{ background: 'white', padding: '15px 25px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(40, 145, 200, 0.15)', flexWrap: 'wrap', gap: '15px' }}>
                            <input 
                                type="text" 
                                placeholder="🔍 ابحث في تفاصيل المشكلة، التوجيه، الجهة، أو ID..." 
                                value={auditLogic.searchQuery}
                                onChange={(e) => auditLogic.setSearchQuery(e.target.value)}
                                style={{ padding: '12px 20px', borderRadius: '10px', border: '2px solid rgba(255, 255, 255, 0.4)', outline: 'none', width: '380px', fontWeight: 700, fontSize: '14px' }}
                            />
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {selectedIds.length > 0 && (
                                    <button 
                                        onClick={handleBulkDelete} 
                                        disabled={auditLogic.isBulkDeleting}
                                        style={{ background: '#ef4444', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                                    >
                                        🗑️ {auditLogic.isBulkDeleting ? 'جاري الحذف...' : `حذف المحدد (${selectedIds.length})`}
                                    </button>
                                )}
                                
                                <button 
                                    onClick={() => confirm('⚠️ هل أنت متأكد من مسح كافة القيود الصفرية والعمياء من قاعدة البيانات؟') && auditLogic.cleanZeroLines()} 
                                    disabled={auditLogic.isCleaningZeroLines}
                                    style={{ background: '#f59e0b', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 900, cursor: auditLogic.isCleaningZeroLines ? 'not-allowed' : 'pointer', opacity: auditLogic.isCleaningZeroLines ? 0.7 : 1 }}
                                >
                                    {auditLogic.isCleaningZeroLines ? '⏳ جاري التنظيف...' : '🧹 تطهير القيود الصفرية'}
                                </button>

                                <button onClick={auditLogic.exportToExcel} style={{ background: '#10b981', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>📥 تصدير التقرير</button>
                                <button onClick={() => { auditLogic.refetch(); setSelectedIds([]); setCurrentPage(1); }} style={{ background: THEME.primary || '#3b82f6', color: 'white', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}>🔄 تحديث الرادار</button>
                            </div>
                        </div>

                        {/* 📋 الأقسام المفصلة */}
                        {auditLogic.isLoading ? (
                            <LoadingScreen text="جاري الفحص الشامل للدفاتر..." />
                        ) : auditLogic.errors.length === 0 ? (
                            <div style={{ padding: '60px', textAlign: 'center', background: 'white', borderRadius: '24px', border: '1px solid rgba(40, 145, 200, 0.15)', boxShadow: '0 10px 30px rgba(0,0,0,0.02)' }}>
                                <div style={{ fontSize: '60px', marginBottom: '15px' }}>🎉</div>
                                <h2 style={{ color: '#16a34a', margin: 0, fontWeight: 900 }}>الدفاتر متزنة وقاعدة البيانات نظيفة 100%</h2>
                                <p style={{ color: '#64748b', marginTop: '10px', fontWeight: 700 }}>لم يتم اكتشاف أي تشوهات محاسبية أو مراجع مفقودة.</p>
                            </div>
                        ) : (
                            <div>
                                {errorCategories.map(cat => {
                                    const catErrors = paginatedErrors.filter(e => cat.keys.some(k => e.error_type?.toLowerCase().includes(k) || e.details?.toLowerCase().includes(k)));
                                    if (catErrors.length === 0) return null;

                                    return (
                                        <div key={cat.id} style={{ background: 'white', borderRadius: '20px', overflow: 'hidden', border: '1px solid rgba(40, 145, 200, 0.15)', marginBottom: '30px' }}>
                                            <div style={{ background: cat.color, padding: '15px 20px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 900, fontSize: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        onChange={() => handleToggleSelectCategory(catErrors)}
                                                        checked={catErrors.length > 0 && catErrors.every(e => selectedIds.includes(e.error_id))}
                                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                    />
                                                    <span>{cat.icon}</span>
                                                    <span>{cat.title} ({catErrors.length})</span>
                                                </div>
                                            </div>

                                            {catErrors.map((err: any) => (
                                                <div key={err.error_id} style={{ display: 'grid', gridTemplateColumns: '40px 40px 1fr 1.6fr 1.8fr 1fr 1.2fr', gap: '15px', alignItems: 'center', padding: '15px', borderBottom: '1px dashed rgba(40, 145, 200, 0.15)' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.includes(err.error_id)} 
                                                        onChange={() => handleToggleSelect(err.error_id)} 
                                                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                                    />
                                                    <div style={{ fontWeight: 900, color: '#94a3b8' }}>#</div>
                                                    <div>
                                                        <span style={{ background: cat.bg, color: cat.color, padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 800 }}>{err.error_type}</span>
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: '#1e293b' }}>{err.table_name || err.source_type}</div>
                                                        <div style={{ fontSize: '11px', color: '#64748b' }}>{err.error_id}</div>
                                                    </div>
                                                    <div style={{ fontSize: '13px', color: '#475569', fontWeight: 700 }}>{err.details}</div>
                                                    <div style={{ fontWeight: 900, color: cat.color }}>
                                                        {err.diff_amount ? `${Math.abs(Number(err.diff_amount)).toLocaleString()} ر.س` : '-'}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                        {cat.id === 'unbalanced' && (
                                                            <button 
                                                                onClick={() => auditLogic.autoBalance(err.header_id, err.diff_amount)} 
                                                                style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}
                                                            >
                                                                موازنة ⚖️
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => confirm('هل أنت متأكد من الحذف النهائي لتنظيف السجل؟') && auditLogic.deleteError(err.error_id, err.table_name)} 
                                                            style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}
                                                        >
                                                            حذف 🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })}

                                {totalPages > 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px 20px', borderRadius: '14px', border: '1px solid rgba(40, 145, 200, 0.15)' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748b' }}>
                                            إجمالي السجلات: {auditLogic.errors.length}
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#e2e8f0', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', fontWeight: 800 }}>السابق</button>
                                            <span style={{ padding: '8px 14px', fontWeight: 800 }}>{currentPage} / {totalPages}</span>
                                            <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#e2e8f0', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer', fontWeight: 800 }}>التالي</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

            </div>
        </MasterPage>
    );
}
