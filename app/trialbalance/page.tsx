"use client";
import React, { useMemo } from 'react';
import { useTrialBalanceLogic } from './trial_balance_logic';
import MasterPage from '@/components/MasterPage';
import LoadingScreen from '@/components/LoadingScreen';
import RawasiSidebarManager from '@/components/RawasiSidebarManager';
import { formatCurrency, formatDate } from '@/lib/helpers';

export default function TrialBalancePage() {
    const logic = useTrialBalanceLogic();

    const sidebarActions = useMemo(() => [
        <button 
            key="print_tb"
            type="button"
            onClick={() => window.print()}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm text-white bg-gradient-to-r from-[#C29B62] to-[#a48141] shadow-sm hover:brightness-105 transition-all flex items-center justify-center gap-2 cursor-pointer mb-2"
        >
            <span>🖨️</span>
            <span>طباعة الميزان الرسمي</span>
        </button>,

        <button 
            key="export_excel"
            type="button"
            onClick={logic.exportToExcel}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-sm text-[#1E130B] bg-white border border-[#C29B62]/40 shadow-sm hover:bg-[#FDFBF7] transition-all flex items-center justify-center gap-2 cursor-pointer mb-2"
        >
            <span>📊</span>
            <span>تصدير Excel</span>
        </button>,

        <button 
            key="refresh_tb"
            type="button"
            onClick={logic.fetchTrialBalance}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl font-black text-xs text-white bg-[#1E130B] hover:bg-[#2C1A12] border border-[#C29B62]/30 shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
            <span>🔄</span>
            <span>إعادة احتساب الأرصدة</span>
        </button>
    ], [logic.exportToExcel, logic.fetchTrialBalance]);

    return (
        <MasterPage 
            title="ميزان المراجعة (Trial Balance)" 
            subtitle="الرقابة المحاسبية ومطابقة اتزان الأرصدة وحركات الدفاتر - صيدلية تاج المودة البيطرية"
        >
            <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: '22px', width: '100%', paddingBottom: '50px' }}>
                
                {/* 1. مؤشر اتزان الميزان الملكي الفوري */}
                <div style={{
                    borderRadius: '16px',
                    padding: '16px 22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '14px',
                    background: logic.isBalanced ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)' : 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)',
                    border: `1.5px solid ${logic.isBalanced ? '#059669' : '#A8573C'}`,
                    boxShadow: '0 4px 16px rgba(30, 19, 11, 0.05)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{
                            width: '44px', height: '44px', borderRadius: '12px',
                            background: logic.isBalanced ? '#d1fae5' : '#fee2e2',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px'
                        }}>
                            {logic.isBalanced ? '⚖️' : '⚠️'}
                        </div>
                        <div>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: logic.isBalanced ? '#065f46' : '#991b1b' }}>
                                {logic.isBalanced ? 'ميزان المراجعة متزن محاسبياً بنسبة 100%' : 'تنبيه رقابي: يوجد عدم اتزان في ميزان المراجعة!'}
                            </div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', marginTop: '2px' }}>
                                {logic.isBalanced 
                                    ? 'إجمالي حركات وأرصدة المدين تطابق تماماً إجمالي الدائن دون أي فروق دفترية.'
                                    : `فارق الأرصدة الختامية: ${formatCurrency(logic.balanceDiff.endDiff)} | يرجى مراجعة القيود غير المتوازنة.`
                                }
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <div style={{ textAlign: 'left', fontSize: '12px', fontWeight: 800 }}>
                            <div style={{ color: '#059669' }}>إجمالي المدين: {formatCurrency(logic.totals.end_debit)}</div>
                            <div style={{ color: '#A8573C' }}>إجمالي الدائن: {formatCurrency(logic.totals.end_credit)}</div>
                        </div>
                        <span style={{
                            padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 900,
                            background: logic.isBalanced ? '#059669' : '#A8573C', color: '#FFFFFF'
                        }}>
                            {logic.isBalanced ? 'متزن ✓' : 'غير متزن ✕'}
                        </span>
                    </div>
                </div>

                {/* 2. شريط الفلاتر والبحث والمستويات المحاسبية */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '20px',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    padding: '20px 24px',
                    boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '18px' }}>📅</span>
                            <span style={{ fontSize: '14px', fontWeight: 900, color: '#1E130B' }}>
                                فترة الميزان والمستوى المحاسبي
                            </span>
                        </div>

                        {/* فترات سريعة */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => logic.setQuickDateRange('today')} className="quick-btn">اليوم</button>
                            <button type="button" onClick={() => logic.setQuickDateRange('this_month')} className="quick-btn">هذا الشهر</button>
                            <button type="button" onClick={() => logic.setQuickDateRange('quarter')} className="quick-btn">الربع الحالي</button>
                            <button type="button" onClick={() => logic.setQuickDateRange('year')} className="quick-btn">هذا العام</button>
                            <button type="button" onClick={() => logic.setQuickDateRange('all')} className="quick-btn">الكل</button>
                        </div>
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '14px',
                        alignItems: 'end'
                    }}>
                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                من تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={logic.startDate} 
                                onChange={e => logic.setStartDate(e.target.value)}
                                className="royal-tb-input" 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                إلى تاريخ
                            </label>
                            <input 
                                type="date" 
                                value={logic.endDate} 
                                onChange={e => logic.setEndDate(e.target.value)}
                                className="royal-tb-input" 
                            />
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                المستوى المحاسبي
                            </label>
                            <select 
                                value={logic.accountLevel} 
                                onChange={e => logic.setAccountLevel(e.target.value as any)}
                                className="royal-tb-input"
                            >
                                <option value="all">كل الحسابات التفصيلية</option>
                                <option value="1">المستوى 1 (الحسابات الرئيسية الكبرى)</option>
                                <option value="2">المستوى 2 (الحسابات المساعدة)</option>
                                <option value="3">المستوى 3 (الحسابات الفرعية)</option>
                            </select>
                        </div>

                        <div>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: '#786b59', display: 'block', marginBottom: '6px' }}>
                                بحث برقم أو اسم الحساب
                            </label>
                            <input 
                                type="text" 
                                placeholder="ابحث بالحساب أو الرمز..." 
                                value={logic.searchQuery} 
                                onChange={e => logic.setSearchQuery(e.target.value)}
                                className="royal-tb-input" 
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '4px' }}>
                        <input 
                            type="checkbox" 
                            id="hideZero" 
                            checked={logic.hideZeroBalances} 
                            onChange={e => logic.setHideZeroBalances(e.target.checked)}
                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#C29B62' }}
                        />
                        <label htmlFor="hideZero" style={{ fontSize: '12.5px', fontWeight: 800, color: '#1E130B', cursor: 'pointer' }}>
                            إخفاء الحسابات الصفرية (الحسابات التي ليس لها رصيد أو حركة خلال الفترة)
                        </label>
                        <span style={{ fontSize: '11px', color: '#9ca3af', marginRight: 'auto', fontWeight: 700 }}>
                            عدد الحسابات المعروضة: {logic.records.length} من أصل {logic.rawRecordsCount}
                        </span>
                    </div>
                </div>

                {/* 3. جدول ميزان المراجعة الملكي */}
                {logic.isLoading ? (
                    <LoadingScreen message="جاري إعداد ميزان المراجعة وتجميع القيود المحاسبية..." fullScreen={false} />
                ) : (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '20px',
                        border: '1px solid rgba(194, 155, 98, 0.25)',
                        boxShadow: '0 4px 20px rgba(30, 19, 11, 0.05)',
                        overflowX: 'auto',
                        padding: '8px'
                    }}>
                        <table className="royal-tb-table">
                            <thead>
                                <tr>
                                    <th rowSpan={2} style={{ width: '10%' }}>رقم الحساب</th>
                                    <th rowSpan={2} style={{ width: '30%' }}>اسم الحساب المحاسبي</th>
                                    <th colSpan={2} className="col-group-open">الرصيد الافتتاحي</th>
                                    <th colSpan={2} className="col-group-period">حركة الفترة</th>
                                    <th colSpan={2} className="col-group-end">الرصيد الختامي</th>
                                </tr>
                                <tr>
                                    <th className="sub-th th-debit">مدين</th>
                                    <th className="sub-th th-credit">دائن</th>
                                    <th className="sub-th th-debit">مدين</th>
                                    <th className="sub-th th-credit">دائن</th>
                                    <th className="sub-th th-debit">مدين</th>
                                    <th className="sub-th th-credit">دائن</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logic.records.map((r, i) => (
                                    <tr key={r.account_id || i} className="tb-row">
                                        <td className="font-mono font-bold text-center">{r.account_code}</td>
                                        <td className="account-name-cell">{r.account_name}</td>
                                        
                                        <td className="num-cell" style={{ color: r.opening_debit > 0 ? '#059669' : '#9ca3af' }}>
                                            {r.opening_debit > 0 ? formatCurrency(r.opening_debit) : '-'}
                                        </td>
                                        <td className="num-cell" style={{ color: r.opening_credit > 0 ? '#A8573C' : '#9ca3af' }}>
                                            {r.opening_credit > 0 ? formatCurrency(r.opening_credit) : '-'}
                                        </td>
                                        
                                        <td className="num-cell period-cell" style={{ color: r.period_debit > 0 ? '#059669' : '#9ca3af' }}>
                                            {r.period_debit > 0 ? formatCurrency(r.period_debit) : '-'}
                                        </td>
                                        <td className="num-cell period-cell" style={{ color: r.period_credit > 0 ? '#A8573C' : '#9ca3af' }}>
                                            {r.period_credit > 0 ? formatCurrency(r.period_credit) : '-'}
                                        </td>
                                        
                                        <td className="num-cell end-cell" style={{ color: r.ending_debit > 0 ? '#059669' : '#9ca3af' }}>
                                            {r.ending_debit > 0 ? formatCurrency(r.ending_debit) : '-'}
                                        </td>
                                        <td className="num-cell end-cell" style={{ color: r.ending_credit > 0 ? '#A8573C' : '#9ca3af' }}>
                                            {r.ending_credit > 0 ? formatCurrency(r.ending_credit) : '-'}
                                        </td>
                                    </tr>
                                ))}

                                {/* صف الإجماليات الشامل */}
                                <tr className="tb-grand-totals" style={{
                                    backgroundColor: logic.isBalanced ? '#fdfaf6' : '#fff1f2'
                                }}>
                                    <td colSpan={2} style={{ textAlign: 'left', paddingLeft: '24px', fontWeight: 900, color: '#1E130B', fontSize: '14px' }}>
                                        الإجمـــالي الكـــلي للميزان:
                                    </td>
                                    <td className="num-cell text-[#059669] font-black">{formatCurrency(logic.totals.op_debit)}</td>
                                    <td className="num-cell text-[#A8573C] font-black">{formatCurrency(logic.totals.op_credit)}</td>
                                    <td className="num-cell text-[#059669] font-black">{formatCurrency(logic.totals.per_debit)}</td>
                                    <td className="num-cell text-[#A8573C] font-black">{formatCurrency(logic.totals.per_credit)}</td>
                                    <td className="num-cell text-[#059669] font-black">{formatCurrency(logic.totals.end_debit)}</td>
                                    <td className="num-cell text-[#A8573C] font-black">{formatCurrency(logic.totals.end_credit)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                )}

            </div>

            <RawasiSidebarManager actions={sidebarActions} />

            {/* مساحة الطباعة الرسمية المعزولة (A4 Landscape) */}
            <div className="print-area" style={{ display: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '3px solid #1E130B', paddingBottom: '12px', marginBottom: '16px' }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#1E130B' }}>صيدلية تاج المودة البيطرية</h2>
                        <p style={{ margin: '4px 0 0 0', fontWeight: 800, fontSize: '14px', color: '#C29B62' }}>ميزان المراجعة المالي العام (Trial Balance)</p>
                        <p style={{ margin: '2px 0 0 0', fontWeight: 700, fontSize: '12px', color: '#6b7280' }}>
                            الفترة: من {logic.startDate ? formatDate(logic.startDate) : 'البداية'} إلى {logic.endDate ? formatDate(logic.endDate) : 'تاريخه'} | تاريخ الإصدار: {new Date().toLocaleDateString('ar-SA')}
                        </p>
                    </div>
                    <div style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#1E130B' }}>
                        <div>الحالة: {logic.isBalanced ? 'متزن محاسبياً 100%' : 'يوجد فرق تدقيق'}</div>
                        <div>العملة: ريال سعودي (SAR)</div>
                    </div>
                </div>

                <table className="print-tb-table">
                    <thead>
                        <tr>
                            <th rowSpan={2} style={{ width: '10%' }}>رقم الحساب</th>
                            <th rowSpan={2} style={{ width: '30%' }}>اسم الحساب</th>
                            <th colSpan={2}>الرصيد الافتتاحي</th>
                            <th colSpan={2}>حركة الفترة</th>
                            <th colSpan={2}>الرصيد الختامي</th>
                        </tr>
                        <tr>
                            <th>مدين</th><th>دائن</th>
                            <th>مدين</th><th>دائن</th>
                            <th>مدين</th><th>دائن</th>
                        </tr>
                    </thead>
                    <tbody>
                        {logic.records.map((r, i) => (
                            <tr key={i}>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>{r.account_code}</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{r.account_name}</td>
                                <td>{r.opening_debit > 0 ? formatCurrency(r.opening_debit) : '-'}</td>
                                <td>{r.opening_credit > 0 ? formatCurrency(r.opening_credit) : '-'}</td>
                                <td>{r.period_debit > 0 ? formatCurrency(r.period_debit) : '-'}</td>
                                <td>{r.period_credit > 0 ? formatCurrency(r.period_credit) : '-'}</td>
                                <td>{r.ending_debit > 0 ? formatCurrency(r.ending_debit) : '-'}</td>
                                <td>{r.ending_credit > 0 ? formatCurrency(r.ending_credit) : '-'}</td>
                            </tr>
                        ))}
                        <tr className="print-totals-row">
                            <td colSpan={2} style={{ textAlign: 'left', fontWeight: 900 }}>الإجمـــالي الكـــلي:</td>
                            <td>{formatCurrency(logic.totals.op_debit)}</td>
                            <td>{formatCurrency(logic.totals.op_credit)}</td>
                            <td>{formatCurrency(logic.totals.per_debit)}</td>
                            <td>{formatCurrency(logic.totals.per_credit)}</td>
                            <td>{formatCurrency(logic.totals.end_debit)}</td>
                            <td>{formatCurrency(logic.totals.end_credit)}</td>
                        </tr>
                    </tbody>
                </table>

                {/* توقيعات الاعتماد */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', fontSize: '13px', fontWeight: 900, padding: '0 30px' }}>
                    <div style={{ textAlign: 'center', width: '22%' }}>أعده / المحاسب المالي<div style={{ height: '40px' }}></div>..............................</div>
                    <div style={{ textAlign: 'center', width: '22%' }}>المراجعة والتدقيق<div style={{ height: '40px' }}></div>..............................</div>
                    <div style={{ textAlign: 'center', width: '22%' }}>المدير المالي<div style={{ height: '40px' }}></div>..............................</div>
                    <div style={{ textAlign: 'center', width: '22%' }}>اعتماد الإدارة العامة<div style={{ height: '40px' }}></div>..............................</div>
                </div>
            </div>

            <style>{`
                .quick-btn {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.3);
                    padding: 4px 12px; border-radius: 8px; font-size: 11.5px; font-weight: 800;
                    color: #786b59; cursor: pointer; transition: 0.2s;
                }
                .quick-btn:hover { background: #C29B62; color: #FFFFFF; border-color: #C29B62; }
                .royal-tb-input {
                    width: 100%; min-height: 44px; padding: 10px 14px; border-radius: 12px;
                    border: 1px solid rgba(194, 155, 98, 0.3); background: #FDFBF7;
                    color: #1E130B; outline: none; font-size: 13px; font-weight: 800;
                    transition: 0.2s;
                }
                .royal-tb-input:focus {
                    border-color: #C29B62; background: #FFFFFF;
                    box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.15);
                }
                .royal-tb-table {
                    width: 100%; border-collapse: collapse; text-align: center;
                    font-size: 13px; background: #FFFFFF;
                }
                .royal-tb-table th {
                    border: 1px solid rgba(194, 155, 98, 0.2); padding: 10px 8px;
                    font-weight: 900; background: #1E130B; color: #FFFFFF;
                }
                .royal-tb-table td {
                    border: 1px solid rgba(194, 155, 98, 0.15); padding: 9px 8px;
                }
                .col-group-open { background: #2C1A12 !important; }
                .col-group-period { background: #3E2419 !important; }
                .col-group-end { background: #1E130B !important; }
                .sub-th { font-size: 11.5px !important; }
                .th-debit { color: #6ee7b7 !important; }
                .th-credit { color: #fca5a5 !important; }
                .tb-row:hover { background-color: #fdfaf6; }
                .account-name-cell { text-align: right; font-weight: 800; color: #1E130B; }
                .num-cell { font-family: monospace; font-weight: 800; font-size: 12.5px; }
                .period-cell { background-color: rgba(194, 155, 98, 0.03); }
                .end-cell { background-color: rgba(194, 155, 98, 0.06); }
                .tb-grand-totals td {
                    border-top: 3px double #1E130B !important;
                    border-bottom: 3px double #1E130B !important;
                    font-size: 13.5px !important; padding: 12px 8px !important;
                }

                @media print {
                    @page { size: landscape; margin: 8mm; }
                    html, body { width: 100% !important; margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
                    .no-print { display: none !important; }
                    .print-area { display: block !important; width: 100% !important; direction: rtl; font-family: 'Cairo', sans-serif; }
                    .print-tb-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; text-align: center; }
                    .print-tb-table th, .print-tb-table td { border: 1px solid #1E130B; padding: 5px 4px; }
                    .print-tb-table thead th { background-color: #f5ede2 !important; color: #1E130B !important; font-weight: 900; -webkit-print-color-adjust: exact !important; }
                    .print-tb-table tr:nth-child(even) td { background-color: #faf7f2 !important; -webkit-print-color-adjust: exact !important; }
                    .print-totals-row td { background-color: #f0e6d5 !important; font-weight: 900 !important; -webkit-print-color-adjust: exact !important; }
                    tr { page-break-inside: avoid; }
                }
            `}</style>
        </MasterPage>
    );
}
