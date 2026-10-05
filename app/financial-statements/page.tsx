"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency, tafqeet } from '@/lib/helpers';
import { QRCodeSVG } from 'qrcode.react';
import { useFinancialStatementsLogic, FinancialAccountRow } from './financial_statements_logic';

export default function FinancialStatementsPage() {
    const {
        startDate, setStartDate,
        endDate, setEndDate,
        activeTab, setActiveTab,
        setPeriodPreset,
        revenues, expenses, totalRevenues, totalExpenses, netProfit, grossProfitMargin,
        currentAssets, fixedAssets, totalAssets,
        currentLiabilities, longTermLiabilities, totalLiabilities,
        equityItems, totalEquity, totalLiabilitiesAndEquity,
        isBalanced, balanceDiff,
        isLoading, refetch, exportToExcel
    } = useFinancialStatementsLogic();

    const renderAccountTable = (title: string, icon: string, items: FinancialAccountRow[], total: number, totalColor = '#1E130B') => {
        return (
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                border: '1px solid rgba(194, 155, 98, 0.22)',
                boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                overflow: 'hidden',
                marginBottom: '18px'
            }}>
                <div style={{
                    padding: '14px 20px',
                    background: '#FDFBF7',
                    borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{icon}</span>
                        <span>{title}</span>
                    </h3>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#8c6b32' }}>
                        {items.length} حسابات
                    </span>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                        <thead>
                            <tr style={{ background: 'rgba(194, 155, 98, 0.06)', borderBottom: '1px solid rgba(194, 155, 98, 0.15)' }}>
                                <th style={{ padding: '10px 18px', color: '#8c6b32', fontWeight: 800, width: '120px' }}>كود الحساب</th>
                                <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 800 }}>اسم الحساب</th>
                                <th style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 800, textAlign: 'left', width: '180px' }}>الرصيد (SAR)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan={3} style={{ padding: '25px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                                        لا توجد حركات مسجلة تحت هذا القسم خلال الفترة.
                                    </td>
                                </tr>
                            ) : (
                                items.map((acc, idx) => (
                                    <tr
                                        key={acc.id || idx}
                                        style={{
                                            borderBottom: '1px solid rgba(194, 155, 98, 0.08)',
                                            background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                        }}
                                    >
                                        <td style={{ padding: '10px 18px', color: '#6e5d4f', fontWeight: 700, fontFamily: 'monospace' }}>
                                            {acc.code || '-'}
                                        </td>
                                        <td style={{ padding: '10px 18px', color: '#1E130B', fontWeight: 800 }}>
                                            {acc.name}
                                        </td>
                                        <td style={{ padding: '10px 18px', fontWeight: 900, textAlign: 'left', color: totalColor }}>
                                            {formatCurrency(acc.balance)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#FDFBF7', borderTop: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                <td colSpan={2} style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
                                    إجمالي {title}
                                </td>
                                <td style={{ padding: '12px 18px', fontWeight: 900, textAlign: 'left', fontSize: '15px', color: totalColor }}>
                                    {formatCurrency(total)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <MasterPage
            title="القوائم المالية والحسابات الختامية"
            subtitle="قائمة الدخل التراكمية والمركز المالي المتوازن وفق معايير المحاسبة السعودية"
            icon="🏛️"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
                
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
                        .stat-filter-row { flex-direction: column !important; }
                        .stat-kpi-grid { grid-template-columns: 1fr !important; }
                        .stat-dual-grid { grid-template-columns: 1fr !important; }
                    }
                `}</style>

                <PrintHeader title="القوائم المالية الرسمية والمركز المالي" subtitle={`عن الفترة من ${startDate} إلى ${endDate}`} />

                {/* 1. Filter Toolbar */}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                        {/* Preset buttons */}
                        <div style={{ display: 'flex', background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', borderRadius: '12px', padding: '3px' }}>
                            <button
                                onClick={() => setPeriodPreset('this_year')}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: '#C29B62',
                                    color: '#FFFFFF',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    minHeight: '38px'
                                }}
                            >
                                السنة الحالية
                            </button>
                            <button
                                onClick={() => setPeriodPreset('this_quarter')}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#6e5d4f',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    minHeight: '38px'
                                }}
                            >
                                الربع الحالي
                            </button>
                            <button
                                onClick={() => setPeriodPreset('this_month')}
                                style={{
                                    padding: '6px 14px',
                                    borderRadius: '9px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: '#6e5d4f',
                                    fontWeight: 800,
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    minHeight: '38px'
                                }}
                            >
                                الشهر الحالي
                            </button>
                        </div>

                        {/* Date Pickers */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>من:</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    minHeight: '40px'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إلى:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    border: '1px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    minHeight: '40px'
                                }}
                            />
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => refetch()}
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
                            <span>تحديث الأرقام</span>
                            <span>🔄</span>
                        </button>
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
                            <span>طباعة رسمية A4</span>
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
                            <span>📑</span>
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <LoadingScreen message="جاري استخراج ميزان المراجعة وتوليد القوائم المالية المتوازنة..." />
                ) : (
                    <>
                        {/* 2. Top Luxury KPI Cards Grid */}
                        <div className="stat-kpi-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '14px'
                        }}>
                            {/* Revenues */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(194, 155, 98, 0.3)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي الإيرادات للفترة</span>
                                    <span style={{ fontSize: '18px' }}>📈</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                                    {formatCurrency(totalRevenues)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
                                    مبيعات وإيرادات تشغيلية
                                </div>
                            </div>

                            {/* Expenses */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.2)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>إجمالي المصروفات للفترة</span>
                                    <span style={{ fontSize: '18px' }}>📉</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#6e5d4f', marginTop: '8px' }}>
                                    {formatCurrency(totalExpenses)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', fontWeight: 700 }}>
                                    تكاليف ومصروفات تشغيلية وعمومية
                                </div>
                            </div>

                            {/* Net Income */}
                            <div style={{
                                background: '#FFFFFF',
                                border: `1.5px solid ${netProfit >= 0 ? 'rgba(5, 150, 105, 0.3)' : 'rgba(168, 87, 60, 0.3)'}`,
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: netProfit >= 0 ? '#059669' : '#A8573C' }}>
                                        {netProfit >= 0 ? 'صافي الربح للفترة' : 'صافي الخسارة للفترة'}
                                    </span>
                                    <span style={{ fontSize: '18px' }}>✨</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: netProfit >= 0 ? '#059669' : '#A8573C', marginTop: '8px' }}>
                                    {formatCurrency(Math.abs(netProfit))}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    هامش الربح الصافي: {grossProfitMargin.toFixed(1)}%
                                </div>
                            </div>

                            {/* Balance Sheet Status */}
                            <div style={{
                                background: '#FFFFFF',
                                border: `1.5px solid ${isBalanced ? 'rgba(5, 150, 105, 0.35)' : 'rgba(168, 87, 60, 0.35)'}`,
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: isBalanced ? '#059669' : '#A8573C' }}>
                                        {isBalanced ? 'الميزانية متزنة 100%' : 'فارق توازن الميزانية'}
                                    </span>
                                    <span style={{ fontSize: '18px' }}>⚖️</span>
                                </div>
                                <div style={{ fontSize: '24px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                                    {formatCurrency(totalAssets)}
                                </div>
                                <div style={{ fontSize: '12px', color: isBalanced ? '#059669' : '#A8573C', marginTop: '4px', fontWeight: 700 }}>
                                    {isBalanced ? 'الأصول = الالتزامات + حقوق الملكية' : `فارق: ${formatCurrency(balanceDiff)}`}
                                </div>
                            </div>
                        </div>

                        {/* 3. Navigation Tabs */}
                        <div className="no-print" style={{
                            display: 'flex',
                            gap: '10px',
                            borderBottom: '2px solid rgba(194, 155, 98, 0.2)',
                            paddingBottom: '8px'
                        }}>
                            <button
                                onClick={() => setActiveTab('both')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: activeTab === 'both' ? '#1E130B' : '#FDFBF7',
                                    color: activeTab === 'both' ? '#FFFFFF' : '#6e5d4f',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                عرض القوائم معاً ⚖️
                            </button>
                            <button
                                onClick={() => setActiveTab('income')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: activeTab === 'income' ? '#C29B62' : '#FDFBF7',
                                    color: activeTab === 'income' ? '#FFFFFF' : '#6e5d4f',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                قائمة الدخل (Income Statement) 📈
                            </button>
                            <button
                                onClick={() => setActiveTab('balance')}
                                style={{
                                    padding: '10px 20px',
                                    borderRadius: '12px',
                                    border: 'none',
                                    background: activeTab === 'balance' ? '#8c6b32' : '#FDFBF7',
                                    color: activeTab === 'balance' ? '#FFFFFF' : '#6e5d4f',
                                    fontWeight: 900,
                                    fontSize: '14px',
                                    cursor: 'pointer'
                                }}
                            >
                                المركز المالي والميزانية العمومية (Balance Sheet) 🏛️
                            </button>
                        </div>

                        {/* 4. Financial Statements Main Stage */}
                        <div className="stat-dual-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: activeTab === 'both' ? 'repeat(auto-fit, minmax(450px, 1fr))' : '1fr',
                            gap: '24px'
                        }}>
                            {/* Column A: Income Statement */}
                            {(activeTab === 'both' || activeTab === 'income') && (
                                <div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '16px',
                                        padding: '12px 18px',
                                        background: '#FFFFFF',
                                        border: '1px solid rgba(194, 155, 98, 0.25)',
                                        borderRadius: '14px'
                                    }}>
                                        <span style={{ fontSize: '20px' }}>📈</span>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                                قائمة الدخل والأرباح والخسائر
                                            </h2>
                                            <span style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 600 }}>
                                                عن الفترة من {startDate} إلى {endDate}
                                            </span>
                                        </div>
                                    </div>

                                    {renderAccountTable('الإيرادات (Revenues)', '💰', revenues, totalRevenues, '#059669')}
                                    {renderAccountTable('المصروفات (Expenses)', '🧾', expenses, totalExpenses, '#6e5d4f')}

                                    {/* Net Income Summary Card */}
                                    <div style={{
                                        background: netProfit >= 0 ? 'rgba(5, 150, 105, 0.08)' : 'rgba(168, 87, 60, 0.08)',
                                        border: `1.5px solid ${netProfit >= 0 ? '#059669' : '#A8573C'}`,
                                        borderRadius: '16px',
                                        padding: '20px',
                                        textAlign: 'center',
                                        marginTop: '10px'
                                    }}>
                                        <div style={{ fontSize: '14px', fontWeight: 900, color: netProfit >= 0 ? '#059669' : '#A8573C' }}>
                                            {netProfit >= 0 ? 'صافي الربح التشغيلي (Net Income)' : 'صافي الخسارة (Net Loss)'}
                                        </div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: netProfit >= 0 ? '#059669' : '#A8573C', marginTop: '6px' }}>
                                            {formatCurrency(Math.abs(netProfit))}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 700, marginTop: '4px' }}>
                                            نسبة صافي الربح من الإيرادات: {grossProfitMargin.toFixed(1)}%
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Column B: Balance Sheet */}
                            {(activeTab === 'both' || activeTab === 'balance') && (
                                <div>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '10px',
                                        marginBottom: '16px',
                                        padding: '12px 18px',
                                        background: '#FFFFFF',
                                        border: '1px solid rgba(194, 155, 98, 0.25)',
                                        borderRadius: '14px'
                                    }}>
                                        <span style={{ fontSize: '20px' }}>🏛️</span>
                                        <div>
                                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                                الميزانية العمومية والمركز المالي
                                            </h2>
                                            <span style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 600 }}>
                                                كما في تاريخ {endDate}
                                            </span>
                                        </div>
                                    </div>

                                    {/* 1. Assets */}
                                    {renderAccountTable('الأصول المتداولة (Current Assets)', '💵', currentAssets, currentAssets.reduce((s, a) => s + a.balance, 0), '#1E130B')}
                                    {renderAccountTable('الأصول غير المتداولة / الثابتة (Fixed Assets)', '🏢', fixedAssets, fixedAssets.reduce((s, a) => s + a.balance, 0), '#1E130B')}

                                    <div style={{
                                        background: '#FDFBF7',
                                        border: '1px solid rgba(194, 155, 98, 0.3)',
                                        borderRadius: '12px',
                                        padding: '12px 20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginBottom: '18px'
                                    }}>
                                        <span style={{ fontWeight: 900, color: '#8c6b32', fontSize: '14px' }}>إجمالي الأصول (Total Assets):</span>
                                        <span style={{ fontWeight: 900, color: '#1E130B', fontSize: '16px' }}>{formatCurrency(totalAssets)}</span>
                                    </div>

                                    {/* 2. Liabilities */}
                                    {renderAccountTable('الالتزامات المتداولة (Current Liabilities)', '⏳', currentLiabilities, currentLiabilities.reduce((s, l) => s + l.balance, 0), '#A8573C')}
                                    {renderAccountTable('الالتزامات طويلة الأجل (Long-term Liabilities)', '🏦', longTermLiabilities, longTermLiabilities.reduce((s, l) => s + l.balance, 0), '#A8573C')}

                                    {/* 3. Equity with Period Net Income */}
                                    <div style={{
                                        background: '#FFFFFF',
                                        borderRadius: '16px',
                                        border: '1px solid rgba(194, 155, 98, 0.22)',
                                        boxShadow: '0 4px 18px rgba(30, 19, 11, 0.04)',
                                        overflow: 'hidden',
                                        marginBottom: '18px'
                                    }}>
                                        <div style={{
                                            padding: '14px 20px',
                                            background: '#FDFBF7',
                                            borderBottom: '1.5px solid rgba(194, 155, 98, 0.2)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}>
                                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 900, color: '#1E130B' }}>
                                                🛡️ حقوق الملكية (Owner's Equity)
                                            </h3>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                            <tbody>
                                                {equityItems.map((eq, idx) => (
                                                    <tr key={eq.id || idx} style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)' }}>
                                                        <td style={{ padding: '10px 18px', color: '#6e5d4f', fontFamily: 'monospace' }}>{eq.code}</td>
                                                        <td style={{ padding: '10px 18px', fontWeight: 800, color: '#1E130B' }}>{eq.name}</td>
                                                        <td style={{ padding: '10px 18px', fontWeight: 900, textAlign: 'left', color: '#1E130B' }}>{formatCurrency(eq.balance)}</td>
                                                    </tr>
                                                ))}
                                                <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.08)', background: 'rgba(194, 155, 98, 0.06)' }}>
                                                    <td style={{ padding: '10px 18px', color: '#8c6b32', fontFamily: 'monospace' }}>INC-P</td>
                                                    <td style={{ padding: '10px 18px', fontWeight: 900, color: '#8c6b32' }}>صافي ربح / (خسارة) الفترة الحالية</td>
                                                    <td style={{ padding: '10px 18px', fontWeight: 900, textAlign: 'left', color: netProfit >= 0 ? '#059669' : '#A8573C' }}>
                                                        {formatCurrency(netProfit)}
                                                    </td>
                                                </tr>
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#FDFBF7', borderTop: '2px solid rgba(194, 155, 98, 0.25)' }}>
                                                    <td colSpan={2} style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B' }}>
                                                        إجمالي حقوق الملكية
                                                    </td>
                                                    <td style={{ padding: '12px 18px', fontWeight: 900, textAlign: 'left', fontSize: '15px', color: '#8c6b32' }}>
                                                        {formatCurrency(totalEquity)}
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>

                                    {/* Liabilities and Equity Balance Check Card */}
                                    <div style={{
                                        background: '#FFFFFF',
                                        border: `2px solid ${isBalanced ? '#059669' : '#A8573C'}`,
                                        borderRadius: '16px',
                                        padding: '18px 22px',
                                        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.06)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 900, fontSize: '15px', color: '#1E130B' }}>
                                                إجمالي الالتزامات وحقوق الملكية:
                                            </span>
                                            <span style={{ fontWeight: 900, fontSize: '18px', color: '#1E130B' }}>
                                                {formatCurrency(totalLiabilitiesAndEquity)}
                                            </span>
                                        </div>
                                        <div style={{
                                            marginTop: '10px',
                                            padding: '8px 12px',
                                            borderRadius: '8px',
                                            background: isBalanced ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                                            color: isBalanced ? '#059669' : '#A8573C',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            textAlign: 'center'
                                        }}>
                                            {isBalanced ? '✓ الميزانية العمومية متوازنة تماماً وفق المعايير المحاسبية المعتمدة' : `⚠️ يوجد فارق توازن قدره ${formatCurrency(balanceDiff)}`}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Official Signatures & Digital Verification for A4 Print */}
                        <div className="print-footer" style={{ display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '50px', padding: '0 30px', direction: 'rtl' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>المحاسب المسؤول</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '150px', margin: '0 auto', paddingTop: '6px', fontSize: '11px', color: '#6e5d4f' }}>التوقيع والتاريخ</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>المدير المالي (CFO)</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '150px', margin: '0 auto', paddingTop: '6px', fontSize: '11px', color: '#6e5d4f' }}>الاعتماد الرسمي</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>ختم المنشأة الرسمي</div>
                                <div style={{ border: '2px dashed #C29B62', width: '90px', height: '55px', margin: '0 auto', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#8c6b32' }}>مكان الختم</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <QRCodeSVG 
                                    value={JSON.stringify({
                                        org: "صيدلية تاج المودة البيطرية",
                                        doc: "القوائم المالية والمركز المالي",
                                        period: `${startDate} إلى ${endDate}`,
                                        revenues: totalRevenues.toFixed(2),
                                        expenses: totalExpenses.toFixed(2),
                                        net_profit: netProfit.toFixed(2),
                                        assets: totalAssets.toFixed(2),
                                        balanced: isBalanced,
                                        issued_at: new Date().toISOString()
                                    })} 
                                    size={75} 
                                    level="M" 
                                    fgColor="#1E130B" 
                                />
                                <span style={{ fontSize: '9px', fontWeight: 800, color: '#6e5d4f' }}>توثيق رقمي معتمد</span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </MasterPage>
    );
}
