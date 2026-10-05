"use client";
import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import MasterPage from '@/components/MasterPage';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency, formatDate } from '@/lib/helpers';
import PaginationPanel from '@/components/PaginationPanel';
import RawasiSmartTable from '@/components/rawasismarttable';
import { useReceiptVouchersLogic } from './ReceiptVouchers_logic';
import ReceiptVoucherModal from './ReceiptVoucherModal';
import ReceiptPrintModal from './ReceiptPrintModal';
import SmartCombo from '@/components/SmartCombo';
import LoadingScreen from '@/components/LoadingScreen';

export default function ReceiptVouchersPage() {
    const logic = useReceiptVouchersLogic();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    // Shortcuts: Alt+N for new voucher
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!logic.isEditModalOpen && e.altKey && (e.code === 'KeyN' || e.key.toLowerCase() === 'n' || e.key === 'ى')) {
                e.preventDefault();
                logic.handleAddNew();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [logic.isEditModalOpen]);

    const currentVisibleIds = useMemo(() => {
        return logic.receipts?.map((v: any) => String(v.id)) || [];
    }, [logic.receipts]);

    const isAllVisibleSelected = currentVisibleIds.length > 0 && currentVisibleIds.every((id: string) => logic.selectedIds.includes(id));

    // Table Columns definition
    const receiptColumns = [
        {
            header: (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input 
                        type="checkbox" 
                        checked={isAllVisibleSelected}
                        title="تحديد كل الصفحة"
                        onChange={(e) => {
                            e.stopPropagation();
                            if (isAllVisibleSelected) {
                                logic.setSelectedIds(logic.selectedIds.filter((id: string) => !currentVisibleIds.includes(id)));
                            } else {
                                logic.setSelectedIds([...new Set([...logic.selectedIds, ...currentVisibleIds])]);
                            }
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#C29B62', cursor: 'pointer' }}
                    />
                </div>
            ),
            accessor: 'id',
            render: (row: any) => {
                if (!row) return null;
                return (
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <input 
                            type="checkbox" 
                            checked={logic.selectedIds.includes(String(row.id))} 
                            onChange={(e) => {
                                e.stopPropagation(); 
                                logic.setSelectedIds(prev => prev.includes(String(row.id)) ? prev.filter(x => x !== String(row.id)) : [...prev, String(row.id)]);
                            }}
                            style={{ width: '16px', height: '16px', accentColor: '#C29B62', cursor: 'pointer' }}
                        />
                    </div>
                );
            }
        },
        {
            header: 'رقم السند',
            accessor: 'receipt_number',
            render: (row: any) => {
                if (!row) return null;
                const isDelegate = !!row.delegate_id || !!row.fleet_operation_id;
                return (
                    <div>
                        <div style={{ fontWeight: 900, color: '#1E130B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>#{row.receipt_number}</span>
                            {isDelegate && (
                                <span style={{
                                    background: 'rgba(194, 155, 98, 0.15)',
                                    color: '#8c6b32',
                                    padding: '2px 6px',
                                    borderRadius: '6px',
                                    fontSize: '10px',
                                    fontWeight: 900
                                }}>
                                    🚚 عهدة
                                </span>
                            )}
                        </div>
                        {row.reference_number && (
                            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', fontWeight: 700 }}>
                                مرجع: {row.reference_number}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'التاريخ',
            accessor: 'date',
            render: (row: any) => {
                if (!row) return null;
                return <span style={{ color: '#64748b', fontSize: '13px', fontWeight: 700 }}>{formatDate(row.date)}</span>;
            }
        },
        {
            header: 'العميل / الجهة المستلم منها',
            accessor: 'partner_name',
            render: (row: any) => {
                if (!row) return null;
                const displayName = row.partners?.name || (row.invoices?.invoice_number ? `سداد فاتورة #${row.invoices.invoice_number}` : (row.notes || 'عميل نقدي'));
                return (
                    <div>
                        <span style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>{displayName}</span>
                        {row.invoices?.invoice_number && (
                            <div style={{ fontSize: '11px', color: '#059669', fontWeight: 700, marginTop: '2px' }}>
                                مقترن بفاتورة مبيعات #{row.invoices.invoice_number}
                            </div>
                        )}
                    </div>
                );
            }
        },
        {
            header: 'طريقة القبض',
            accessor: 'payment_method',
            render: (row: any) => {
                if (!row) return null;
                const method = row.payment_method || 'نقدي';
                const isBank = method.includes('بنك') || method.includes('تحويل') || method.includes('شبكة') || method.includes('مدى');
                return (
                    <span style={{
                        background: isBank ? 'rgba(30, 19, 11, 0.06)' : 'rgba(194, 155, 98, 0.12)',
                        color: isBank ? '#1E130B' : '#8c6b32',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        fontSize: '12px',
                        fontWeight: 800
                    }}>
                        {isBank ? '🏦 ' : '💵 '}{method}
                    </span>
                );
            }
        },
        {
            header: 'المبلغ المقبوض',
            accessor: 'amount',
            render: (row: any) => {
                if (!row) return null;
                return <span style={{ color: '#059669', fontWeight: 900, fontSize: '15px' }}>{formatCurrency(row.amount)}</span>;
            }
        },
        {
            header: 'الحالة المحاسبية',
            accessor: 'status',
            render: (row: any) => {
                if (!row) return null;
                const isPosted = ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(row.status || '').trim().toLowerCase()) || row.is_posted === true;
                return (
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: 900,
                        background: isPosted ? 'rgba(5, 150, 105, 0.1)' : 'rgba(217, 119, 6, 0.1)',
                        color: isPosted ? '#059669' : '#b45309',
                        border: isPosted ? '1px solid rgba(5, 150, 105, 0.25)' : '1px solid rgba(217, 119, 6, 0.25)'
                    }}>
                        <span>{isPosted ? '● مرحل بالدفاتر' : '○ مسودة قيد التدقيق'}</span>
                    </div>
                );
            }
        },
        {
            header: 'الإجراءات',
            accessor: 'actions',
            render: (row: any) => {
                if (!row) return null;
                const canEdit = logic.canUserEdit(row);
                return (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button
                            type="button"
                            onClick={() => logic.handlePrintVoucher(row)}
                            style={{
                                padding: '6px 12px',
                                borderRadius: '8px',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                background: '#FFFFFF',
                                color: '#1E130B',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                            title="طباعة السند الرسمي أو الحراري"
                        >
                            <span>🖨️ طباعة</span>
                        </button>
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => logic.handleEdit(row)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(194, 155, 98, 0.25)',
                                    background: '#FDFBF7',
                                    color: '#8c6b32',
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                }}
                                title="تعديل السند"
                            >
                                ✏️
                            </button>
                        )}
                    </div>
                );
            }
        }
    ];

    return (
        <MasterPage
            icon="📥"
            title="إدارة سندات القبض وتوريد عهد الخزينة (Receipt Vouchers)"
            subtitle="توثيق التحصيلات النقدية، توريد عهد المناديب والكاشير، وترحيل القيود آلياً إلى شجرة الحسابات"
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
                        .rv-kpi-grid { grid-template-columns: 1fr !important; }
                        .rv-toolbar-row { flex-direction: column !important; }
                    }
                `}</style>

                <PrintHeader
                    title="كشف سندات القبض والتحصيلات النقدية"
                    subtitle={`تاريخ الكشف: ${new Date().toLocaleDateString('ar-SA')}`}
                />

                {/* 1. Control Toolbar */}
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
                                💰
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: '#1E130B' }}>
                                    سندات القبض وحركات الخزينة
                                </h2>
                                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                                    إثبات النقدية الواردة للصندوق والبنك وإقفال الذمم المدينة
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={logic.handleAddNew}
                                style={{
                                    padding: '10px 22px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: '#FFFFFF',
                                    fontWeight: 900,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    boxShadow: '0 4px 14px rgba(194, 155, 98, 0.35)',
                                    minHeight: '44px'
                                }}
                            >
                                <span>➕ سند قبض جديد</span>
                                <span style={{ fontSize: '10px', opacity: 0.8 }}>(Alt+N)</span>
                            </button>

                            <button
                                type="button"
                                onClick={logic.exportToExcel}
                                disabled={logic.allFiltered.length === 0}
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
                                <span>تصدير إكسيل</span>
                                <span>📑</span>
                            </button>
                        </div>
                    </div>

                    {/* Filters Row */}
                    <div className="rv-toolbar-row" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        flexWrap: 'wrap',
                        paddingTop: '16px',
                        borderTop: '1px solid rgba(194, 155, 98, 0.15)'
                    }}>
                        {/* Search Input */}
                        <div style={{ flex: '1 1 260px', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="بحث برقم السند، العميل، المرجع، أو المبلغ..."
                                value={logic.globalSearch}
                                onChange={(e) => logic.setGlobalSearch(e.target.value)}
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

                        {/* Category Filter Tabs */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '2px' }}>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setCategoryFilter('all')}
                                style={{
                                    background: logic.categoryFilter === 'all' ? '#1E130B' : '#FDFBF7',
                                    color: logic.categoryFilter === 'all' ? '#FDFBF7' : '#1E130B',
                                    border: logic.categoryFilter === 'all' ? '1px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.3)'
                                }}
                            >
                                كافة السندات
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setCategoryFilter('customers')}
                                style={{
                                    background: logic.categoryFilter === 'customers' ? '#C29B62' : '#FDFBF7',
                                    color: logic.categoryFilter === 'customers' ? '#FFFFFF' : '#8c6b32',
                                    border: logic.categoryFilter === 'customers' ? '1px solid #C29B62' : '1px solid rgba(194, 155, 98, 0.3)'
                                }}
                            >
                                تحصيلات العملاء
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setCategoryFilter('delegates')}
                                style={{
                                    background: logic.categoryFilter === 'delegates' ? '#059669' : '#FDFBF7',
                                    color: logic.categoryFilter === 'delegates' ? '#FFFFFF' : '#059669',
                                    border: logic.categoryFilter === 'delegates' ? '1px solid #059669' : '1px solid rgba(5, 150, 105, 0.3)'
                                }}
                            >
                                🚚 توريد عهد المناديب
                            </button>
                        </div>

                        {/* Status Filter Tabs */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setStatusFilter('all')}
                                style={{
                                    background: logic.statusFilter === 'all' ? '#FDFBF7' : '#FFFFFF',
                                    color: '#1E130B',
                                    border: logic.statusFilter === 'all' ? '1.5px solid #1E130B' : '1px solid rgba(194, 155, 98, 0.25)'
                                }}
                            >
                                الكل ({logic.kpis.total})
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setStatusFilter('posted')}
                                style={{
                                    background: logic.statusFilter === 'posted' ? 'rgba(5, 150, 105, 0.15)' : '#FFFFFF',
                                    color: '#059669',
                                    border: logic.statusFilter === 'posted' ? '1.5px solid #059669' : '1px solid rgba(5, 150, 105, 0.25)'
                                }}
                            >
                                معتمد ({logic.kpis.posted})
                            </button>
                            <button
                                type="button"
                                className="filter-pill-btn"
                                onClick={() => logic.setStatusFilter('draft')}
                                style={{
                                    background: logic.statusFilter === 'draft' ? 'rgba(217, 119, 6, 0.15)' : '#FFFFFF',
                                    color: '#b45309',
                                    border: logic.statusFilter === 'draft' ? '1.5px solid #b45309' : '1px solid rgba(217, 119, 6, 0.25)'
                                }}
                            >
                                مسودة ({logic.kpis.pending})
                            </button>
                        </div>
                    </div>

                    {/* Batch Actions Toolbar (When rows are selected) */}
                    {logic.selectedIds.length > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '12px 18px',
                            borderRadius: '12px',
                            background: '#FDFBF7',
                            border: '1.5px solid #C29B62',
                            flexWrap: 'wrap',
                            gap: '12px'
                        }}>
                            <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '13px' }}>
                                تم تحديد ({logic.selectedIds.length}) سند قبض
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={logic.handlePostSelected}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#059669',
                                        color: '#FFFFFF',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ✅ اعتماد وترحيل للدفاتر
                                </button>
                                <button
                                    type="button"
                                    onClick={logic.handleUnpostSelected}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #b45309',
                                        background: '#FFFFFF',
                                        color: '#b45309',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ⏳ فك الترحيل
                                </button>
                                <button
                                    type="button"
                                    onClick={() => logic.setIsBulkFixModalOpen(true)}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #8c6b32',
                                        background: '#FFFFFF',
                                        color: '#8c6b32',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🛠️ توجيه وتصحيح الحسابات
                                </button>
                                <button
                                    type="button"
                                    onClick={logic.handleDeleteSelected}
                                    style={{
                                        padding: '7px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #ef4444',
                                        background: '#fef2f2',
                                        color: '#ef4444',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🗑️ حذف نهائي
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* 2. Luxury KPI Cards */}
                <div className="rv-kpi-grid" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '16px'
                }}>
                    {/* KPI 1: Total Received Amount */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#C29B62' }}>إجمالي المقبوضات 💰</span>
                            <span style={{ fontSize: '20px' }}>🏦</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.kpis.totalAmount)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            إجمالي {logic.kpis.total} سند قبض مسجل
                        </div>
                    </div>

                    {/* KPI 2: Posted Vouchers */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#059669' }}>المعتمد والمرحل للدفاتر ✅</span>
                            <span style={{ fontSize: '20px' }}>📖</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.kpis.postedAmount)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            {logic.kpis.posted} سند معتمد ومقيد بالخزينة
                        </div>
                    </div>

                    {/* KPI 3: Pending Review */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#b45309' }}>سندات معلقة قيد التدقيق ⏳</span>
                            <span style={{ fontSize: '20px' }}>⚖️</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#b45309', margin: '8px 0 4px 0' }}>
                            {logic.kpis.pending} <span style={{ fontSize: '14px', fontWeight: 700, color: '#64748b' }}>سند</span>
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            بانتظار الاعتماد والترحيل المحاسبي
                        </div>
                    </div>

                    {/* KPI 4: Delegate Custody Handover */}
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
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>توريدات عهد المناديب 🚚</span>
                            <span style={{ fontSize: '20px' }}>🚐</span>
                        </div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#1E130B', margin: '8px 0 4px 0' }}>
                            {formatCurrency(logic.kpis.delegateAmount)}
                        </div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#64748b' }}>
                            {logic.kpis.delegateCount} سند قبض مقترن برحلات المناديب
                        </div>
                    </div>
                </div>

                {/* 3. Table Card */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    overflow: 'hidden'
                }}>
                    {logic.isLoading ? (
                        <LoadingScreen message="جاري تحميل سندات القبض والتحصيلات..." fullScreen={false} />
                    ) : (
                        <div onKeyDown={logic.handleTableKeyDown} tabIndex={0} style={{ outline: 'none' }}>
                            <RawasiSmartTable 
                                data={logic.receipts} 
                                columns={receiptColumns} 
                                title="" 
                                onRowClick={(row) => {
                                    if (logic.canUserEdit(row)) {
                                        logic.handleEdit(row);
                                    }
                                }} 
                            />
                            <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'center', borderTop: '1px solid rgba(194, 155, 98, 0.15)' }}>
                                <PaginationPanel 
                                    totalItems={logic.allFiltered.length} 
                                    currentPage={logic.currentPage} 
                                    rowsPerPage={logic.rowsPerPage} 
                                    onPageChange={logic.setCurrentPage} 
                                    onRowsChange={logic.setRowsPerPage} 
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Voucher Edit / Add Modal */}
                {mounted && logic.isEditModalOpen && (
                    <ReceiptVoucherModal 
                        isOpen={true} 
                        onClose={() => logic.setIsEditModalOpen(false)} 
                        record={logic.currentRecord} 
                        setRecord={logic.setCurrentRecord} 
                        onSave={logic.handleSave}
                        delegates={logic.delegates}
                        fleetOperations={logic.fleetOperations}
                    />
                )}

                {/* Official Certified Print Modal with QR */}
                {mounted && logic.isPrintModalOpen && (
                    <ReceiptPrintModal
                        isOpen={true}
                        onClose={() => {
                            logic.setIsPrintModalOpen(false);
                            logic.setSelectedRecordForPrint(null);
                        }}
                        record={logic.selectedRecordForPrint}
                    />
                )}

                {/* Bulk Fix Modal */}
                {mounted && logic.isBulkFixModalOpen && createPortal(
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 999999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
                        background: 'rgba(30, 19, 11, 0.7)', backdropFilter: 'blur(8px)', direction: 'rtl'
                    }}>
                        <div style={{ background: '#FFFFFF', borderRadius: '24px', width: '100%', maxWidth: '500px', padding: '30px', boxShadow: '0 25px 50px rgba(0,0,0,0.3)', border: '1px solid rgba(194, 155, 98, 0.3)' }}>
                            <h3 style={{ margin: '0 0 10px 0', color: '#1E130B', fontWeight: 900 }}>🛠️ التوجيه والتصحيح المجمع لحسابات السندات</h3>
                            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', fontWeight: 700 }}>
                                سيتم تطبيق التعديلات وتوجيه القيود لـ ({logic.selectedIds.length}) سند مسودة.
                            </p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <SmartCombo 
                                    label="🏦 حساب الخزينة / البنك (الطرف المدين)" 
                                    table="accounts" 
                                    displayCol="name" 
                                    onSelect={(v: any) => logic.setBulkFixAccounts({...logic.bulkFixAccounts, safe_bank_acc_id: v?.id, safe_bank_acc_name: v?.name})} 
                                />
                                <SmartCombo 
                                    label="👥 حساب العميل / المندوب (الطرف الدائن)" 
                                    table="accounts" 
                                    displayCol="name" 
                                    onSelect={(v: any) => logic.setBulkFixAccounts({...logic.bulkFixAccounts, partner_acc_id: v?.id, partner_acc_name: v?.name})} 
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
                                <button 
                                    onClick={logic.handleBulkFixSave} 
                                    disabled={logic.isSaving} 
                                    style={{ 
                                        flex: 2, 
                                        background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)', 
                                        color: '#FFFFFF', 
                                        border: 'none', 
                                        padding: '14px', 
                                        borderRadius: '12px', 
                                        fontWeight: 900, 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    {logic.isSaving ? '⏳ جاري الحفظ...' : '💾 تطبيق التوجيه'}
                                </button>
                                <button 
                                    onClick={() => logic.setIsBulkFixModalOpen(false)} 
                                    style={{ 
                                        flex: 1, 
                                        background: '#FDFBF7', 
                                        color: '#64748b', 
                                        border: '1px solid rgba(194, 155, 98, 0.25)', 
                                        padding: '14px', 
                                        borderRadius: '12px', 
                                        fontWeight: 900, 
                                        cursor: 'pointer' 
                                    }}
                                >
                                    إلغاء
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body
                )}
            </div>
        </MasterPage>
    );
}
