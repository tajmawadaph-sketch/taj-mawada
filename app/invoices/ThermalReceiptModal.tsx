"use client";
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { generateZatcaQR } from '@/lib/zatca_qr';
import { supabase } from '@/lib/supabase';
import { tafqeet } from '@/lib/helpers';
import { 
    normalizeInvoiceLines, 
    formatPhoneForWhatsApp, 
    generateInvoiceWhatsAppMessage,
    NormalizedInvoiceLine 
} from '@/lib/invoicePrintUtils';

interface ThermalReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: any;
    onOpenA4: () => void;
}

export default function ThermalReceiptModal({ isOpen, onClose, record, onOpenA4 }: ThermalReceiptModalProps) {
    const [qrData, setQrData] = useState('');
    const [customerDetails, setCustomerDetails] = useState<any>(null);
    const [delegateDetails, setDelegateDetails] = useState<any>(null);
    const [warehouseDetails, setWarehouseDetails] = useState<any>(null);
    const [creatorDetails, setCreatorDetails] = useState<any>(null);

    // حالة نافذة إرسال الواتساب المنبثقة السريعة
    const [isWhatsAppDialog, setIsWhatsAppDialog] = useState(false);
    const [whatsAppPhone, setWhatsAppPhone] = useState('');

    // 1️⃣ سحب بيانات العميل والمندوب والمستودع ومنشئ الفاتورة بشكل تفصيلي من قاعدة البيانات
    useEffect(() => {
        if (!isOpen || !record) return;

        // أ. سحب بيانات العميل
        const fetchCustomer = async () => {
            const pId = record.partner_id || record.customer_id;
            if (pId) {
                try {
                    const { data } = await supabase.from('partners').select('*').eq('id', pId).maybeSingle();
                    if (data) {
                        setCustomerDetails(data);
                        setWhatsAppPhone(data.phone || '');
                        return;
                    }
                } catch (e) {
                    console.error("Error fetching customer:", e);
                }
            }
            if (record.partners) {
                setCustomerDetails(record.partners);
                setWhatsAppPhone(record.partners.phone || '');
            } else if (record.customer) {
                setCustomerDetails(record.customer);
                setWhatsAppPhone(record.customer.phone || '');
            } else {
                setCustomerDetails(null);
                setWhatsAppPhone(record.phone || '');
            }
        };

        // ب. سحب بيانات المندوب
        const fetchDelegate = async () => {
            const dId = record.delegate_id;
            if (dId) {
                try {
                    const { data } = await supabase.from('partners').select('id, name, phone, code').eq('id', dId).maybeSingle();
                    if (data) {
                        setDelegateDetails(data);
                        return;
                    }
                } catch (e) {
                    console.error("Error fetching delegate:", e);
                }
            }
            if (record.delegate) {
                setDelegateDetails(record.delegate);
            } else {
                setDelegateDetails(null);
            }
        };

        // ج. سحب بيانات المنفذ / المستودع
        const fetchWarehouse = async () => {
            const wId = record.warehouse_id;
            if (wId) {
                try {
                    const { data } = await supabase.from('warehouses').select('id, name, type').eq('id', wId).maybeSingle();
                    if (data) {
                        setWarehouseDetails(data);
                        return;
                    }
                } catch (e) {
                    console.error("Error fetching warehouse:", e);
                }
            }
            if (record.warehouse) {
                setWarehouseDetails(record.warehouse);
            } else {
                setWarehouseDetails(null);
            }
        };

        // د. سحب بيانات الكاشير / المستخدم
        const fetchCreator = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const userId = record.created_by || session?.user?.id;
                if (userId) {
                    const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
                    if (profile) {
                        setCreatorDetails({
                            fullName: profile.full_name || profile.name || 'الكاشير المعتمد',
                            username: profile.username || profile.email?.split('@')[0] || 'كاشير'
                        });
                        return;
                    }
                }
                setCreatorDetails({
                    fullName: record.created_by_name || session?.user?.user_metadata?.name || 'الكاشير المعتمد',
                    username: 'كاشير'
                });
            } catch (e) {
                console.error("Error fetching creator:", e);
            }
        };

        fetchCustomer();
        fetchDelegate();
        fetchWarehouse();
        fetchCreator();
    }, [isOpen, record]);

    // 2️⃣ استخراج وتطبيع الأصناف لضمان شمول lines_data, lines, items, أو الصنف الرئيسي
    const lines: NormalizedInvoiceLine[] = useMemo(() => {
        return normalizeInvoiceLines(record);
    }, [record]);

    // 3️⃣ الحسابات المالية الدقيقة
    const totalAmount = Number(record?.total_amount || 0);
    const taxableAmount = Number(record?.taxable_amount || (totalAmount / 1.15));
    const discountAmount = Number(record?.materials_discount || 0);
    const taxAmount = Number(record?.tax_amount || (totalAmount - taxableAmount));
    const paidAmount = Number(record?.paid_amount ?? (record?.payment_method !== 'آجل' ? totalAmount : 0));
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    // 4️⃣ إنشاء باركود ZATCA الإلكتروني الرسمي
    useEffect(() => {
        if (record) {
            const dateStr = record.date ? `${record.date.split('T')[0]}T12:00:00Z` : new Date().toISOString();
            const totalStr = totalAmount.toFixed(2);
            const vatStr = taxAmount.toFixed(2);
            
            const qr = generateZatcaQR('صيدلية تاج المودة البيطرية', '312487477800003', dateStr, totalStr, vatStr);
            setQrData(qr);
        }
    }, [record, totalAmount, taxAmount]);

    // دالة الطباعة
    const handlePrint = useCallback(() => {
        const origTitle = document.title;
        document.title = record?.invoice_number ? `فاتورة_${record.invoice_number}` : 'فاتورة_حرارية';
        window.print();
        setTimeout(() => { document.title = origTitle; }, 1000);
    }, [record?.invoice_number]);

    // دالة فتح نافذة الواتساب للإرسال
    const handleTriggerWhatsApp = () => {
        const phone = whatsAppPhone || customerDetails?.phone || record?.phone || '';
        setWhatsAppPhone(phone);
        setIsWhatsAppDialog(true);
    };

    // تنفيذ الإرسال للواتساب
    const handleExecuteWhatsApp = (overridePhone?: string) => {
        const targetPhone = formatPhoneForWhatsApp(overridePhone || whatsAppPhone);
        const msg = generateInvoiceWhatsAppMessage(record, customerDetails, lines);
        
        let url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        if (targetPhone) {
            url = `https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`;
        }
        
        window.open(url, '_blank');
        setIsWhatsAppDialog(false);
    };

    // ⌨️ استجابة لوحة المفاتيح: Esc للإغلاق و Enter أو Ctrl+P للطباعة
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (isWhatsAppDialog) {
                    setIsWhatsAppDialog(false);
                } else {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                }
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
                e.preventDefault();
                e.stopPropagation();
                handlePrint();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isWhatsAppDialog, onClose, handlePrint]);

    if (!isOpen || !record) return null;

    const invoiceDate = record.date ? new Date(record.date) : new Date();
    const formattedDate = invoiceDate.toLocaleDateString('ar-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const formattedTime = invoiceDate.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const customerDisplayName = customerDetails?.name || record.client_name || 'عميل نقدي';
    const customerPhone = customerDetails?.phone || record.phone || '';
    const customerVat = customerDetails?.vat_number || customerDetails?.tax_id || '';
    const delegateName = delegateDetails?.name || (record.delegate?.name ? record.delegate.name : (record.delegate_id ? 'مندوب مبيعات' : 'مبيعات مباشرة'));
    const outletName = warehouseDetails?.name || (record.warehouse?.name ? record.warehouse.name : 'المنفذ الرئيسي');
    const cashierName = creatorDetails?.fullName || 'كاشير الفرع';

    return (
        <div className="thermal-modal-overlay">
            <style dangerouslySetInnerHTML={{__html: `
                .thermal-modal-overlay {
                    position: fixed; inset: 0; width: 100%; height: 100%;
                    background: rgba(30, 19, 11, 0.78);
                    display: flex; justify-content: flex-start; align-items: center; z-index: 999999999;
                    flex-direction: column; padding: 25px 15px; overflow-y: auto;
                    font-family: 'Cairo', system-ui, -apple-system, sans-serif;
                }

                .thermal-actions {
                    display: flex; gap: 12px; background: #FFFFFF;
                    padding: 10px 20px; border-radius: 18px; box-shadow: 0 10px 30px rgba(30, 19, 11, 0.2);
                    position: sticky; top: 15px; z-index: 10000; margin-bottom: 20px;
                    border: 1.5px solid rgba(194, 155, 98, 0.35);
                    flex-wrap: wrap; justify-content: center;
                }
                .thermal-actions button {
                    min-height: 44px;
                    padding: 10px 20px; border: none; border-radius: 12px; cursor: pointer;
                    font-weight: 800; font-size: 13.5px; transition: all 0.2s ease;
                    display: flex; align-items: center; gap: 6px;
                    font-family: 'Cairo', system-ui, sans-serif;
                }
                .thermal-actions button:hover {
                    transform: translateY(-2px); box-shadow: 0 5px 15px rgba(30, 19, 11, 0.15);
                }
                .btn-print-thermal { 
                    background: linear-gradient(135deg, #C29B62 0%, #A8573C 100%); 
                    color: #FFFFFF; 
                    box-shadow: 0 4px 14px rgba(194, 155, 98, 0.35);
                }
                .btn-whatsapp { 
                    background: #059669; 
                    color: #FFFFFF; 
                    box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3);
                }
                .btn-whatsapp:hover {
                    background: #047857;
                }
                .btn-a4 { 
                    background: #FDFBF7; 
                    color: #1E130B; 
                    border: 1.5px solid rgba(194, 155, 98, 0.4) !important;
                }
                .btn-close { 
                    background: #fef2f2; 
                    color: #A8573C; 
                    border: 1px solid rgba(168, 87, 60, 0.2) !important;
                }
                
                /* صندوق إيصال الـ 80 ملم الحراري */
                .thermal-receipt-container {
                    width: 80mm; 
                    max-width: 80mm;
                    background: #FFFFFF; 
                    padding: 5mm 4mm;
                    border-radius: 16px; 
                    box-shadow: 0 15px 40px rgba(30, 19, 11, 0.25);
                    color: #000000; 
                    font-family: 'Cairo', 'Courier New', monospace;
                    font-size: 11px; 
                    line-height: 1.35;
                    font-weight: bold; 
                    text-align: center;
                    direction: rtl; 
                    box-sizing: border-box;
                    margin-bottom: 40px;
                }

                .thermal-logo {
                    width: 75px;
                    height: auto;
                    max-height: 70px;
                    object-fit: contain;
                    margin: 0 auto 5px auto;
                    display: block;
                    filter: grayscale(100%) contrast(150%);
                }

                .thermal-divider {
                    border-bottom: 1px dashed #000;
                    margin: 6px 0;
                    width: 100%;
                }
                .thermal-divider-double {
                    border-bottom: 2px solid #000;
                    margin: 7px 0;
                    width: 100%;
                }

                .badge-invoice-type {
                    display: inline-block;
                    border: 1.5px solid #000;
                    padding: 3px 8px;
                    font-size: 10.5px;
                    font-weight: 900;
                    margin: 3px 0;
                    border-radius: 4px;
                    letter-spacing: 0.5px;
                }

                .meta-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 4px 0;
                    font-size: 10.5px;
                    text-align: right;
                }
                .meta-table td {
                    padding: 2px 0;
                    vertical-align: top;
                }
                .meta-label {
                    color: #222;
                    white-space: nowrap;
                    font-weight: bold;
                    width: 32%;
                }
                .meta-val {
                    color: #000;
                    font-weight: 900;
                    width: 68%;
                    word-break: break-word;
                }

                /* جدول الأصناف */
                .thermal-items-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin: 5px 0;
                    font-size: 10.5px;
                }
                .thermal-items-table th {
                    border-bottom: 1.5px solid #000;
                    border-top: 1.5px solid #000;
                    padding: 4px 1px;
                    font-weight: 900;
                    text-align: center;
                }
                .thermal-items-table td {
                    padding: 4px 1px;
                    border-bottom: 1px dashed #555;
                    vertical-align: middle;
                }

                /* صندوق الإجماليات */
                .totals-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2px 0;
                    font-size: 10.5px;
                }
                .totals-row.grand {
                    border-top: 1.5px solid #000;
                    border-bottom: 1.5px solid #000;
                    padding: 6px 4px;
                    margin: 5px 0;
                    font-size: 13px;
                    font-weight: 900;
                    background: #f4f4f4;
                }

                /* نافذة الواتساب المنبثقة */
                .wa-modal-box {
                    position: fixed;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    background: #FFFFFF;
                    padding: 24px;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(30, 19, 11, 0.4);
                    border: 1.5px solid rgba(194, 155, 98, 0.35);
                    z-index: 100000000;
                    width: 90%;
                    max-width: 380px;
                    direction: rtl;
                    text-align: center;
                    font-family: 'Cairo', system-ui, sans-serif;
                }
                .wa-modal-box h3 {
                    margin: 0 0 10px 0;
                    color: #1E130B;
                    font-size: 18px;
                    font-weight: 900;
                }
                .wa-input {
                    width: 100%;
                    padding: 12px 14px;
                    border: 2px solid #059669;
                    border-radius: 12px;
                    font-size: 16px;
                    font-weight: 800;
                    direction: ltr;
                    text-align: center;
                    margin: 15px 0;
                    box-sizing: border-box;
                    outline: none;
                    background: #FDFBF7;
                }

                @media print {
                    @page { 
                        margin: 0 !important; 
                        size: 80mm auto !important; 
                    }
                    html, body {
                        width: 80mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        background: #ffffff !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body * { visibility: hidden !important; }
                    .thermal-receipt-container, .thermal-receipt-container * {
                        visibility: visible !important;
                    }
                    .thermal-receipt-container {
                        position: absolute !important; 
                        left: 0 !important; 
                        top: 0 !important; 
                        width: 80mm !important; 
                        max-width: 80mm !important; 
                        margin: 0 !important; 
                        padding: 3mm 2.5mm !important; 
                        box-shadow: none !important; 
                        border: none !important;
                        border-radius: 0 !important;
                        page-break-inside: avoid !important;
                        page-break-after: avoid !important;
                    }
                    .thermal-modal-overlay { 
                        background: transparent !important; 
                        backdrop-filter: none !important; 
                        padding: 0 !important;
                        margin: 0 !important;
                        overflow: visible !important;
                    }
                    .thermal-actions, .no-print, .luxury-toast-container, .luxury-confirm-overlay { 
                        display: none !important; 
                    }
                }
            `}} />

            {/* شريط الإجراءات العلوي */}
            <div className="thermal-actions no-print">
                <button className="btn-print-thermal" onClick={handlePrint}>
                    🖨️ طباعة حرارية (80mm)
                </button>
                <button className="btn-whatsapp" onClick={handleTriggerWhatsApp}>
                    📱 إرسال واتساب (WhatsApp)
                </button>
                <button className="btn-a4" onClick={() => { onClose(); onOpenA4(); }}>
                    📄 فاتورة A4 الرسمية
                </button>
                <button className="btn-close" onClick={onClose}>
                    ❌ إغلاق
                </button>
            </div>

            {/* نافذة تأكيد رقم الواتساب قبل الإرسال */}
            {isWhatsAppDialog && (
                <div className="wa-modal-box no-print">
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>💬</div>
                    <h3>إرسال الفاتورة عبر واتساب</h3>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 10px 0' }}>
                        العميل: <strong>{customerDisplayName}</strong>
                    </p>
                    <label style={{ fontSize: '12px', fontWeight: 800, color: '#334155', display: 'block', textAlign: 'right' }}>
                        رقم هاتف العميل (مثال: 05xxxxxxxx أو 9665xxxxxxxx):
                    </label>
                    <input 
                        type="text" 
                        className="wa-input"
                        placeholder="05xxxxxxxx"
                        value={whatsAppPhone}
                        onChange={(e) => setWhatsAppPhone(e.target.value)}
                        autoFocus
                    />
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button 
                            onClick={() => handleExecuteWhatsApp()}
                            style={{ flex: 1, padding: '12px', background: '#25D366', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 900, cursor: 'pointer' }}
                        >
                            إرسال الآن 🚀
                        </button>
                        <button 
                            onClick={() => setIsWhatsAppDialog(false)}
                            style={{ padding: '12px 18px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '10px', fontWeight: 800, cursor: 'pointer' }}
                        >
                            إلغاء
                        </button>
                    </div>
                </div>
            )}

            {/* جسم الإيصال الحراري 80mm */}
            <div className="thermal-receipt-container">
                
                {/* 1. الشعار والترويسة */}
                <img src="/taj_logo.png" alt="Taj Al-Mawadah Logo" className="thermal-logo" />
                <div style={{ fontSize: '16px', fontWeight: 900, color: '#000', margin: '2px 0' }}>صيدلية تاج المودة البيطرية</div>
                <div style={{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '0.5px' }}>Taj Al-Mawadah Vet Pharmacy</div>
                <div style={{ fontSize: '10.5px', marginTop: '3px' }}>الرقم الضريبي: 312487477800003</div>
                <div style={{ fontSize: '10px' }}>الرقم الموحد: 7051013519</div>
                
                <div style={{ margin: '5px 0' }}>
                    <div className="badge-invoice-type">
                        فاتورة ضريبية مبسطة | SIMPLIFIED INVOICE
                    </div>
                </div>

                <div className="thermal-divider" />

                {/* 2. بيانات الفاتورة والأطراف */}
                <table className="meta-table">
                    <tbody>
                        <tr>
                            <td className="meta-label">رقم الفاتورة:</td>
                            <td className="meta-val">#{record.invoice_number || record.id?.substring(0, 8)}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">التاريخ والوقت:</td>
                            <td className="meta-val" style={{ direction: 'ltr', textAlign: 'right' }}>{formattedDate} {formattedTime}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">المنفذ / السيارة:</td>
                            <td className="meta-val">{outletName}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">المندوب / البائع:</td>
                            <td className="meta-val">{delegateName}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">الكاشير:</td>
                            <td className="meta-val">{cashierName}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">العميل:</td>
                            <td className="meta-val">{customerDisplayName}</td>
                        </tr>
                        {customerPhone && (
                            <tr>
                                <td className="meta-label">جوال العميل:</td>
                                <td className="meta-val" style={{ direction: 'ltr', textAlign: 'right' }}>{customerPhone}</td>
                            </tr>
                        )}
                        {customerVat && (
                            <tr>
                                <td className="meta-label">ضريبة العميل:</td>
                                <td className="meta-val">{customerVat}</td>
                            </tr>
                        )}
                        <tr>
                            <td className="meta-label">طريقة الدفع:</td>
                            <td className="meta-val">{record.payment_method || 'نقدي (كاش)'}</td>
                        </tr>
                        <tr>
                            <td className="meta-label">حالة الفاتورة:</td>
                            <td className="meta-val">{['posted', 'معتمد', 'مرحل', 'approved'].includes(String(record.status || '').trim().toLowerCase()) || record.is_posted || paidAmount >= totalAmount ? 'مسددة بالكامل ✅' : 'آجل / معلق ⏳'}</td>
                        </tr>
                    </tbody>
                </table>

                <div className="thermal-divider" />

                {/* 3. جدول الأصناف المفصل */}
                <table className="thermal-items-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'right', width: '42%' }}>الصنف</th>
                            <th style={{ width: '16%' }}>الكمية</th>
                            <th style={{ width: '20%' }}>السعر</th>
                            <th style={{ width: '22%', textAlign: 'left' }}>المجموع</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, idx) => (
                            <tr key={idx}>
                                <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                                    <div>{line.name}</div>
                                    {(line.batch_number || line.expiry_date) && (
                                        <div style={{ fontSize: '8.5px', color: '#111', marginTop: '1px', fontWeight: 700 }}>
                                            {line.batch_number && <span>تشغيلة: <strong>{line.batch_number}</strong> </span>}
                                            {line.expiry_date && <span>| ص: <strong>{line.expiry_date}</strong></span>}
                                        </div>
                                    )}
                                    {Boolean(line.discount && line.discount > 0) && (
                                        <div style={{ fontSize: '9px', color: '#333', fontWeight: 'normal' }}>
                                            خصم: {Number(line.discount).toFixed(2)}-
                                        </div>
                                    )}
                                </td>
                                <td style={{ textAlign: 'center' }}>{line.quantity}</td>
                                <td style={{ textAlign: 'center' }}>{line.unit_price.toFixed(2)}</td>
                                <td style={{ textAlign: 'left', fontWeight: '900' }}>{line.total.toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="thermal-divider-double" />

                {/* 4. الملخص المالي والضريبي */}
                <div style={{ padding: '2px 0' }}>
                    <div className="totals-row">
                        <span>المبلغ الخاضع للضريبة:</span>
                        <span>{taxableAmount.toFixed(2)} ر.س</span>
                    </div>

                    {discountAmount > 0 && (
                        <div className="totals-row" style={{ color: '#000' }}>
                            <span>خصم تجاري:</span>
                            <span>{discountAmount.toFixed(2)} - ر.س</span>
                        </div>
                    )}

                    <div className="totals-row">
                        <span>ضريبة القيمة المضافة (15%):</span>
                        <span>{taxAmount.toFixed(2)} ر.س</span>
                    </div>

                    <div className="totals-row grand">
                        <span>الإجمالي شامل الضريبة:</span>
                        <span>{totalAmount.toFixed(2)} ر.س</span>
                    </div>

                    <div className="totals-row">
                        <span>المدفوع:</span>
                        <span>{paidAmount.toFixed(2)} ر.س</span>
                    </div>

                    {remainingAmount > 0 && (
                        <div className="totals-row" style={{ color: '#000', fontWeight: 'bold' }}>
                            <span>المتبقي (آجل):</span>
                            <span>{remainingAmount.toFixed(2)} ر.س</span>
                        </div>
                    )}

                    <div style={{ fontSize: '10px', marginTop: '6px', textAlign: 'center', color: '#222' }}>
                        {tafqeet(totalAmount)} ريال سعودي فقط لا غير.
                    </div>
                </div>

                <div className="thermal-divider" />

                {/* 5. باركود ZATCA الرسمي */}
                {!record.skip_zatca && qrData && (
                    <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <QRCodeSVG value={qrData} size={125} level="M" />
                        <div style={{ fontSize: '9px', marginTop: '4px', color: '#444' }}>
                            رمز التحقق الإلكتروني (هيئة الزكاة والضريبة)
                        </div>
                    </div>
                )}

                <div className="thermal-divider" />

                {/* 6. التذييل والشروط */}
                <div style={{ fontSize: '10px', marginTop: '6px', color: '#111', lineHeight: '1.4' }}>
                    البضاعة المباعة تستبدل أو ترد خلال 3 أيام بحالتها الأصلية.<br/>
                    شكراً لتعاملكم مع <strong>صيدلية تاج المودة</strong> 🐎🐪<br/>
                    خدمة العملاء: info@taj-mawadah.com<br/>
                    <span style={{ fontSize: '8.5px', color: '#555' }}>تم الإصدار إلكترونياً عبر نظام تاج المودة</span>
                </div>

            </div>
        </div>
    );
}
