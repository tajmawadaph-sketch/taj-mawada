"use client";
import React, { useMemo, useState } from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import { useServiceOperationsLogic, SERVICE_TYPES, ServiceOperation } from './service_operations_logic';
import ServiceOperationModal from './ServiceOperationModal';
import ServiceOperationPrintModal from './ServiceOperationPrintModal';
import { formatCurrency, formatDate } from '@/lib/helpers';
import Link from 'next/link';
import { showGlobalToast } from '@/lib/toast-context';

export default function ServiceOperationsPage() {
    const logic = useServiceOperationsLogic();
    const { state, actions } = logic;

    const [activeDateTab, setActiveDateTab] = useState<'all' | 'today' | 'week' | 'month'>('all');

    const handleDateQuickSelect = (type: 'all' | 'today' | 'week' | 'month') => {
        setActiveDateTab(type);
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}-${mm}-${dd}`;

        if (type === 'today') {
            actions.setDateFrom(todayStr);
            actions.setDateTo(todayStr);
        } else if (type === 'week') {
            const lastWeek = new Date();
            lastWeek.setDate(today.getDate() - 7);
            const wY = lastWeek.getFullYear();
            const wM = String(lastWeek.getMonth() + 1).padStart(2, '0');
            const wD = String(lastWeek.getDate()).padStart(2, '0');
            actions.setDateFrom(`${wY}-${wM}-${wD}`);
            actions.setDateTo(todayStr);
        } else if (type === 'month') {
            actions.setDateFrom(`${yyyy}-${mm}-01`);
            actions.setDateTo(todayStr);
        } else {
            actions.setDateFrom('');
            actions.setDateTo('');
        }
    };

    const handleExportCSV = () => {
        if (!state.operations.length) {
            showGlobalToast('لا توجد بيانات لتصديرها', 'warning');
            return;
        }

        const headers = ["رقم العملية", "التاريخ", "نوع الخدمة", "البيان", "العميل", "الموظف", "المبلغ الإجمالي", "نسبة العمولة", "مبلغ العمولة", "صافي الربح", "حالة القيد"];
        const rows = state.operations.map(op => [
            op.id.slice(0, 8),
            op.operation_date,
            op.operation_type,
            `"${(op.description || '').replace(/"/g, '""')}"`,
            op.client?.name || 'عميل عام',
            op.employee?.name || 'الشركة',
            op.total_amount,
            `${op.commission_percentage}%`,
            op.commission_amount,
            op.net_profit,
            op.journal_id ? 'مرحل' : 'غير مرحل'
        ]);

        const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `service_operations_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (state.isLoading) {
        return <LoadingScreen message="جاري تحميل سجلات العمليات الخدمية والإيرادات..." />;
    }

    return (
        <MasterPage
            title="إيرادات الخدمات والعمليات التشغيلية"
            description="توثيق العمليات الخدمية، إدارة التشغيل للغير، احتساب الأرباح وعمولات الموظفين مع النظام المحاسبي المتكامل"
            icon="💼"
            actions={
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleExportCSV}
                        style={{
                            background: 'rgba(255, 255, 255, 0.7)',
                            border: '1px solid rgba(28, 115, 171, 0.25)',
                            padding: '10px 16px',
                            borderRadius: '14px',
                            color: '#1C73AB',
                            fontWeight: 800,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            backdropFilter: 'blur(10px)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <span>📥</span>
                        <span>تصدير Excel / CSV</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => actions.setIsModalOpen(true)}
                        style={{
                            background: 'linear-gradient(135deg, #1C73AB 0%, #2891C8 100%)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '10px 22px',
                            borderRadius: '14px',
                            fontWeight: 900,
                            fontSize: '13px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            boxShadow: '0 8px 20px rgba(28, 115, 171, 0.35)',
                            transition: 'transform 0.2s, box-shadow 0.2s'
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 12px 25px rgba(28, 115, 171, 0.45)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 8px 20px rgba(28, 115, 171, 0.35)';
                        }}
                    >
                        <span style={{ fontSize: '16px' }}>➕</span>
                        <span>تسجيل خدمة / إيراد تشغيلي</span>
                    </button>
                </div>
            }
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
                {/* 📊 1. بطاقات المؤشرات المالية (Glassmorphic KPIs) */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '16px'
                }}>
                    {/* بطاقة إجمالي الإيراد */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.65)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: '20px',
                        padding: '20px',
                        boxShadow: '0 10px 30px rgba(28, 115, 171, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.25s',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: '#1C73AB' }} />
                        <div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', display: 'block' }}>
                                إجمالي إيرادات الخدمات المحققة
                            </span>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#122946', marginTop: '6px' }}>
                                {formatCurrency(state.stats.totalRevenue)}
                            </div>
                            <span style={{ fontSize: '11px', color: '#1C73AB', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                                {state.stats.count} عملية مسجلة
                            </span>
                        </div>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(28, 115, 171, 0.15) 0%, rgba(40, 145, 200, 0.25) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>
                            💼
                        </div>
                    </div>

                    {/* بطاقة صافي أرباح المؤسسة */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.65)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: '20px',
                        padding: '20px',
                        boxShadow: '0 10px 30px rgba(22, 163, 74, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.25s',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: '#16a34a' }} />
                        <div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', display: 'block' }}>
                                صافي أرباح المؤسسة (بعد العمولات)
                            </span>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#15803d', marginTop: '6px' }}>
                                {formatCurrency(state.stats.totalNetProfit)}
                            </div>
                            <span style={{ fontSize: '11px', color: '#16a34a', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                                هامش ربح {state.stats.profitMargin}%
                            </span>
                        </div>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.15) 0%, rgba(34, 197, 94, 0.25) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>
                            📈
                        </div>
                    </div>

                    {/* بطاقة عمولات الموظفين */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.65)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: '20px',
                        padding: '20px',
                        boxShadow: '0 10px 30px rgba(245, 158, 11, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.25s',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: '#f59e0b' }} />
                        <div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', display: 'block' }}>
                                إجمالي عمولات الموظفين والمناديب
                            </span>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#b45309', marginTop: '6px' }}>
                                {formatCurrency(state.stats.totalCommissions)}
                            </div>
                            <span style={{ fontSize: '11px', color: '#b45309', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                                {state.stats.withCommissionCount} عملية بعمولة
                            </span>
                        </div>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(251, 191, 36, 0.25) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>
                            🤝
                        </div>
                    </div>

                    {/* بطاقة متوسط العملية */}
                    <div style={{
                        background: 'rgba(255, 255, 255, 0.65)',
                        backdropFilter: 'blur(30px) saturate(190%)',
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        borderRadius: '20px',
                        padding: '20px',
                        boxShadow: '0 10px 30px rgba(40, 145, 200, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        transition: 'transform 0.25s',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: 0, right: 0, width: '4px', height: '100%', background: '#2891C8' }} />
                        <div>
                            <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', display: 'block' }}>
                                متوسط قيمة الخدمة
                            </span>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: '#0369a1', marginTop: '6px' }}>
                                {formatCurrency(state.stats.count > 0 ? (state.stats.totalRevenue / state.stats.count) : 0)}
                            </div>
                            <span style={{ fontSize: '11px', color: '#0284c7', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                                نظام محاسبي مستقل ومرحل
                            </span>
                        </div>
                        <div style={{
                            width: '50px',
                            height: '50px',
                            borderRadius: '16px',
                            background: 'linear-gradient(135deg, rgba(40, 145, 200, 0.15) 0%, rgba(127, 212, 227, 0.25) 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '24px'
                        }}>
                            ⚡
                        </div>
                    </div>
                </div>

                {/* 🎛️ 2. شريط البحث والفلاتر الذكية */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(30px) saturate(200%)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    borderRadius: '20px',
                    padding: '18px 22px',
                    boxShadow: '0 8px 24px rgba(28, 115, 171, 0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    {/* الصف العلوي: البحث والفترات السريعة */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <div style={{ flex: '1 1 280px', position: 'relative' }}>
                            <input
                                type="text"
                                placeholder="🔍 ابحث في البيان، نوع الخدمة، اسم العميل، أو الموظف المنفذ..."
                                value={state.globalSearch}
                                onChange={(e) => actions.setGlobalSearch(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '11px 18px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.9)',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* فترات سريعة */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {[
                                { id: 'all', label: 'كافة الفترات' },
                                { id: 'today', label: 'اليوم' },
                                { id: 'week', label: 'آخر 7 أيام' },
                                { id: 'month', label: 'هذا الشهر' }
                            ].map(tab => (
                                <button
                                    type="button"
                                    key={tab.id}
                                    onClick={() => handleDateQuickSelect(tab.id as any)}
                                    style={{
                                        padding: '8px 14px',
                                        borderRadius: '10px',
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        border: activeDateTab === tab.id ? '1px solid #1C73AB' : '1px solid rgba(28, 115, 171, 0.15)',
                                        background: activeDateTab === tab.id 
                                            ? 'linear-gradient(135deg, #1C73AB 0%, #2891C8 100%)' 
                                            : 'rgba(255, 255, 255, 0.6)',
                                        color: activeDateTab === tab.id ? '#ffffff' : '#475569',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* الصف السفلي: فلاتر مخصصة */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', alignItems: 'center' }}>
                        {/* فلتر التاريخ من */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>من تاريخ</label>
                            <input
                                type="date"
                                value={state.dateFrom}
                                onChange={(e) => {
                                    actions.setDateFrom(e.target.value);
                                    setActiveDateTab('all');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* فلتر التاريخ إلى */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>إلى تاريخ</label>
                            <input
                                type="date"
                                value={state.dateTo}
                                onChange={(e) => {
                                    actions.setDateTo(e.target.value);
                                    setActiveDateTab('all');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        {/* نوع الخدمة */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>نوع الخدمة</label>
                            <select
                                value={state.filterType}
                                onChange={(e) => actions.setFilterType(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <option value="الكل">كافة الأنواع</option>
                                {SERVICE_TYPES.map(t => (
                                    <option key={t.value} value={t.value}>{t.icon} {t.value}</option>
                                ))}
                            </select>
                        </div>

                        {/* العميل */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>العميل</label>
                            <select
                                value={state.filterClient}
                                onChange={(e) => actions.setFilterClient(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <option value="الكل">كافة العملاء</option>
                                {state.clientsList.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* الموظف */}
                        <div>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: '#64748b', marginBottom: '4px' }}>الموظف / المنفذ</label>
                            <select
                                value={state.filterEmployee}
                                onChange={(e) => actions.setFilterEmployee(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(28, 115, 171, 0.2)',
                                    background: 'rgba(255, 255, 255, 0.85)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    color: '#122946',
                                    boxSizing: 'border-box'
                                }}
                            >
                                <option value="الكل">كافة الموظفين والمناديب</option>
                                {state.employeesList.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* زر إعادة ضبط الفلاتر */}
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    actions.setGlobalSearch('');
                                    actions.setDateFrom('');
                                    actions.setDateTo('');
                                    actions.setFilterType('الكل');
                                    actions.setFilterClient('الكل');
                                    actions.setFilterEmployee('الكل');
                                    setActiveDateTab('all');
                                }}
                                style={{
                                    width: '100%',
                                    padding: '8px 14px',
                                    borderRadius: '10px',
                                    border: '1px dashed #cbd5e1',
                                    background: 'rgba(255, 255, 255, 0.6)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    color: '#64748b',
                                    cursor: 'pointer'
                                }}
                            >
                                🔄 إعادة ضبط
                            </button>
                        </div>
                    </div>
                </div>

                {/* 📋 3. جدول العمليات الخدمية الفاخر */}
                <div style={{
                    background: 'rgba(255, 255, 255, 0.75)',
                    backdropFilter: 'blur(30px) saturate(200%)',
                    border: '1px solid rgba(255, 255, 255, 0.6)',
                    borderRadius: '20px',
                    boxShadow: '0 8px 24px rgba(28, 115, 171, 0.06)',
                    overflow: 'hidden'
                }}>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            textAlign: 'right',
                            direction: 'rtl'
                        }}>
                            <thead>
                                <tr style={{
                                    background: 'linear-gradient(135deg, rgba(28, 115, 171, 0.08) 0%, rgba(40, 145, 200, 0.12) 100%)',
                                    borderBottom: '1px solid rgba(28, 115, 171, 0.15)'
                                }}>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>رقم وتاريخ العملية</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>نوع الخدمة</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>بيان وتفاصيل العملية</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>العميل / المستفيد</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>الموظف المنفذ</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>إجمالي الإيراد</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>عمولة الموظف</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>صافي ربح المؤسسة</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB' }}>القيد المحاسبي</th>
                                    <th style={{ padding: '16px 20px', fontSize: '12px', fontWeight: 900, color: '#1C73AB', textAlign: 'center' }}>إجراءات</th>
                                </tr>
                            </thead>
                            <tbody>
                                {state.paginatedOperations.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
                                            <div style={{ fontSize: '36px', marginBottom: '8px' }}>💼</div>
                                            <div style={{ fontWeight: 800, fontSize: '15px', color: '#122946' }}>
                                                لا توجد عمليات خدمية مسجلة بعد
                                            </div>
                                            <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 16px' }}>
                                                ابدأ بتسجيل أول عملية خدمية (إدارة، توصيل، استشارات) لتوليد القيود المحاسبية واحتساب الأرباح
                                            </p>
                                            <button
                                                type="button"
                                                onClick={() => actions.setIsModalOpen(true)}
                                                style={{
                                                    background: 'linear-gradient(135deg, #1C73AB 0%, #2891C8 100%)',
                                                    color: '#fff',
                                                    border: 'none',
                                                    padding: '10px 20px',
                                                    borderRadius: '12px',
                                                    fontWeight: 800,
                                                    fontSize: '13px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                ➕ تسجيل عملية جديدة الآن
                                            </button>
                                        </td>
                                    </tr>
                                ) : (
                                    state.paginatedOperations.map((op, idx) => (
                                        <tr
                                            key={op.id}
                                            style={{
                                                borderBottom: '1px solid rgba(226, 232, 240, 0.7)',
                                                background: idx % 2 === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(248, 250, 252, 0.4)',
                                                transition: 'background 0.2s'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(28, 115, 171, 0.04)'}
                                            onMouseLeave={(e) => e.currentTarget.style.background = idx % 2 === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(248, 250, 252, 0.4)'}
                                        >
                                            {/* رقم وتاريخ العملية */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 900, fontSize: '13px', color: '#1C73AB', fontFamily: 'monospace' }}>
                                                        #{op.id.slice(0, 8).toUpperCase()}
                                                    </span>
                                                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                                                        {formatDate(op.operation_date)}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* نوع الخدمة */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    padding: '5px 10px',
                                                    borderRadius: '10px',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    background: 'rgba(28, 115, 171, 0.1)',
                                                    color: '#1C73AB',
                                                    border: '1px solid rgba(28, 115, 171, 0.2)'
                                                }}>
                                                    {op.operation_type}
                                                </span>
                                            </td>

                                            {/* البيان */}
                                            <td style={{ padding: '16px 20px', maxWidth: '280px' }}>
                                                <div style={{
                                                    fontSize: '13px',
                                                    fontWeight: 700,
                                                    color: '#1e293b',
                                                    lineHeight: 1.4,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical'
                                                }}>
                                                    {op.description}
                                                </div>
                                            </td>

                                            {/* العميل */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                {op.client ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 800, fontSize: '13px', color: '#122946' }}>
                                                            {op.client.name}
                                                        </span>
                                                        {op.client.code && (
                                                            <span style={{ fontSize: '10px', color: '#64748b' }}>
                                                                كود: {op.client.code}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>-- عميل نقدي عام --</span>
                                                )}
                                            </td>

                                            {/* الموظف المنفذ */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                {op.employee ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                                                            👷 {op.employee.name}
                                                        </span>
                                                        <Link 
                                                            href={`/statement?partner_id=${op.employee.id}`}
                                                            style={{ fontSize: '10px', color: '#1C73AB', textDecoration: 'none', fontWeight: 700 }}
                                                        >
                                                            عرض كشف الحساب 🔗
                                                        </Link>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>إدارة الشركة</span>
                                                )}
                                            </td>

                                            {/* إجمالي الإيراد */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                <span style={{ fontWeight: 900, fontSize: '14px', color: '#1C73AB' }}>
                                                    {formatCurrency(op.total_amount)}
                                                </span>
                                            </td>

                                            {/* عمولة الموظف */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                {op.commission_amount > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <span style={{ fontWeight: 900, fontSize: '13px', color: '#b45309' }}>
                                                            {formatCurrency(op.commission_amount)}
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: '#d97706', fontWeight: 700 }}>
                                                            نسبة {op.commission_percentage}%
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>لا توجد عمولة</span>
                                                )}
                                            </td>

                                            {/* صافي ربح المؤسسة */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    fontWeight: 900,
                                                    fontSize: '14px',
                                                    color: '#15803d',
                                                    background: 'rgba(22, 163, 74, 0.1)',
                                                    padding: '4px 10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid rgba(22, 163, 74, 0.2)'
                                                }}>
                                                    {formatCurrency(op.net_profit)}
                                                </span>
                                            </td>

                                            {/* القيد المحاسبي */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap' }}>
                                                <Link 
                                                    href="/journal"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        background: 'linear-gradient(135deg, rgba(220, 252, 231, 0.8) 0%, rgba(187, 247, 208, 0.8) 100%)',
                                                        color: '#166534',
                                                        border: '1px solid rgba(22, 163, 74, 0.3)',
                                                        padding: '4px 10px',
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        textDecoration: 'none'
                                                    }}
                                                >
                                                    <span>قيد مركب مرحل ✅</span>
                                                </Link>
                                            </td>

                                            {/* الإجراءات */}
                                            <td style={{ padding: '16px 20px', whiteSpace: 'nowrap', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            actions.setSelectedRecord(op);
                                                            actions.setIsPrintModalOpen(true);
                                                        }}
                                                        title="طباعة سند العملية"
                                                        style={{
                                                            background: 'rgba(28, 115, 171, 0.1)',
                                                            border: '1px solid rgba(28, 115, 171, 0.25)',
                                                            color: '#1C73AB',
                                                            padding: '6px 12px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <span>🖨️</span>
                                                        <span>طباعة</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (confirm('هل أنت متأكد من رغبتك في حذف هذه العملية الخدمية وقيدها المحاسبي؟')) {
                                                                actions.deleteOperation(op);
                                                            }
                                                        }}
                                                        title="حذف العملية"
                                                        style={{
                                                            background: 'rgba(239, 68, 68, 0.1)',
                                                            border: '1px solid rgba(239, 68, 68, 0.25)',
                                                            color: '#ef4444',
                                                            padding: '6px 10px',
                                                            borderRadius: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: 800,
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                    >
                                                        <span>🗑️</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination */}
                    {state.totalPages > 1 && (
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderTop: '1px solid rgba(28, 115, 171, 0.1)',
                            flexWrap: 'wrap',
                            gap: '10px'
                        }}>
                            <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>
                                صفحة {state.currentPage} من {state.totalPages} (إجمالي {state.operations.length} عملية)
                            </span>

                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                    type="button"
                                    disabled={state.currentPage === 1}
                                    onClick={() => actions.setCurrentPage(state.currentPage - 1)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#fff',
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        cursor: state.currentPage === 1 ? 'not-allowed' : 'pointer',
                                        opacity: state.currentPage === 1 ? 0.5 : 1
                                    }}
                                >
                                    السابق
                                </button>
                                <button
                                    type="button"
                                    disabled={state.currentPage === state.totalPages}
                                    onClick={() => actions.setCurrentPage(state.currentPage + 1)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #cbd5e1',
                                        background: '#fff',
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        cursor: state.currentPage === state.totalPages ? 'not-allowed' : 'pointer',
                                        opacity: state.currentPage === state.totalPages ? 0.5 : 1
                                    }}
                                >
                                    التالي
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* مودال تسجيل عملية جديدة */}
            <ServiceOperationModal
                isOpen={state.isModalOpen}
                onClose={() => actions.setIsModalOpen(false)}
                onSave={actions.saveOperation}
                clients={state.clientsList}
                employees={state.employeesList}
                isSaving={actions.isSaving}
            />

            {/* مودال الطباعة والعرض */}
            <ServiceOperationPrintModal
                isOpen={state.isPrintModalOpen}
                onClose={() => actions.setIsPrintModalOpen(false)}
                operation={state.selectedRecord}
            />
        </MasterPage>
    );
}
