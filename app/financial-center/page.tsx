"use client";
import React from 'react';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import PrintHeader from '@/components/PrintHeader';
import { formatCurrency } from '@/lib/helpers';
import { QRCodeSVG } from 'qrcode.react';
import { useFinancialCenterLogic } from './financial_center_logic';

export default function FinancialCenterPage() {
    const {
        cashAndBankAccounts,
        totalLiquidCash,
        totalReceivables,
        totalPayables,
        totalInventory,
        workingCapital,
        currentRatio,
        quickRatio,
        financialFeed,
        isLoading,
        refetch,
        exportToExcel
    } = useFinancialCenterLogic();

    return (
        <MasterPage
            title="غرفة القيادة والتحكم بالمركز المالي والسيولة"
            subtitle="متابعة فورية للأرصدة النقدية، الحسابات البنكية، رأس المال العامل، ونسب الملاءة المالية"
            icon="💎"
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', direction: 'rtl', minHeight: '100vh', paddingBottom: '50px' }}>
                
                {/* Print Styles */}
                <style>{`
                    @media print {
                        .no-print { display: none !important; }
                        body { background: white !important; color: #1E130B !important; }
                        table { width: 100% !important; border-collapse: collapse !important; }
                        th, td { border: 1px solid #C29B62 !important; padding: 6px 10px !important; font-size: 11px !important; }
                    }
                    @media (max-width: 768px) {
                        .fc-kpi-grid { grid-template-columns: 1fr !important; }
                        .fc-main-grid { grid-template-columns: 1fr !important; }
                    }
                `}</style>

                <PrintHeader title="تقرير المركز المالي والسيولة النقدية" subtitle={`بتاريخ: ${new Date().toLocaleDateString('ar-SA')}`} />

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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '24px' }}>🏛️</span>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                لوحة القيادة التنفيذية للمركز المالي
                            </h2>
                            <span style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 700 }}>
                                تحديث تلقائي لحظي للسيولة والتدفقات
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={() => refetch()}
                            style={{
                                background: '#FDFBF7',
                                color: '#1E130B',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                padding: '10px 18px',
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
                            <span>تحديث فوري</span>
                            <span>🔄</span>
                        </button>
                        <button
                            onClick={() => window.print()}
                            style={{
                                background: '#FDFBF7',
                                color: '#1E130B',
                                border: '1px solid rgba(194, 155, 98, 0.35)',
                                padding: '10px 18px',
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
                            <span>طباعة المركز المالي</span>
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
                    <LoadingScreen message="جاري استطلاع أرصدة الصناديق والبنوك وحساب نسب السيولة..." />
                ) : (
                    <>
                        {/* 2. Top Luxury KPI Cards Grid */}
                        <div className="fc-kpi-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                            gap: '14px'
                        }}>
                            {/* Liquid Cash */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(5, 150, 105, 0.35)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(5, 150, 105, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>إجمالي السيولة الحاضرة</span>
                                    <span style={{ fontSize: '18px' }}>💵</span>
                                </div>
                                <div style={{ fontSize: '26px', fontWeight: 900, color: '#059669', marginTop: '8px' }}>
                                    {formatCurrency(totalLiquidCash)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    {cashAndBankAccounts.length} حسابات وبنوك وصناديق
                                </div>
                            </div>

                            {/* Working Capital */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1.5px solid rgba(194, 155, 98, 0.35)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#8c6b32' }}>رأس المال العامل (Working Capital)</span>
                                    <span style={{ fontSize: '18px' }}>⚖️</span>
                                </div>
                                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                                    {formatCurrency(workingCapital)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    الأصول المتداولة - الالتزامات المتداولة
                                </div>
                            </div>

                            {/* Trade Receivables */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#6e5d4f' }}>مستحقات العملاء (الذمم المدينة)</span>
                                    <span style={{ fontSize: '18px' }}>👥</span>
                                </div>
                                <div style={{ fontSize: '26px', fontWeight: 900, color: '#1E130B', marginTop: '8px' }}>
                                    {formatCurrency(totalReceivables)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#8c6b32', marginTop: '4px', fontWeight: 700 }}>
                                    مبالغ فواتير آجلة قيد التحصيل
                                </div>
                            </div>

                            {/* Trade Payables */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(168, 87, 60, 0.25)',
                                borderRadius: '16px',
                                padding: '18px 20px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#A8573C' }}>التزامات الموردين (الذمم الدائنة)</span>
                                    <span style={{ fontSize: '18px' }}>⏳</span>
                                </div>
                                <div style={{ fontSize: '26px', fontWeight: 900, color: '#A8573C', marginTop: '8px' }}>
                                    {formatCurrency(totalPayables)}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6e5d4f', marginTop: '4px', fontWeight: 700 }}>
                                    مستحقات واجبة السداد للموردين
                                </div>
                            </div>
                        </div>

                        {/* 3. Main Stage: Banks & Cash Breakdown + Financial Stream */}
                        <div className="fc-main-grid" style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                            gap: '24px'
                        }}>
                            {/* Column 1: Cash & Bank Accounts */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '20px',
                                padding: '22px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(194, 155, 98, 0.18)', paddingBottom: '12px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                            🏦 تفاصيل الصناديق النقدية والحسابات البنكية
                                        </h3>
                                        <span style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 600 }}>
                                            الرصيد الفعلي المتوفر في كل حساب مصرفي وخزينة
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>
                                        {formatCurrency(totalLiquidCash)}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {cashAndBankAccounts.map((acc, idx) => (
                                        <div
                                            key={acc.id || idx}
                                            style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '14px 18px',
                                                borderRadius: '14px',
                                                border: '1px solid rgba(194, 155, 98, 0.18)',
                                                background: acc.balance < 0 ? 'rgba(168, 87, 60, 0.05)' : '#FDFBF7'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '38px',
                                                    height: '38px',
                                                    borderRadius: '10px',
                                                    background: acc.type === 'bank' ? 'rgba(194, 155, 98, 0.15)' : 'rgba(5, 150, 105, 0.15)',
                                                    color: acc.type === 'bank' ? '#8c6b32' : '#059669',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: '18px'
                                                }}>
                                                    {acc.type === 'bank' ? '🏦' : '🪙'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 900, fontSize: '14px', color: '#1E130B' }}>
                                                        {acc.name}
                                                    </div>
                                                    <div style={{ fontSize: '12px', color: '#6e5d4f', fontFamily: 'monospace' }}>
                                                        {acc.code || '-'}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'left' }}>
                                                <div style={{ fontWeight: 900, fontSize: '15px', color: acc.balance >= 0 ? '#059669' : '#A8573C' }}>
                                                    {formatCurrency(acc.balance)}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 700 }}>
                                                    {acc.type === 'bank' ? 'حساب مصرفي' : 'صندوق كاشير'}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Financial Health Ratio Box */}
                                <div style={{
                                    marginTop: '20px',
                                    padding: '16px',
                                    borderRadius: '14px',
                                    background: '#FDFBF7',
                                    border: '1px solid rgba(194, 155, 98, 0.25)',
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ borderLeft: '1px solid rgba(194, 155, 98, 0.2)', paddingLeft: '8px' }}>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>نسبة التداول (Current Ratio)</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: currentRatio >= 1.5 ? '#059669' : '#C29B62', marginTop: '4px' }}>
                                            {currentRatio.toFixed(2)}x
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 600 }}>المعيار الآمن: &gt; 1.5</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: '#6e5d4f' }}>نسبة السيولة السريعة (Quick Ratio)</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: quickRatio >= 1.0 ? '#059669' : '#A8573C', marginTop: '4px' }}>
                                            {quickRatio.toFixed(2)}x
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#8c6b32', fontWeight: 600 }}>المعيار الآمن: &gt; 1.0</div>
                                    </div>
                                </div>
                            </div>

                            {/* Column 2: Financial Stream & Operations Feed */}
                            <div style={{
                                background: '#FFFFFF',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '20px',
                                padding: '22px',
                                boxShadow: '0 4px 20px rgba(30, 19, 11, 0.04)'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid rgba(194, 155, 98, 0.18)', paddingBottom: '12px' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                            ⚡ تدفق العمليات المالية اللحظية
                                        </h3>
                                        <span style={{ fontSize: '12px', color: '#6e5d4f', fontWeight: 600 }}>
                                            سجل مباشر للفواتير، سندات الصرف والقبض، والمصروفات
                                        </span>
                                    </div>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        padding: '4px 10px',
                                        borderRadius: '12px',
                                        background: 'rgba(5, 150, 105, 0.1)',
                                        color: '#059669'
                                    }}>
                                        متصل لحظياً ✓
                                    </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '520px', overflowY: 'auto' }}>
                                    {financialFeed.length === 0 ? (
                                        <div style={{ padding: '30px', textAlign: 'center', color: '#6e5d4f', fontWeight: 700 }}>
                                            لا توجد حركات مالية مسجلة حديثاً.
                                        </div>
                                    ) : (
                                        financialFeed.map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '12px 14px',
                                                    borderRadius: '12px',
                                                    border: '1px solid rgba(194, 155, 98, 0.12)',
                                                    background: idx % 2 === 0 ? '#FFFFFF' : '#FDFBF7'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '8px',
                                                        fontSize: '11px',
                                                        fontWeight: 900,
                                                        background: item.direction === 'in' ? 'rgba(5, 150, 105, 0.1)' : 'rgba(168, 87, 60, 0.1)',
                                                        color: item.direction === 'in' ? '#059669' : '#A8573C'
                                                    }}>
                                                        {item.direction === 'in' ? 'وارد' : 'منصرف'}
                                                    </span>
                                                    <div>
                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#1E130B' }}>
                                                            {item.description}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                                                            {item.date}
                                                        </div>
                                                    </div>
                                                </div>

                                                {item.amount > 0 && (
                                                    <div style={{ fontWeight: 900, fontSize: '14px', color: item.direction === 'in' ? '#059669' : '#A8573C' }}>
                                                        {item.direction === 'in' ? '+' : '-'}{formatCurrency(item.amount)}
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Official Signatures & QR Code for Print */}
                        <div className="print-footer" style={{ display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '50px', padding: '0 30px', direction: 'rtl' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>المحاسب المسؤول</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '150px', margin: '0 auto', paddingTop: '6px', fontSize: '11px', color: '#6e5d4f' }}>التوقيع والتاريخ</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>المدير المالي (CFO)</div>
                                <div style={{ borderTop: '1px solid #C29B62', width: '150px', margin: '0 auto', paddingTop: '6px', fontSize: '11px', color: '#6e5d4f' }}>الاعتماد والمصادقة</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B', marginBottom: '35px' }}>ختم صيدلية تاج المودة</div>
                                <div style={{ border: '2px dashed #C29B62', width: '90px', height: '55px', margin: '0 auto', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#8c6b32' }}>مكان الختم</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <QRCodeSVG 
                                    value={JSON.stringify({
                                        org: "صيدلية تاج المودة البيطرية",
                                        doc: "تقرير المركز المالي والسيولة",
                                        liquid_cash: totalLiquidCash.toFixed(2),
                                        receivables: totalReceivables.toFixed(2),
                                        payables: totalPayables.toFixed(2),
                                        inventory: totalInventory.toFixed(2),
                                        working_capital: workingCapital.toFixed(2),
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
