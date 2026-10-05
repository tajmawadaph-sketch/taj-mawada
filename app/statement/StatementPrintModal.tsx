"use client";
import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatCurrency, formatDate, tafqeet } from '@/lib/helpers';
import { QRCodeSVG } from 'qrcode.react';

interface StatementPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    partnerName: string;
    partnerType?: string;
    dateFrom: string;
    dateTo: string;
    openingBalance: number;
    currentBalance: number;
    totalDebit: number;
    totalCredit: number;
    attendanceCount?: number;
    totalLaborAmount?: number;
    totalViolations?: number;
    totalPayments?: number;
    statementLines: any[];
}

export default function StatementPrintModal({
    isOpen, onClose, partnerName, partnerType = 'شريك', dateFrom, dateTo,
    openingBalance, currentBalance, totalDebit, totalCredit, 
    attendanceCount = 0, totalLaborAmount = 0, totalViolations = 0, totalPayments = 0,
    statementLines = []
}: StatementPrintModalProps) {
    const printRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);
    const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (isOpen) document.body.style.overflow = 'hidden';
        else document.body.style.overflow = 'auto';
        return () => { document.body.style.overflow = 'auto'; };
    }, [isOpen]);

    if (!isOpen || !mounted) return null;

    const handlePrint = () => {
        const titleSafe = partnerName ? `كشف_حساب_${partnerName.replace(/\s+/g, '_')}` : 'كشف_حساب_شريك';
        document.title = titleSafe;
        window.print();
    };

    const safeLines = Array.isArray(statementLines) ? [...statementLines] : [];
    // Lines in chronological order for official statements
    const printLines = safeLines.slice().reverse();

    const isCreditBalance = currentBalance >= 0;
    const balanceAbsolute = Math.abs(currentBalance);
    const tafqeetText = tafqeet(balanceAbsolute);
    const balanceStatusLabel = isCreditBalance ? 'رصيد دائن مستحق له' : 'رصيد مدين مستحق عليه';

    // Official QR payload
    const qrPayload = JSON.stringify({
        org: "صيدلية تاج المودة البيطرية",
        doc: "كشف حساب شريك تحليلي",
        partner: partnerName || '---',
        type: partnerType,
        period: `${dateFrom || 'البداية'} إلى ${dateTo || 'تاريخه'}`,
        opening_bal: openingBalance.toFixed(2),
        total_debit: totalDebit.toFixed(2),
        total_credit: totalCredit.toFixed(2),
        closing_bal: currentBalance.toFixed(2),
        status: isCreditBalance ? "CREDIT" : "DEBIT",
        verified: true,
        issued_at: new Date().toISOString()
    });

    const modalContent = (
        <div className="statement-print-overlay">
            <div className="statement-print-modal">
                
                {/* شريط التحكم العلوي (غير مطبوع) */}
                <div className="no-print controls-bar">
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <button type="button" onClick={handlePrint} className="btn-royal-print">
                            🖨️ طباعة الكشف الرسمي
                        </button>
                        <button 
                            type="button" 
                            onClick={() => setPrintFormat(f => f === 'a4' ? 'thermal' : 'a4')} 
                            className="btn-royal-format"
                        >
                            {printFormat === 'a4' ? '🧾 التحويل للطباعة الحرارية (80mm)' : '📄 التحويل للطباعة الورقية (A4)'}
                        </button>
                    </div>
                    <button type="button" onClick={onClose} className="btn-royal-close">
                        إغلاق ✕
                    </button>
                </div>

                {printFormat === 'a4' ? (
                /* =================== تصميم ورقة A4 الملكية =================== */
                <div className="a4-sheet" ref={printRef} id="printable-statement">
                    
                    {/* ترويسة التقرير الملكية */}
                    <div className="royal-report-header">
                        <div className="company-meta">
                            <div className="brand-badge">
                                <span className="crown-icon">👑</span>
                                <span className="org-name">صيدلية تاج المودة البيطرية</span>
                            </div>
                            <div className="org-sub">سجل تجاري: 1010000000 | الرقم الضريبي: 310000000000003</div>
                            <div className="org-dept">إدارة الحسابات العامة والرقابة المالية - المملكة العربية السعودية</div>
                        </div>

                        <div className="qr-box-header">
                            <QRCodeSVG 
                                value={qrPayload} 
                                size={88} 
                                level="M" 
                                fgColor="#1E130B"
                                bgColor="#FFFFFF" 
                            />
                            <div className="qr-caption">كشف مالي مشفر ومعتمد</div>
                        </div>
                    </div>

                    <div className="gold-divider-line"></div>

                    {/* عنوان الكشف وتاريخ الإصدار */}
                    <div className="title-banner">
                        <div className="statement-heading">
                            <h2>كشف حساب مالي تحليلي</h2>
                            <span className="statement-code">STATEMENT LEDGER REPORT</span>
                        </div>
                        <div className="issue-meta">
                            <div><strong>تاريخ الإصدار:</strong> {new Date().toLocaleDateString('ar-SA')}</div>
                            <div><strong>وقت الطباعة:</strong> {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</div>
                        </div>
                    </div>

                    {/* بيانات الشريك والفترة */}
                    <div className="partner-details-card">
                        <div className="detail-item">
                            <label>اسم الشريك / الحساب:</label>
                            <span className="partner-name-highlight">{partnerName || '---'}</span>
                        </div>
                        <div className="detail-item">
                            <label>الفترة المحاسبية:</label>
                            <span>
                                {dateFrom ? `من ${formatDate(dateFrom)} ` : 'من بداية الحركات '}
                                {dateTo ? `إلى ${formatDate(dateTo)}` : 'حتى تاريخه'}
                            </span>
                        </div>
                        <div className="detail-item">
                            <label>العملة الرسمية:</label>
                            <span>ريال سعودي (SAR)</span>
                        </div>
                        <div className="detail-item">
                            <label>حالة الرصيد:</label>
                            <span className={`status-pill ${isCreditBalance ? 'credit' : 'debit'}`}>
                                {balanceStatusLabel}
                            </span>
                        </div>
                    </div>

                    {/* شبكة الأرصدة التراكمية */}
                    <div className="balances-summary-grid">
                        <div className="summary-box">
                            <span className="box-lbl">الرصيد الافتتاحي</span>
                            <span className={`box-val ${openingBalance >= 0 ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(Math.abs(openingBalance))}
                            </span>
                            <small className="box-hint">{openingBalance >= 0 ? '(له / دائن)' : '(عليه / مدين)'}</small>
                        </div>
                        <div className="summary-box">
                            <span className="box-lbl">إجمالي الحركات المدينة (عليه)</span>
                            <span className="box-val text-danger">{formatCurrency(totalDebit)}</span>
                            <small className="box-hint">المسحوبات والفواتير</small>
                        </div>
                        <div className="summary-box">
                            <span className="box-lbl">إجمالي الحركات الدائنة (له)</span>
                            <span className="box-val text-success">{formatCurrency(totalCredit)}</span>
                            <small className="box-hint">الدفعات والمستحقات</small>
                        </div>
                        <div className="summary-box highlight-box">
                            <span className="box-lbl">صافي الرصيد الختامي</span>
                            <span className={`box-val big ${isCreditBalance ? 'text-success' : 'text-danger'}`}>
                                {formatCurrency(balanceAbsolute)}
                            </span>
                            <small className="box-hint strong">{isCreditBalance ? '(مستحق له)' : '(مستحق عليه)'}</small>
                        </div>
                    </div>

                    {/* تفقيط المبلغ كتابياً */}
                    <div className="tafqeet-banner">
                        <span className="tafqeet-label">المبلغ كتابةً:</span>
                        <span className="tafqeet-text">فقط {tafqeetText} ريال سعودي لا غير {isCreditBalance ? '(رصيد مستحق له)' : '(رصيد مدين مستحق عليه)'}.</span>
                    </div>

                    {/* جدول الحركات التفصيلية */}
                    <table className="royal-statement-table">
                        <thead>
                            <tr>
                                <th style={{ width: '12%' }}>التاريخ</th>
                                <th style={{ width: '14%' }}>نوع السند</th>
                                <th style={{ width: '38%' }}>البيان والتفاصيل المحاسبية</th>
                                <th style={{ width: '12%' }}>مدين (عليه)</th>
                                <th style={{ width: '12%' }}>دائن (له)</th>
                                <th style={{ width: '12%' }}>الرصيد التراكمي</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* صف الرصيد الافتتاحي */}
                            <tr className="opening-balance-row">
                                <td style={{ fontWeight: 800 }}>{dateFrom ? formatDate(dateFrom) : '---'}</td>
                                <td><span className="badge-type gold">رصيد افتتاحي</span></td>
                                <td className="desc-text font-bold">🔹 رصيد سابق منقول ما قبل بداية الفترة</td>
                                <td className="num-col text-danger">{openingBalance < 0 ? formatCurrency(Math.abs(openingBalance)) : '-'}</td>
                                <td className="num-col text-success">{openingBalance > 0 ? formatCurrency(openingBalance) : '-'}</td>
                                <td className="num-col balance-col" dir="ltr" style={{ color: openingBalance >= 0 ? '#059669' : '#A8573C' }}>
                                    {formatCurrency(Math.abs(openingBalance))} {openingBalance >= 0 ? '(له)' : '(عليه)'}
                                </td>
                            </tr>

                            {/* صفوف الحركات */}
                            {printLines.map((line: any, idx: number) => (
                                <tr key={line.id || idx}>
                                    <td style={{ fontWeight: 700 }}>{formatDate(line.date)}</td>
                                    <td>
                                        <span className={`badge-type ${
                                            line.v_type?.includes('صرف') || line.v_type?.includes('غرامة') ? 'red' : 
                                            line.v_type?.includes('قبض') || line.v_type?.includes('يومية') ? 'green' : 'neutral'
                                        }`}>
                                            {line.v_type || 'قيد يومية'}
                                        </span>
                                    </td>
                                    <td className="desc-text">{line.description}</td>
                                    <td className="num-col" style={{ color: line.debit > 0 ? '#A8573C' : '#6b7280' }}>
                                        {line.debit > 0 ? formatCurrency(line.debit) : '-'}
                                    </td>
                                    <td className="num-col" style={{ color: line.credit > 0 ? '#059669' : '#6b7280' }}>
                                        {line.credit > 0 ? formatCurrency(line.credit) : '-'}
                                    </td>
                                    <td className="num-col balance-col" dir="ltr" style={{ color: line.balance >= 0 ? '#059669' : '#A8573C' }}>
                                        {formatCurrency(Math.abs(line.balance))} {line.balance >= 0 ? '(له)' : '(عليه)'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="totals-row">
                                <td colSpan={3} style={{ textAlign: 'left', paddingLeft: '20px', fontWeight: 900 }}>الإجماليات وحركة الفترة:</td>
                                <td className="num-col text-danger">{formatCurrency(totalDebit)}</td>
                                <td className="num-col text-success">{formatCurrency(totalCredit)}</td>
                                <td className="num-col balance-col" dir="ltr" style={{ color: isCreditBalance ? '#059669' : '#A8573C', fontWeight: 900 }}>
                                    {formatCurrency(balanceAbsolute)} {isCreditBalance ? '(له)' : '(عليه)'}
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* تواقيع الاعتماد الرسمية */}
                    <div className="royal-signatures-footer">
                        <div className="sig-item">
                            <span className="sig-title">المحاسب المالي</span>
                            <div className="sig-space"></div>
                            <span className="sig-dots">..............................</span>
                        </div>
                        <div className="sig-item">
                            <span className="sig-title">المراجعة والتدقيق</span>
                            <div className="sig-space"></div>
                            <span className="sig-dots">..............................</span>
                        </div>
                        <div className="sig-item">
                            <span className="sig-title">المدير المالي</span>
                            <div className="sig-space"></div>
                            <span className="sig-dots">..............................</span>
                        </div>
                        <div className="sig-item">
                            <span className="sig-title">مصادقة وتوقيع الشريك</span>
                            <div className="sig-space"></div>
                            <span className="sig-dots">..............................</span>
                        </div>
                    </div>

                    {/* تذييل الورقة */}
                    <div className="report-footer-note">
                        <span>صدر هذا الكشف رسمياً وآلياً بواسطة نظام تاج المودة ERP & POS - غير صالح بدون الاعتمادات الرسمية.</span>
                    </div>

                </div>
                ) : (
                /* =================== تصميم الإيصال الحراري 80mm =================== */
                <div className="thermal-receipt-container" id="printable-statement">
                    <div className="th-center">
                        <div className="th-title">صيدلية تاج المودة البيطرية</div>
                        <div className="th-sub">كشف حساب مالي مختصر</div>
                        <div className="th-dash">--------------------------------</div>
                    </div>

                    <div className="th-meta">
                        <div><strong>الجهة:</strong> {partnerName || '---'}</div>
                        <div><strong>الفترة:</strong> {dateFrom ? formatDate(dateFrom) : 'البداية'} إلى {dateTo ? formatDate(dateTo) : 'تاريخه'}</div>
                        <div><strong>تاريخ الطباعة:</strong> {new Date().toLocaleDateString('ar-SA')}</div>
                    </div>

                    <div className="th-dash">--------------------------------</div>

                    <div className="th-balances">
                        <div>الرصيد الافتتاحي: {formatCurrency(Math.abs(openingBalance))} {openingBalance >= 0 ? '(له)' : '(عليه)'}</div>
                        <div>إجمالي المدين (عليه): {formatCurrency(totalDebit)}</div>
                        <div>إجمالي الدائن (له): {formatCurrency(totalCredit)}</div>
                    </div>

                    <div className="th-dash">--------------------------------</div>

                    <table className="th-table">
                        <thead>
                            <tr>
                                <th>التاريخ</th>
                                <th>البيان</th>
                                <th>المبلغ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {printLines.map((line: any, idx: number) => {
                                const isCr = line.credit > 0;
                                const amt = isCr ? line.credit : line.debit;
                                return (
                                    <tr key={idx}>
                                        <td>{formatDate(line.date)}</td>
                                        <td style={{ textAlign: 'right' }}>{line.description}</td>
                                        <td dir="ltr">{amt.toFixed(2)} {isCr ? 'له' : 'عليه'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="th-dash">--------------------------------</div>

                    <div className="th-final">
                        <span>الرصيد الصافي:</span>
                        <span>{formatCurrency(balanceAbsolute)} {isCreditBalance ? '(له)' : '(عليه)'}</span>
                    </div>

                    <div className="th-tafqeet">
                        فقط {tafqeetText} ريال لا غير.
                    </div>

                    <div className="th-qr">
                        <QRCodeSVG value={qrPayload} size={90} level="M" />
                    </div>

                    <div className="th-footer">
                        نظام تاج المودة لإدارة الصيدليات والأسطول
                    </div>
                </div>
                )}

            </div>

            <style>{`
                .statement-print-overlay {
                    position: fixed; inset: 0; background: rgba(30, 19, 11, 0.88);
                    backdrop-filter: blur(8px); z-index: 9999999; display: flex;
                    justify-content: center; align-items: flex-start; overflow-y: auto;
                    padding: 30px 15px; direction: rtl; font-family: 'Cairo', sans-serif;
                }
                .statement-print-modal { width: 100%; max-width: 960px; }
                .controls-bar {
                    display: flex; justify-content: space-between; align-items: center;
                    margin-bottom: 20px; background: #FFFFFF; border: 1px solid rgba(194, 155, 98, 0.3);
                    padding: 14px 22px; border-radius: 16px; box-shadow: 0 8px 25px rgba(30, 19, 11, 0.12);
                    position: sticky; top: 10px; z-index: 100;
                }
                .btn-royal-print {
                    background: linear-gradient(135deg, #C29B62 0%, #a48141 100%); color: #FFFFFF;
                    border: none; padding: 10px 22px; border-radius: 12px; font-weight: 900;
                    font-size: 14px; cursor: pointer; transition: 0.2s; box-shadow: 0 4px 14px rgba(194, 155, 98, 0.35);
                    display: flex; align-items: center; gap: 8px;
                }
                .btn-royal-print:hover { transform: translateY(-1px); filter: brightness(1.06); }
                .btn-royal-format {
                    background: #FDFBF7; color: #1E130B; border: 1px solid rgba(194, 155, 98, 0.4);
                    padding: 10px 18px; border-radius: 12px; font-weight: 800; font-size: 13px;
                    cursor: pointer; transition: 0.2s;
                }
                .btn-royal-format:hover { background: #f7f2ea; }
                .btn-royal-close {
                    background: #fee2e2; color: #991b1b; border: 1px solid #fecaca;
                    padding: 10px 20px; border-radius: 12px; font-weight: 900; font-size: 14px;
                    cursor: pointer; transition: 0.2s;
                }
                .btn-royal-close:hover { background: #fecaca; }

                /* ================= A4 Sheet Styles ================= */
                .a4-sheet {
                    background: #FFFFFF; padding: 40px 45px; border-radius: 12px;
                    box-shadow: 0 20px 45px rgba(30, 19, 11, 0.2); min-height: 297mm;
                    color: #1E130B; margin-bottom: 40px; display: flex; flex-direction: column;
                }
                .royal-report-header { display: flex; justify-content: space-between; align-items: center; }
                .company-meta { display: flex; flex-direction: column; gap: 4px; }
                .brand-badge { display: flex; align-items: center; gap: 8px; }
                .crown-icon { font-size: 26px; }
                .org-name { font-size: 22px; font-weight: 900; color: #1E130B; }
                .org-sub { font-size: 12px; color: #6b7280; font-weight: 700; }
                .org-dept { font-size: 12px; color: #C29B62; font-weight: 800; }
                .qr-box-header { display: flex; flex-direction: column; align-items: center; gap: 4px; }
                .qr-caption { font-size: 10px; font-weight: 800; color: #6b7280; text-align: center; }
                .gold-divider-line {
                    height: 3px; background: linear-gradient(90deg, #1E130B, #C29B62, #1E130B);
                    margin: 18px 0; border-radius: 3px;
                }
                .title-banner { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 16px; }
                .statement-heading h2 { margin: 0; font-size: 22px; font-weight: 900; color: #1E130B; }
                .statement-code { font-size: 11px; font-weight: 800; color: #C29B62; letter-spacing: 1px; }
                .issue-meta { font-size: 11px; color: #4b5563; font-weight: 700; text-align: left; }
                .partner-details-card {
                    background: #FDFBF7; border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 14px 18px; border-radius: 12px; margin-bottom: 18px;
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;
                }
                .detail-item { display: flex; flex-direction: column; gap: 3px; }
                .detail-item label { font-size: 11px; font-weight: 800; color: #786b59; }
                .detail-item span { font-size: 14px; font-weight: 800; color: #1E130B; }
                .partner-name-highlight { font-size: 16px !important; font-weight: 900 !important; color: #1E130B !important; }
                .status-pill {
                    display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px;
                    font-weight: 900; width: fit-content;
                }
                .status-pill.credit { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
                .status-pill.debit { background: #fef2f2; color: #A8573C; border: 1px solid #fecaca; }

                .balances-summary-grid {
                    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px;
                }
                .summary-box {
                    background: #FFFFFF; border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 12px 14px; border-radius: 12px; text-align: center;
                    display: flex; flex-direction: column; justify-content: center;
                }
                .summary-box.highlight-box {
                    background: #FDFBF7; border: 2px solid #C29B62;
                    box-shadow: 0 4px 14px rgba(194, 155, 98, 0.15);
                }
                .box-lbl { font-size: 11px; color: #786b59; font-weight: 800; margin-bottom: 4px; }
                .box-val { font-size: 17px; font-weight: 900; }
                .box-val.big { font-size: 20px; }
                .box-hint { font-size: 10px; color: #9ca3af; font-weight: 700; margin-top: 2px; }
                .box-hint.strong { color: #1E130B; font-weight: 900; }
                .text-success { color: #059669; }
                .text-danger { color: #A8573C; }

                .tafqeet-banner {
                    background: #FDFBF7; border-right: 4px solid #C29B62; padding: 10px 16px;
                    border-radius: 8px; margin-bottom: 20px; font-size: 13px; font-weight: 800;
                    color: #1E130B; border-top: 1px solid rgba(194, 155, 98, 0.15);
                    border-bottom: 1px solid rgba(194, 155, 98, 0.15);
                }
                .tafqeet-label { color: #C29B62; margin-left: 6px; font-weight: 900; }

                .royal-statement-table {
                    width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 12px;
                }
                .royal-statement-table th {
                    background: #1E130B; color: #FFFFFF; font-weight: 900;
                    padding: 10px 8px; text-align: center; border: none; font-size: 12px;
                }
                .royal-statement-table td {
                    padding: 9px 8px; border-bottom: 1px solid #f1ece4;
                    text-align: center; color: #1E130B; font-size: 12px;
                }
                .royal-statement-table tbody tr:nth-child(even) td { background-color: #fdfaf6; }
                .opening-balance-row td { background-color: #faf5ee !important; border-bottom: 2px solid rgba(194, 155, 98, 0.3) !important; }
                .desc-text { text-align: right !important; font-weight: 800; color: #1E130B; }
                .num-col { font-family: monospace; font-weight: 900; font-size: 12px; }
                .balance-col { font-weight: 900; }
                .badge-type {
                    padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 900; display: inline-block;
                }
                .badge-type.red { background: #fee2e2; color: #991b1b; }
                .badge-type.green { background: #ecfdf5; color: #065f46; }
                .badge-type.gold { background: #fef3c7; color: #92400e; }
                .badge-type.neutral { background: #f3f4f6; color: #374151; }

                .totals-row td {
                    background: #faf5ee !important; border-top: 2px solid #1E130B !important;
                    border-bottom: 2px solid #1E130B !important; font-weight: 900 !important; font-size: 13px !important;
                }

                .royal-signatures-footer {
                    display: flex; justify-content: space-between; margin-top: auto;
                    padding-top: 35px; page-break-inside: avoid;
                }
                .sig-item { text-align: center; width: 22%; }
                .sig-title { font-size: 12px; font-weight: 900; color: #1E130B; }
                .sig-space { height: 45px; }
                .sig-dots { font-size: 11px; color: #9ca3af; }
                .report-footer-note {
                    margin-top: 25px; border-top: 1px dashed rgba(194, 155, 98, 0.3);
                    padding-top: 10px; text-align: center; font-size: 10px; color: #9ca3af; font-weight: 700;
                }

                /* ================= Thermal 80mm Styles ================= */
                .thermal-receipt-container {
                    width: 80mm; background: #FFFFFF; padding: 12px; margin: 0 auto;
                    color: #000000; font-family: 'Courier New', monospace; font-size: 12px;
                    font-weight: bold; text-align: center; direction: rtl; box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                }
                .th-title { font-size: 16px; font-weight: 900; }
                .th-sub { font-size: 12px; margin-top: 2px; }
                .th-dash { font-size: 11px; margin: 6px 0; }
                .th-meta { text-align: right; font-size: 11px; line-height: 1.5; }
                .th-balances { text-align: right; font-size: 11px; line-height: 1.5; }
                .th-table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 10px; }
                .th-table th, .th-table td { border-bottom: 1px dashed #000000; padding: 4px 1px; }
                .th-final { display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; margin-top: 6px; }
                .th-tafqeet { font-size: 10px; margin-top: 4px; text-align: right; }
                .th-qr { margin: 12px auto; display: flex; justify-content: center; }
                .th-footer { font-size: 9px; margin-top: 6px; }

                /* ================= Print Media Rules ================= */
                @media print {
                    @page { size: A4 portrait; margin: 8mm; }
                    html, body { width: 210mm !important; margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
                    .statement-print-overlay {
                        position: absolute !important; inset: 0 !important; background: #FFFFFF !important;
                        padding: 0 !important; margin: 0 !important; display: block !important;
                    }
                    .statement-print-modal { width: 100% !important; max-width: none !important; }
                    .no-print { display: none !important; }
                    #printable-statement {
                        box-shadow: none !important; border-radius: 0 !important;
                        padding: 0 !important; width: 100% !important; min-height: auto !important;
                    }
                    .royal-statement-table th { background-color: #1E130B !important; color: #FFFFFF !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .opening-balance-row td { background-color: #faf5ee !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .royal-statement-table tbody tr:nth-child(even) td { background-color: #fdfaf6 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    .totals-row td { background-color: #faf5ee !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    tr { page-break-inside: avoid; }
                }
            `}</style>
        </div>
    );

    return createPortal(modalContent, document.body);
}
