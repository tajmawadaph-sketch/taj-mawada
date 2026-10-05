"use client";
import React, { useState, useEffect } from 'react';
import { formatCurrency, formatDate, tafqeet } from '@/lib/helpers';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '@/lib/supabase';

interface ReceiptPrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: any;
}

export default function ReceiptPrintModal({ isOpen, onClose, record }: ReceiptPrintModalProps) {
    const [mounted, setMounted] = useState(false);
    const [creatorInfo, setCreatorInfo] = useState<{ fullName: string }>({ fullName: 'المحاسب المعتمد' });
    const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
        const fetchCreatorInfo = async () => {
            if (!isOpen || !record) return;
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const targetUserId = record?.created_by || session?.user?.id;
                let fetchedFullName = '';

                if (targetUserId) {
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', targetUserId).single();
                    if (profile) fetchedFullName = profile.full_name || profile.name || profile.nickname || '';
                }

                if (!fetchedFullName && session?.user) {
                    fetchedFullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
                }

                setCreatorInfo({
                    fullName: fetchedFullName || 'أمين الخزينة المعتمد'
                });
            } catch (err) {
                console.error("Error fetching creator info", err);
            }
        };
        fetchCreatorInfo();
    }, [isOpen, record]);

    if (!isOpen || !mounted || !record) return null;

    const handlePrint = () => {
        document.title = record?.receipt_number ? `سند_قبض_${record.receipt_number}` : 'سند_قبض';
        window.print();
    };

    const finalFullName = creatorInfo?.fullName || 'أمين الخزينة المعتمد';
    const creationDateObj = record?.date ? new Date(record.date) : new Date();
    const creationDate = formatDate(record.date);
    const creationTime = new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });

    const amountNum = Number(record.amount || 0);
    const amountInWords = tafqeet(amountNum);
    const partnerDisplayName = record.partners?.name || record.partner_name || (record.invoices?.invoice_number ? `عميل فاتورة #${record.invoices.invoice_number}` : (record.notes || 'عميل نقدي'));

    // QR Verification Text (ZATCA & Luxury Verification standard)
    const qrData = `صيدلية تاج المودة البيطرية\nسند قبض رقم: ${record.receipt_number || '---'}\nالتاريخ: ${creationDate}\nالمبلغ: ${amountNum} ر.س\nالعميل: ${partnerDisplayName}\nطريقة الدفع: ${record.payment_method || 'نقدي'}`;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            background: 'rgba(30, 19, 11, 0.85)',
            backdropFilter: 'blur(10px)',
            padding: '24px 16px',
            overflowY: 'auto',
            direction: 'rtl',
            boxSizing: 'border-box'
        }}>
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 10mm !important;
                        background: white !important;
                    }
                    .no-print-controls { display: none !important; }
                }
            `}</style>

            {/* Action Bar */}
            <div className="no-print-controls" style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '20px',
                background: '#FFFFFF',
                padding: '12px 24px',
                borderRadius: '50px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
                position: 'sticky',
                top: '10px',
                zIndex: 1000000
            }}>
                <div style={{ display: 'flex', gap: '6px', background: '#FDFBF7', padding: '4px', borderRadius: '30px', border: '1px solid rgba(194, 155, 98, 0.3)' }}>
                    <button
                        type="button"
                        onClick={() => setPrintFormat('a4')}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            border: 'none',
                            background: printFormat === 'a4' ? '#1E130B' : 'transparent',
                            color: printFormat === 'a4' ? '#FFFFFF' : '#1E130B',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        📄 تقرير رسمي A4
                    </button>
                    <button
                        type="button"
                        onClick={() => setPrintFormat('thermal')}
                        style={{
                            padding: '6px 16px',
                            borderRadius: '20px',
                            border: 'none',
                            background: printFormat === 'thermal' ? '#1E130B' : 'transparent',
                            color: printFormat === 'thermal' ? '#FFFFFF' : '#1E130B',
                            fontWeight: 800,
                            fontSize: '12px',
                            cursor: 'pointer'
                        }}
                    >
                        🧾 إيصال حراري (POS)
                    </button>
                </div>

                <button
                    type="button"
                    onClick={handlePrint}
                    style={{
                        padding: '9px 24px',
                        borderRadius: '30px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                        color: '#FFFFFF',
                        fontWeight: 900,
                        fontSize: '14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        boxShadow: '0 4px 14px rgba(194, 155, 98, 0.4)'
                    }}
                >
                    <span>طباعة فورية</span>
                    <span>🖨️</span>
                </button>

                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        padding: '9px 18px',
                        borderRadius: '30px',
                        border: '1px solid rgba(168, 87, 60, 0.3)',
                        background: '#fef2f2',
                        color: '#A8573C',
                        fontWeight: 800,
                        fontSize: '13px',
                        cursor: 'pointer'
                    }}
                >
                    إغلاق ✕
                </button>
            </div>

            {/* Printable Area */}
            <div className="print-area">
                {printFormat === 'a4' ? (
                    /* A4 Official Format */
                    <div style={{
                        width: '210mm',
                        minHeight: '297mm',
                        background: '#FFFFFF',
                        color: '#1E130B',
                        padding: '18mm 20mm',
                        margin: '0 auto',
                        borderRadius: '16px',
                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.25)',
                        direction: 'rtl',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        fontFamily: "'Cairo', 'Segoe UI', Tahoma, sans-serif"
                    }}>
                        <div>
                            {/* Header */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '140px 1fr 140px',
                                alignItems: 'center',
                                borderBottom: '2.5px solid #C29B62',
                                paddingBottom: '16px',
                                marginBottom: '20px'
                            }}>
                                <div>
                                    <QRCodeSVG value={qrData} size={110} level="M" />
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 900, color: '#1E130B', letterSpacing: '-0.5px' }}>
                                        صيدلية تاج المودة البيطرية
                                    </h1>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#C29B62', marginTop: '4px' }}>
                                        Taj Al-Mawadah Veterinary Pharmacy
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                        سجل تجاري: 1010000000 | الرقم الضريبي: 300000000000003
                                    </div>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{
                                        display: 'inline-block',
                                        border: '2px solid #C29B62',
                                        borderRadius: '12px',
                                        padding: '8px 14px',
                                        textAlign: 'center',
                                        background: '#FDFBF7'
                                    }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b' }}>رقم السند</div>
                                        <div style={{ fontSize: '15px', fontWeight: 900, color: '#1E130B', marginTop: '2px' }}>
                                            {record.receipt_number || '---'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Title Banner */}
                            <div style={{ textAlign: 'center', marginBottom: '25px' }}>
                                <div style={{
                                    display: 'inline-block',
                                    background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                                    color: '#FFFFFF',
                                    padding: '8px 40px',
                                    borderRadius: '50px',
                                    fontSize: '18px',
                                    fontWeight: 900,
                                    letterSpacing: '1px',
                                    boxShadow: '0 4px 15px rgba(194, 155, 98, 0.3)'
                                }}>
                                    سند قبض نقدية رسمي (Official Receipt Voucher)
                                </div>
                            </div>

                            {/* Amount Highlight Box */}
                            <div style={{
                                background: '#FDFBF7',
                                border: '1.5px solid rgba(194, 155, 98, 0.35)',
                                borderRadius: '16px',
                                padding: '16px 24px',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '24px'
                            }}>
                                <div>
                                    <span style={{ fontSize: '13px', fontWeight: 800, color: '#64748b' }}>المبلغ المستلم رقماً:</span>
                                    <div style={{ fontSize: '28px', fontWeight: 900, color: '#059669', marginTop: '4px' }}>
                                        {formatCurrency(amountNum)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#64748b' }}>طريقة الاستلام:</span>
                                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#1E130B', marginTop: '4px' }}>
                                        {record.payment_method || 'نقدي (كاش)'}
                                    </div>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                marginBottom: '24px'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                    <tbody>
                                        <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.15)', background: '#FDFBF7' }}>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b', width: '22%' }}>استلمنا من المكرم:</td>
                                            <td style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B', fontSize: '15px' }} colSpan={3}>
                                                {partnerDisplayName}
                                            </td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.15)' }}>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b' }}>مبلغ وقدره (كتابة):</td>
                                            <td style={{ padding: '12px 18px', fontWeight: 900, color: '#1E130B', fontSize: '14px' }} colSpan={3}>
                                                فقط {amountInWords} لا غير
                                            </td>
                                        </tr>
                                        <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.15)', background: '#FDFBF7' }}>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b' }}>تاريخ السند:</td>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#1E130B' }}>
                                                {creationDate} ({creationTime})
                                            </td>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b', width: '20%' }}>رقم المرجع / الإشعار:</td>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#1E130B' }}>
                                                {record.reference_number || '---'}
                                            </td>
                                        </tr>
                                        {record.invoices?.invoice_number && (
                                            <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.15)' }}>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b' }}>سداد فاتورة مبيعات:</td>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: '#059669' }} colSpan={3}>
                                                    فاتورة رقم #{record.invoices.invoice_number}
                                                </td>
                                            </tr>
                                        )}
                                        {record.fleet_operation_id && (
                                            <tr style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.15)' }}>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b' }}>توريد عهدة رحلة أسطول:</td>
                                                <td style={{ padding: '12px 18px', fontWeight: 800, color: '#8c6b32' }} colSpan={3}>
                                                    رحلة أسطول رقم {record.fleet_operation_id}
                                                </td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#64748b' }}>وذلك عن / البيان:</td>
                                            <td style={{ padding: '12px 18px', fontWeight: 800, color: '#1E130B' }} colSpan={3}>
                                                {record.notes || 'سداد دفعة نقدية لحساب الصيدلية'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Signatures & Footer */}
                        <div>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr 1fr',
                                gap: '20px',
                                textAlign: 'center',
                                marginTop: '30px',
                                paddingTop: '20px',
                                borderTop: '1.5px dashed rgba(194, 155, 98, 0.35)'
                            }}>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748b', marginBottom: '40px' }}>
                                        المُسلّم / العميل
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                                        ................................
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748b', marginBottom: '40px' }}>
                                        أمين الخزينة / المستلم
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>
                                        {finalFullName}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#64748b', marginBottom: '40px' }}>
                                        اعتماد الإدارة المالية
                                    </div>
                                    <div style={{ fontSize: '13px', fontWeight: 900, color: '#059669' }}>
                                        معتمد إلكترونياً ✓
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                marginTop: '25px',
                                textAlign: 'center',
                                fontSize: '11px',
                                color: '#94a3b8',
                                borderTop: '1px solid rgba(194, 155, 98, 0.15)',
                                paddingTop: '10px'
                            }}>
                                هذا السند صادر إلكترونياً من نظام تاج المودة لإدارة الصيدليات والأسطول ومعتمد نظامياً برمز QR المشفر.
                            </div>
                        </div>
                    </div>
                ) : (
                    /* 80mm Thermal POS Receipt Format */
                    <div style={{
                        width: '80mm',
                        background: '#FFFFFF',
                        color: '#000000',
                        padding: '12px 14px',
                        margin: '0 auto',
                        fontFamily: "'Courier New', Courier, monospace",
                        fontSize: '12px',
                        direction: 'rtl',
                        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.25)',
                        borderRadius: '8px',
                        textAlign: 'center',
                        lineHeight: 1.4
                    }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
                            صيدلية تاج المودة البيطرية
                        </div>
                        <div style={{ fontSize: '11px', color: '#555' }}>
                            Taj Al-Mawadah Pharmacy
                        </div>
                        <div style={{ fontSize: '10px', color: '#666', margin: '4px 0' }}>
                            س.ت: 1010000000 | ضريبي: 300000000000003
                        </div>
                        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '8px 0', fontWeight: 'bold', fontSize: '14px' }}>
                            سند قبض نقدية
                        </div>

                        <table style={{ width: '100%', fontSize: '11px', textAlign: 'right', marginBottom: '8px' }}>
                            <tbody>
                                <tr>
                                    <td style={{ color: '#555' }}>رقم السند:</td>
                                    <td style={{ fontWeight: 'bold' }}>{record.receipt_number || '---'}</td>
                                </tr>
                                <tr>
                                    <td style={{ color: '#555' }}>التاريخ:</td>
                                    <td>{creationDate} {creationTime}</td>
                                </tr>
                                <tr>
                                    <td style={{ color: '#555' }}>المستلم من:</td>
                                    <td style={{ fontWeight: 'bold' }}>{partnerDisplayName}</td>
                                </tr>
                                <tr>
                                    <td style={{ color: '#555' }}>طريقة الدفع:</td>
                                    <td>{record.payment_method || 'نقدي'}</td>
                                </tr>
                                {record.reference_number && (
                                    <tr>
                                        <td style={{ color: '#555' }}>المرجع:</td>
                                        <td>{record.reference_number}</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '8px 0', margin: '8px 0' }}>
                            <div style={{ fontSize: '11px', color: '#555' }}>المبلغ المستلم:</div>
                            <div style={{ fontSize: '20px', fontWeight: 'bold', marginTop: '2px' }}>
                                {formatCurrency(amountNum)}
                            </div>
                            <div style={{ fontSize: '10px', color: '#444', marginTop: '3px' }}>
                                {amountInWords}
                            </div>
                        </div>

                        {record.notes && (
                            <div style={{ fontSize: '10px', textAlign: 'right', marginBottom: '8px', color: '#444' }}>
                                <b>البيان:</b> {record.notes}
                            </div>
                        )}

                        <div style={{ margin: '10px auto', display: 'flex', justifyContent: 'center' }}>
                            <QRCodeSVG value={qrData} size={90} level="M" />
                        </div>

                        <div style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
                            المستلم: {finalFullName}
                        </div>
                        <div style={{ fontSize: '9px', color: '#888', marginTop: '4px' }}>
                            شكراً لتعاملكم معنا
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
