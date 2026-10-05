"use client";
import React, { useMemo, useEffect, useState, Suspense } from 'react';
import { useStatementLogic } from './statement_logic';
import MasterPage from '@/components/MasterPage';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import RawasiSmartTable from '@/components/rawasismarttable';
import SmartCombo from '@/components/SmartCombo';
import SecureAction from '@/components/SecureAction';
import { formatCurrency, formatDate } from '@/lib/helpers';
import StatementPrintModal from './StatementPrintModal'; 
import ExportLoadingModal from '@/components/ExportLoadingModal'; 

function PartnerStatementContent() {
    const logic = useStatementLogic();
    const [mounted, setMounted] = useState(false);
    
    // حالة التحكم في مودال الطباعة الرسمية
    const [isPrintOpen, setIsPrintOpen] = useState(false);
    const [selectedPartnerName, setSelectedPartnerName] = useState('');

    useEffect(() => { setMounted(true); }, []);

    // تحديد الفترات السريعة
    const setQuickDateRange = (range: 'today' | 'this_month' | 'quarter' | 'year' | 'all') => {
        const now = new Date();
        if (range === 'all') {
            logic.setDateFrom('');
            logic.setDateTo('');
            return;
        }
        if (range === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            logic.setDateFrom(todayStr);
            logic.setDateTo(todayStr);
            return;
        }
        if (range === 'this_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            logic.setDateFrom(start);
            logic.setDateTo(end);
            return;
        }
        if (range === 'quarter') {
            const qMonth = Math.floor(now.getMonth() / 3) * 3;
            const start = new Date(now.getFullYear(), qMonth, 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), qMonth + 3, 0).toISOString().split('T')[0];
            logic.setDateFrom(start);
            logic.setDateTo(end);
            return;
        }
        if (range === 'year') {
            const start = `${now.getFullYear()}-01-01`;
            const end = `${now.getFullYear()}-12-31`;
            logic.setDateFrom(start);
            logic.setDateTo(end);
            return;
        }
    };

    const isPeriodSelected = Boolean(logic.dateFrom || logic.dateTo);
    const summarySuffix = isPeriodSelected ? 'خلال الفترة' : '(تراكمي)';

    const columns = useMemo(() => [
        { 
            header: 'التاريخ', 
            accessor: 'date', 
            render: (row: any) => {
                if (!row) return null; 
                return <span style={{ fontWeight: 800, color: '#1E130B' }}>{row.date === '---' ? '---' : formatDate(row.date)}</span>;
            }
        },
        { 
            header: 'نوع السند', 
            accessor: 'v_type', 
            render: (row: any) => {
                if (!row) return null; 
                let badgeClass = 'bg-stone-100 text-stone-700 border-stone-200';
                if (row.v_type?.includes('صرف') || row.v_type?.includes('غرامة')) {
                    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200';
                } else if (row.v_type?.includes('قبض') || row.v_type?.includes('يومية')) {
                    badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200';
                } else if (row.v_type?.includes('فاتورة')) {
                    badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
                } else if (row.v_type?.includes('افتتاحي') || row.v_type?.includes('سابق')) {
                    badgeClass = 'bg-amber-100 text-[#C29B62] border-[#C29B62]/30 font-bold';
                }

                return (
                    <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black border ${badgeClass}`}>
                        {row.v_type || 'قيد'}
                    </span>
                );
            }
        },
        { 
            header: 'البيان والتفاصيل', 
            accessor: 'description', 
            render: (row: any) => {
                if (!row) return null; 
                return (
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: '#1E130B' }}>{row.description}</span>
                        {row.reference_id && (
                            <div style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 600 }}>مرجع: {row.reference_id}</div>
                        )}
                    </div>
                );
            }
        },
        { 
            header: 'مدين (عليه)', 
            accessor: 'debit', 
            render: (row: any) => {
                if (!row) return null; 
                return row.debit > 0 ? (
                    <strong style={{ color: '#A8573C', fontFamily: 'monospace', fontSize: '13px' }}>
                        {formatCurrency(row.debit)}
                    </strong>
                ) : <span style={{ color: '#9ca3af' }}>-</span>;
            }
        },
        { 
            header: 'دائن (له)', 
            accessor: 'credit', 
            render: (row: any) => {
                if (!row) return null; 
                return row.credit > 0 ? (
                    <strong style={{ color: '#059669', fontFamily: 'monospace', fontSize: '13px' }}>
                        {formatCurrency(row.credit)}
                    </strong>
                ) : <span style={{ color: '#9ca3af' }}>-</span>;
            }
        },
        { 
            header: 'الرصيد التراكمي', 
            accessor: 'balance', 
            render: (row: any) => {
                if (!row) return null; 
                const isPositive = row.balance >= 0;
                return (
                    <div style={{
                        background: isPositive ? 'rgba(5, 150, 105, 0.08)' : 'rgba(168, 87, 60, 0.08)',
                        border: `1px solid ${isPositive ? 'rgba(5, 150, 105, 0.25)' : 'rgba(168, 87, 60, 0.25)'}`,
                        padding: '4px 10px', borderRadius: '10px', fontWeight: 900, textAlign: 'center',
                        color: isPositive ? '#059669' : '#A8573C', fontFamily: 'monospace'
                    }}>
                        {formatCurrency(Math.abs(row.balance))}
                        <small style={{ marginRight: '6px', fontSize: '11px', fontWeight: 800 }}>
                            {isPositive ? '(له)' : '(عليه)'}
                        </small>
                    </div>
                );
            }
        }
    ], []);

    const tableData = useMemo(() => {
        if (!logic.partnerId || logic.isLoading) return [];
        const openingRow = { 
            id: 'opening', date: logic.dateFrom || '---', 
            description: '🔹 رصيد سابق منقول (ما قبل الفترة المحاسبية المختارة)', 
            v_type: 'رصيد افتتاحي', 
            debit: logic.openingBalance < 0 ? Math.abs(logic.openingBalance) : 0, 
            credit: logic.openingBalance > 0 ? logic.openingBalance : 0, 
            balance: logic.openingBalance 
        };
        return [openingRow, ...(logic.statementLines ?? [])];
    }, [logic.statementLines, logic.openingBalance, logic.isLoading, logic.partnerId, logic.dateFrom]);

    const partnerDisplayName = logic.partnerName || selectedPartnerName;

    const sidebarActions = useMemo(() => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button 
                type="button" 
                onClick={() => setIsPrintOpen(true)} 
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-[#C29B62] to-[#a48141] shadow-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!logic.partnerId}
            >
                <span>🖨️</span>
                <span>معاينة وطباعة الكشف (QR)</span>
            </button>

            <SecureAction module="statement" action="export">
                <button 
                    type="button" 
                    onClick={() => logic.exportToExcel(partnerDisplayName)} 
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm text-[#1E130B] bg-white border border-[#C29B62]/40 shadow-sm hover:bg-[#FDFBF7] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!logic.partnerId}
                >
                    <span>📊</span>
                    <span>تصدير Excel للشريك</span>
                </button>
            </SecureAction>

            <hr style={{ borderColor: 'rgba(194, 155, 98, 0.2)', margin: '4px 0' }} />

            <SecureAction module="statement" action="export">
                <button 
                    type="button" 
                    onClick={logic.downloadIndividualWorkerPDFs} 
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-xs text-white bg-[#1E130B] hover:bg-[#2C1A12] border border-[#C29B62]/30 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={logic.isExportingAll}
                >
                    <span>📦</span>
                    <span>{logic.isExportingAll ? '⏳ جاري المعالجة...' : 'تصدير كل الكشوفات (ZIP)'}</span>
                </button>
            </SecureAction>
        </div>
    ), [logic.partnerId, partnerDisplayName, logic.exportToExcel, logic.downloadIndividualWorkerPDFs, logic.isExportingAll]); 

    if (!mounted) return null;

    return (
        <MasterPage 
            title="كشف حساب الشركاء" 
            subtitle="تحليل مالي مفصل للعملاء والموردين والمناديب - صيدلية تاج المودة البيطرية"
        >
            <RawasiSidebarManager actions={sidebarActions} watchDeps={[logic.partnerId, logic.isExportingAll]} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%', paddingBottom: '40px' }}>
                
                {/* 1. لوحة التصفية والبحث الملكية */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    padding: '22px 24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    position: 'relative',
                    zIndex: 40
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>🔍</span>
                            <h3 style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', margin: 0 }}>
                                تصفية كشف الحساب وتحديد الشريك
                            </h3>
                        </div>

                        {/* فترات سريعة */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => setQuickDateRange('today')} className="quick-chip">اليوم</button>
                            <button type="button" onClick={() => setQuickDateRange('this_month')} className="quick-chip">هذا الشهر</button>
                            <button type="button" onClick={() => setQuickDateRange('quarter')} className="quick-chip">الربع الحالي</button>
                            <button type="button" onClick={() => setQuickDateRange('year')} className="quick-chip">هذا العام</button>
                            <button type="button" onClick={() => setQuickDateRange('all')} className="quick-chip">الكل</button>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '16px',
                        alignItems: 'end'
                    }}>
                        <div style={{ position: 'relative', zIndex: 50 }}>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                👤 الشريك (عميل / مورد / مندوب)
                            </label>
                            <SmartCombo 
                                label="" 
                                table="partners" 
                                displayCol="name" 
                                initialDisplay={logic.partnerName || logic.partnerId} 
                                onSelect={(v: any) => { 
                                    logic.setPartnerId(v?.id || ''); 
                                    setSelectedPartnerName(v?.name || ''); 
                                }} 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                📅 من تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={logic.dateFrom} 
                                onChange={e => logic.setDateFrom(e.target.value)}
                                className="royal-input" 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                📅 إلى تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={logic.dateTo} 
                                onChange={e => logic.setDateTo(e.target.value)}
                                className="royal-input" 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                🔎 بحث في بيان الحركات
                            </label>
                            <input 
                                type="text" 
                                placeholder="ابحث برقم الفاتورة أو البيان..." 
                                value={logic.globalSearch || ''} 
                                onChange={e => logic.setGlobalSearch(e.target.value)}
                                className="royal-input" 
                            />
                        </div>
                    </div>
                </div>

                {/* 2. بطاقات المؤشرات المالية التراكمية */}
                {logic.partnerId && (
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '16px'
                    }}>
                        {/* رصيد افتتاحي */}
                        <div className="summary-royal-card">
                            <span className="card-lbl">الرصيد الافتتاحي المنقول</span>
                            <span className={`card-val ${logic.openingBalance >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                                {formatCurrency(Math.abs(logic.openingBalance))}
                            </span>
                            <span className="card-sub">
                                {logic.openingBalance >= 0 ? 'رصيد دائن سابق (له)' : 'رصيد مدين سابق (عليه)'}
                            </span>
                        </div>

                        {/* إجمالي المدين (عليه) */}
                        <div className="summary-royal-card" style={{ borderBottom: '4px solid #A8573C' }}>
                            <span className="card-lbl">إجمالي المدين (عليه) {summarySuffix}</span>
                            <span className="card-val text-[#A8573C]">
                                {formatCurrency(logic.totalDebit)}
                            </span>
                            <span className="card-sub">فواتير ومسحوبات واستقطاعات</span>
                        </div>

                        {/* إجمالي الدائن (له) */}
                        <div className="summary-royal-card" style={{ borderBottom: '4px solid #059669' }}>
                            <span className="card-lbl">إجمالي الدائن (له) {summarySuffix}</span>
                            <span className="card-val text-emerald-700">
                                {formatCurrency(logic.totalCredit)}
                            </span>
                            <span className="card-sub">سندات قبض ومستحقات وتوريدات</span>
                        </div>

                        {/* الرصيد الختامي الصافي */}
                        <div className="summary-royal-card highlight-royal-card" style={{ borderBottom: '4px solid #C29B62' }}>
                            <span className="card-lbl font-black text-[#1E130B]">الرصيد الصافي النهائي</span>
                            <span className={`card-val big ${logic.currentBalance >= 0 ? 'text-emerald-700' : 'text-[#A8573C]'}`}>
                                {formatCurrency(Math.abs(logic.currentBalance))}
                            </span>
                            <span className="card-sub font-black text-[#1E130B]">
                                {logic.currentBalance >= 0 ? '✅ رصيد مستحق له (دائن)' : '⚠️ رصيد مستحق عليه (مدين)'}
                            </span>
                        </div>
                    </div>
                )}

                {/* 3. جدول الحركات أو موجه اختيار الشريك */}
                {!logic.partnerId ? (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        border: '1.5px dashed rgba(194, 155, 98, 0.35)',
                        padding: '80px 20px',
                        textAlign: 'center',
                        color: '#786b59'
                    }}>
                        <div style={{ fontSize: '56px', marginBottom: '14px' }}>📑</div>
                        <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#1E130B', marginBottom: '6px' }}>
                            يرجى اختيار شريك لعرض كشف حسابه التحليلي
                        </h3>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#9ca3af' }}>
                            يمكنك البحث باسم العميل، المورد، أو المندوب لمعاينة الأرصدة وتوليد الكشف المعتمد برمز QR.
                        </p>
                    </div>
                ) : (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        padding: '12px',
                        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                        overflowX: 'auto'
                    }}>
                        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(194, 155, 98, 0.15)', marginBottom: '8px' }}>
                            <div style={{ fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
                                سجل الحركات المحاسبية: <span style={{ color: '#C29B62' }}>{partnerDisplayName}</span>
                            </div>
                            <span style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 700 }}>
                                إجمالي القيود: {tableData.length} حركة
                            </span>
                        </div>
                        <RawasiSmartTable 
                            data={tableData} 
                            columns={columns} 
                            isLoading={logic.isLoading} 
                            enablePagination={false} 
                        />
                    </div>
                )}

            </div>

            {/* مودال الطباعة الملكي المعتمد برمز QR */}
            <StatementPrintModal 
                isOpen={isPrintOpen} 
                onClose={() => setIsPrintOpen(false)} 
                partnerName={partnerDisplayName}
                partnerType={logic.partnerType || 'شريك'}
                dateFrom={logic.dateFrom} 
                dateTo={logic.dateTo} 
                openingBalance={logic.openingBalance}
                currentBalance={logic.currentBalance} 
                totalDebit={logic.totalDebit} 
                totalCredit={logic.totalCredit}
                attendanceCount={logic.attendanceCount} 
                totalLaborAmount={logic.totalLaborAmount}
                totalPayments={logic.totalPayments} 
                totalViolations={logic.totalViolations} 
                statementLines={logic.statementLines} 
            />

            {/* مودال تنزيل الكشوفات الجماعية */}
            <ExportLoadingModal 
                isOpen={logic.isExportingAll} 
                progressText={logic.exportProgress} 
            />

            <style>{`
                .quick-chip {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 800;
                    color: #786b59; cursor: pointer; transition: 0.2s;
                }
                .quick-chip:hover {
                    background: #C29B62; color: #FFFFFF; border-color: #C29B62;
                }
                .royal-input {
                    width: 100%; min-height: 44px; padding: 10px 14px; border-radius: 12px;
                    border: 1px solid rgba(194, 155, 98, 0.3); background: #FDFBF7;
                    color: #1E130B; outline: none; font-size: 13px; font-weight: 800;
                    transition: 0.2s;
                }
                .royal-input:focus {
                    border-color: #C29B62; background: #FFFFFF;
                    box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.15);
                }
                .summary-royal-card {
                    background: #FFFFFF; border-radius: 16px; padding: 18px 20px;
                    border: 1px solid rgba(194, 155, 98, 0.25);
                    box-shadow: 0 4px 16px rgba(30, 19, 11, 0.04);
                    display: flex; flex-direction: column; justify-content: center;
                    transition: 0.2s;
                }
                .summary-royal-card:hover { transform: translateY(-2px); }
                .highlight-royal-card {
                    background: linear-gradient(135deg, #FFFFFF 0%, #FDFBF7 100%);
                    border: 1.5px solid #C29B62;
                }
                .card-lbl { font-size: 12px; font-weight: 800; color: #786b59; margin-bottom: 6px; }
                .card-val { font-size: 20px; font-weight: 900; font-family: monospace; }
                .card-val.big { font-size: 24px; }
                .card-sub { font-size: 11px; font-weight: 700; color: #9ca3af; margin-top: 4px; }
            `}</style>
        </MasterPage>
    );
}

export default function PartnerStatementPage() {
    return (
        <Suspense fallback={<div style={{ padding: '50px', textAlign: 'center', color: '#1E130B', fontWeight: 900 }}>جاري التحميل...</div>}>
            <PartnerStatementContent />
        </Suspense>
    );
}
