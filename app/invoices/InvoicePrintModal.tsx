"use client";
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom'; 
import { THEME } from '@/lib/theme';
import { formatCurrency, tafqeet } from '@/lib/helpers'; 
import { useToast } from '@/lib/toast-context'; 
import ZatcaQRCode from './ZatcaQRCode'; 
import { QRCodeSVG } from 'qrcode.react'; 
import { supabase } from '@/lib/supabase';
import { generateZatcaQR } from '@/lib/zatca_qr';
import { 
    normalizeInvoiceLines, 
    formatPhoneForWhatsApp, 
    generateInvoiceWhatsAppMessage,
    NormalizedInvoiceLine 
} from '@/lib/invoicePrintUtils';

interface InvoicePrintModalProps {
    isOpen: boolean;
    onClose: () => void;
    record: any;
    setRecord?: (record: any) => void;
    onSave?: () => void;
    isSaving?: boolean;
    projects?: any[];
}

export default function InvoicePrintModal({ 
    isOpen, 
    onClose, 
    record, 
    setRecord = () => {} 
}: InvoicePrintModalProps) {
    const { showToast } = useToast(); 
    const [mounted, setMounted] = useState(false); 
    const [creatorInfo, setCreatorInfo] = useState<{username: string, fullName: string} | null>(null); 
    const [customerDetails, setCustomerDetails] = useState<any>(null);
    const [delegateDetails, setDelegateDetails] = useState<any>(null);
    const [warehouseDetails, setWarehouseDetails] = useState<any>(null);
    const [printFormat, setPrintFormat] = useState<'a4' | 'thermal'>('a4');

    // حالة نافذة إرسال الواتساب
    const [isWhatsAppDialog, setIsWhatsAppDialog] = useState(false);
    const [whatsAppPhone, setWhatsAppPhone] = useState('');

    useEffect(() => {
        setMounted(true);
    }, []);

    // =========================================================================
    // 🚀 جلب بيانات منشئ الفاتورة، العميل، المندوب، والمنفذ من Supabase
    // =========================================================================
    useEffect(() => {
        if (!isOpen || !record) return;

        // 1. جلب بيانات المحاسب / الكاشير
        const fetchCreatorInfo = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const targetUserId = record?.created_by || session?.user?.id;

                let fetchedFullName = '';
                let fetchedUsername = '';

                if (targetUserId) {
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', targetUserId)
                        .maybeSingle();
                    
                    if (profile) {
                        fetchedFullName = profile.full_name || profile.name || profile.nickname || '';
                        fetchedUsername = profile.username || profile.email || '';
                    }
                }

                if (!fetchedFullName && session?.user) {
                    fetchedFullName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || '';
                }
                if (!fetchedUsername && session?.user) {
                    fetchedUsername = session.user.email ? session.user.email.split('@')[0] : '';
                }

                setCreatorInfo({ 
                    username: fetchedUsername || 'مستخدم النظام', 
                    fullName: fetchedFullName || record?.created_by_name || 'المحاسب المعتمد' 
                });
            } catch (err) {
                console.error("خطأ في جلب بيانات المحاسب:", err);
            }
        };

        // 2. جلب بيانات العميل الكاملة (الاسم، الجوال، الضريبة، العنوان، السجل التجاري)
        const fetchCustomerInfo = async () => {
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
                    console.error("خطأ في جلب بيانات العميل:", e);
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

        // 3. جلب بيانات المندوب
        const fetchDelegateInfo = async () => {
            const dId = record.delegate_id;
            if (dId) {
                try {
                    const { data } = await supabase.from('partners').select('id, name, phone, code').eq('id', dId).maybeSingle();
                    if (data) {
                        setDelegateDetails(data);
                        return;
                    }
                } catch (e) {
                    console.error("خطأ في جلب بيانات المندوب:", e);
                }
            }
            if (record.delegate) {
                setDelegateDetails(record.delegate);
            } else {
                setDelegateDetails(null);
            }
        };

        // 4. جلب بيانات المنفذ / المستودع
        const fetchWarehouseInfo = async () => {
            const wId = record.warehouse_id;
            if (wId) {
                try {
                    const { data } = await supabase.from('warehouses').select('id, name, type').eq('id', wId).maybeSingle();
                    if (data) {
                        setWarehouseDetails(data);
                        return;
                    }
                } catch (e) {
                    console.error("خطأ في جلب بيانات المنفذ:", e);
                }
            }
            if (record.warehouse) {
                setWarehouseDetails(record.warehouse);
            } else {
                setWarehouseDetails(null);
            }
        };

        fetchCreatorInfo();
        fetchCustomerInfo();
        fetchDelegateInfo();
        fetchWarehouseInfo();
    }, [isOpen, record]);

    // =========================================================================
    // 🛡️ استخراج الأصناف وتوحيدها عبر normalizeInvoiceLines
    // =========================================================================
    const lines: NormalizedInvoiceLine[] = useMemo(() => {
        return normalizeInvoiceLines(record);
    }, [record]);

    // =========================================================================
    // 💰 العمليات المالية والإجماليات
    // =========================================================================
    const totalAmount = Number(record?.total_amount || 0);
    const taxableAmount = Number(record?.taxable_amount || (totalAmount / 1.15));
    const discountAmount = Number(record?.materials_discount || 0);
    const taxAmount = Number(record?.tax_amount || (totalAmount - taxableAmount));
    const guaranteePercent = Number(record?.guarantee_percent || 0);
    const guaranteeAmount = Number(record?.guarantee_amount || 0);
    const paidAmount = Number(record?.paid_amount ?? (record?.payment_method !== 'آجل' ? totalAmount : 0));
    const remainingAmount = Math.max(0, totalAmount - paidAmount);

    const amountInWords = useMemo(() => tafqeet(totalAmount), [totalAmount]);

    // Formatters
    const formatNumberEn = (num: number) => {
        return new Intl.NumberFormat('en-US', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };
    
    const formatCurrencyEn = (val: any) => {
        const num = Number(val) || 0;
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SAR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };

    // توقيع وبيانات الاعتماد
    const finalFullName = creatorInfo?.fullName || 'المحاسب المعتمد';
    const creationDateObj = record?.created_at ? new Date(record.created_at) : (record?.date ? new Date(record.date) : new Date());
    const creationTime = creationDateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const creationDate = creationDateObj.toLocaleDateString('en-US');

    // باركود ZATCA للحراري
    const thermalZatcaQr = useMemo(() => {
        if (!record) return '';
        const dateStr = record.date ? `${record.date.split('T')[0]}T12:00:00Z` : new Date().toISOString();
        return generateZatcaQR('صيدلية تاج المودة البيطرية', '312487477800003', dateStr, totalAmount.toFixed(2), taxAmount.toFixed(2));
    }, [record, totalAmount, taxAmount]);

    // دالة الطباعة
    const handlePrintOrPDF = useCallback(() => {
        const originalTitle = document.title;
        document.title = record?.invoice_number ? `فاتورة_${record.invoice_number}` : 'فاتورة_ضريبية';
        window.print();
        setTimeout(() => { document.title = originalTitle; }, 1000);
    }, [record?.invoice_number]);

    // دالة فتح نافذة الواتساب
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

    // ⌨️ اختصارات لوحة المفاتيح
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
                handlePrintOrPDF();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isWhatsAppDialog, onClose, handlePrintOrPDF]);

    if (!isOpen || !mounted || !record) return null;

    const customerDisplayName = customerDetails?.name || record.client_name || 'عميل نقدي';
    const customerPhone = customerDetails?.phone || record.phone || '';
    const customerVat = customerDetails?.vat_number || customerDetails?.tax_id || '';
    const customerAddress = customerDetails?.address || record.address || 'المملكة العربية السعودية';
    const customerCr = customerDetails?.commercial_reg || customerDetails?.cr_number || '';
    const delegateName = delegateDetails?.name || (record.delegate?.name ? record.delegate.name : (record.delegate_id ? 'مندوب مبيعات' : 'مبيعات مباشرة'));
    const outletName = warehouseDetails?.name || (record.warehouse?.name ? record.warehouse.name : 'الفرع الرئيسي');

    const modalContent = (
        <div className="print-modal-overlay">
            
            <style>{`
                body { overflow: hidden !important; }

                .print-modal-overlay {
                    position: fixed !important; 
                    inset: 0 !important;
                    background: rgba(30, 19, 11, 0.78) !important; 
                    z-index: 999999999 !important;
                    display: flex !important; 
                    flex-direction: column !important; 
                    align-items: center !important; 
                    justify-content: flex-start !important; 
                    padding: 25px 20px !important; 
                    overflow-y: auto !important;
                    font-family: 'Cairo', system-ui, -apple-system, sans-serif;
                }

                .print-actions-bar {
                    display: flex !important; 
                    gap: 12px !important; 
                    margin-bottom: 25px !important;
                    background: #FFFFFF !important; 
                    padding: 10px 22px !important; 
                    border-radius: 18px !important;
                    border: 1.5px solid rgba(194, 155, 98, 0.35) !important;
                    box-shadow: 0 10px 30px rgba(30, 19, 11, 0.2) !important;
                    position: sticky !important; 
                    top: 20px !important; 
                    z-index: 1000000000 !important; 
                    flex-wrap: wrap !important;
                    justify-content: center !important;
                }
                .action-btn { 
                    min-height: 44px;
                    padding: 10px 22px; 
                    border-radius: 12px; 
                    border: none; 
                    font-weight: 800; 
                    font-size: 13.5px; 
                    cursor: pointer; 
                    transition: 0.2s; 
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-family: 'Cairo', system-ui, sans-serif;
                }
                .action-btn:hover { 
                    transform: translateY(-2px); 
                    box-shadow: 0 5px 15px rgba(30, 19, 11, 0.15); 
                }
                .action-btn.print { background: linear-gradient(135deg, #C29B62, #A8573C); color: white; box-shadow: 0 4px 14px rgba(194, 155, 98, 0.35); }
                .action-btn.whatsapp { background: #059669; color: white; box-shadow: 0 4px 12px rgba(5, 150, 105, 0.3); }
                .action-btn.whatsapp:hover { background: #047857; }
                .action-btn.format-switch { background: #FDFBF7; color: #1E130B; border: 1.5px solid rgba(194, 155, 98, 0.4); }
                .action-btn.close { background: #fef2f2; color: #A8573C; border: 1px solid rgba(168, 87, 60, 0.25); }

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
                .wa-modal-box h3 { margin: 0 0 10px 0; color: #1E130B; font-size: 18px; font-weight: 900; }
                .wa-input {
                    width: 100%; padding: 12px 14px; border: 2px solid #059669;
                    border-radius: 12px; font-size: 16px; font-weight: 800;
                    direction: ltr; text-align: center; margin: 15px 0;
                    box-sizing: border-box; outline: none; background: #FDFBF7;
                }

                /* =================== تصميم A4 الاحترافي =================== */
                .a4-preview-box {
                    width: 210mm !important; 
                    min-height: 297mm !important; 
                    background: white !important; 
                    color: #000;
                    padding: 12mm 15mm !important; 
                    margin: 0 auto 40px auto !important; 
                    box-shadow: 0 20px 50px rgba(0,0,0,0.4);
                    direction: rtl; 
                    border-radius: 20px !important; 
                    overflow: visible !important;
                    display: flex !important;
                    flex-direction: column !important; 
                    box-sizing: border-box !important; 
                }

                .inv-header { 
                    display: grid; 
                    grid-template-columns: 100px 1fr 110px; 
                    align-items: center; 
                    border-bottom: 3px solid #C29B62; 
                    padding-bottom: 10px; 
                    margin-bottom: 15px; 
                    width: 100%; 
                    gap: 15px; 
                }
                
                .header-qr { display: flex; justify-content: flex-start; align-items: center; } 
                .header-center { text-align: center; }
                .header-logo { display: flex; justify-content: flex-end; align-items: center; } 
                .header-logo img { max-height: 75px; width: auto; max-width: 100%; object-fit: contain; } 
                
                .qr-container { 
                    width: 80px !important; 
                    height: 80px !important; 
                    display: flex !important; 
                    justify-content: center !important; 
                    align-items: center !important; 
                    padding: 3px !important; 
                    background: #fff !important; 
                    border: 1.5px solid rgba(194, 155, 98, 0.3) !important; 
                    border-radius: 8px !important; 
                    box-shadow: 0 2px 5px rgba(44, 26, 18, 0.08) !important; 
                }

                .inv-title-box { text-align: center; margin-bottom: 15px; }
                .inv-title { 
                    font-size: 17px; 
                    font-weight: 900; 
                    border: 2.5px solid #C29B62; 
                    padding: 5px 30px; 
                    display: inline-block; 
                    background: linear-gradient(135deg, rgba(194, 155, 98, 0.12), rgba(168, 87, 60, 0.08)); 
                    color: #2C1A12; 
                    letter-spacing: 0.5px; 
                    border-radius: 12px; 
                }

                .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 15px; }
                
                .info-box { 
                    border: 1.5px solid rgba(194, 155, 98, 0.3); 
                    border-radius: 14px !important; 
                    padding: 14px 14px 10px 14px; 
                    display: flex; flex-direction: column; justify-content: center;
                    position: relative; background: #fff; min-height: 85px; 
                }
                .box-label { 
                    position: absolute; top: -10px; right: 16px; background: white; 
                    padding: 0 8px; font-size: 11px; font-weight: 900; color: #C29B62; 
                    border-radius: 12px; border: 1px solid rgba(194, 155, 98, 0.3);
                }

                .inner-table { width: 100%; border-collapse: collapse; }
                .inner-table td { padding: 3px 0; font-size: 12px; vertical-align: middle; }
                .label-cell { text-align: right; font-weight: 800; color: rgba(44, 26, 18, 0.6); width: 32%; }
                .value-cell { text-align: left; font-weight: 900; color: #2C1A12; width: 68%; }
                .value-highlight { color: #A8573C; font-size: 14px; font-weight: 900; }

                .inv-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11.5px; border-radius: 8px; overflow: hidden; }
                .inv-table th { 
                    background: linear-gradient(135deg, rgba(194, 155, 98, 0.18), rgba(168, 87, 60, 0.1)); 
                    padding: 7px 5px; 
                    text-align: center; 
                    border-bottom: 2px solid #C29B62; 
                    border-top: 2px solid #C29B62; 
                    color: #2C1A12; 
                    font-weight: 900; 
                    font-size: 11.5px; 
                }
                .inv-table td { 
                    padding: 6px 5px; 
                    border-bottom: 1px solid rgba(194, 155, 98, 0.2); 
                    text-align: center; 
                    color: #2C1A12; 
                    font-weight: 700; 
                }
                .inv-table td.desc { text-align: right; font-weight: 900; font-size: 12px; line-height: 1.4; }

                .inv-footer-flex { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 15px; flex-grow: 1; gap: 20px; }
                .inv-amount-words { flex: 1; display: flex; flex-direction: column; justify-content: space-between; }
                .inv-amount-words .words-box { 
                    background: rgba(253, 251, 247, 0.9); 
                    border: 1px dashed rgba(194, 155, 98, 0.4); 
                    padding: 10px; 
                    border-radius: 10px; 
                    font-weight: 800; 
                    font-size: 12px; 
                    color: #2C1A12; 
                    line-height: 1.4; 
                }
                
                .signature-area { margin-top: 15px; text-align: center; align-self: flex-start; }
                .signature-title { font-weight: 900; font-size: 11px; color: rgba(44, 26, 18, 0.6); margin-bottom: 6px; border-bottom: 1px solid rgba(194, 155, 98, 0.2); padding-bottom: 4px; }

                .inv-totals-box { width: 380px; }
                .inv-total-row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; font-weight: 800; color: #2C1A12; align-items: center; }
                .inv-total-row.tax { color: #A8573C; }
                .inv-total-row.discount { color: #dc2626; }
                .inv-total-row.grand-total { 
                    border-top: 2.5px solid #C29B62; 
                    padding-top: 8px; 
                    margin-top: 6px; 
                    font-size: 15px; 
                    font-weight: 900; 
                    color: #2C1A12; 
                    background: linear-gradient(135deg, rgba(194, 155, 98, 0.15), rgba(168, 87, 60, 0.08)); 
                    padding: 8px 10px; 
                    border-radius: 10px; 
                }

                .inv-footer-contact { 
                    margin-top: auto !important; 
                    border-top: 1.5px solid rgba(194, 155, 98, 0.3); 
                    padding-top: 10px; 
                    text-align: center; 
                    font-size: 11px; 
                    color: rgba(44, 26, 18, 0.6); 
                    font-weight: 700; 
                }

                /* =================== تصميم الإيصال الحراري 80mm =================== */
                .thermal-preview-box {
                    width: 80mm !important; 
                    max-width: 80mm !important; 
                    background: white !important; 
                    padding: 6mm 5mm !important; 
                    margin: 0 auto 40px auto !important; 
                    color: black !important; 
                    font-family: 'Courier New', Courier, monospace !important; 
                    font-size: 11.5px !important; 
                    font-weight: bold !important; 
                    text-align: center !important; 
                    direction: rtl !important; 
                    border-radius: 16px !important;
                    box-shadow: 0 15px 40px rgba(0,0,0,0.4) !important;
                    box-sizing: border-box !important;
                }
                .thermal-logo {
                    width: 70px; height: auto; max-height: 65px;
                    object-fit: contain; margin: 0 auto 5px auto; display: block;
                    filter: grayscale(100%) contrast(150%);
                }
                .thermal-divider { border-bottom: 1px dashed #000; margin: 7px 0; width: 100%; }
                .thermal-divider-double { border-bottom: 2px solid #000; margin: 8px 0; width: 100%; }
                .badge-invoice-type { display: inline-block; border: 1.5px solid #000; padding: 3px 8px; font-size: 11px; font-weight: 900; margin: 4px 0; border-radius: 4px; }
                
                .meta-table { width: 100%; border-collapse: collapse; margin: 4px 0; font-size: 11px; text-align: right; }
                .meta-table td { padding: 2px 0; vertical-align: top; }
                .meta-label { color: #333; white-space: nowrap; font-weight: bold; width: 32%; }
                .meta-val { color: #000; font-weight: 900; width: 68%; word-break: break-word; }

                .thermal-items-table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 11px; }
                .thermal-items-table th { border-bottom: 1.5px solid #000; border-top: 1.5px solid #000; padding: 4px 1px; font-weight: 900; text-align: center; }
                .thermal-items-table td { padding: 4px 1px; border-bottom: 1px dashed #444; vertical-align: middle; }

                .totals-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; font-size: 11px; }
                .totals-row.grand { border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; padding: 6px 4px; margin: 5px 0; font-size: 13.5px; font-weight: 900; background: #f0f0f0; }

                @media print {
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important; 
                        background: #FFFFFF !important; 
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body > *:not(.print-modal-overlay) { display: none !important; }
                    .no-print, .print-actions-bar, .luxury-toast-container, .luxury-confirm-overlay { display: none !important; }
                    .print-modal-overlay { 
                        position: absolute !important; left: 0 !important; top: 0 !important; 
                        background: #FFFFFF !important; padding: 0 !important; margin: 0 !important; 
                        display: block !important; overflow: visible !important;
                    }
                }
            `}</style>
            
            {printFormat === 'a4' && (
                <style>{`
                    @media print {
                        @page { size: A4 portrait; margin: 8mm 6mm !important; }
                        html, body, .print-modal-overlay { width: 210mm !important; min-height: 297mm !important; }
                        .a4-preview-box {
                            position: relative !important; top: 0 !important; left: 0 !important; 
                            width: 100% !important; max-width: 210mm !important; 
                            padding: 0 !important; margin: 0 !important; border: none !important; box-shadow: none !important;
                            border-radius: 0 !important;
                            page-break-inside: avoid !important;
                        }
                        .inv-header, .inv-title-box, .info-grid, .inv-table, .inv-footer-flex, .inv-footer-contact {
                            page-break-inside: avoid !important;
                        }
                    }
                `}</style>
            )}

            {printFormat === 'thermal' && (
                <style>{`
                    @media print {
                        @page { size: 80mm auto !important; margin: 0 !important; }
                        html, body, .print-modal-overlay { width: 80mm !important; }
                        .thermal-preview-box {
                            position: absolute !important; top: 0 !important; left: 0 !important; 
                            width: 80mm !important; max-width: 80mm !important; margin: 0 !important; 
                            padding: 3mm 2.5mm !important; border: none !important; box-shadow: none !important;
                            border-radius: 0 !important;
                            page-break-inside: avoid !important;
                            page-break-after: avoid !important;
                        }
                    }
                `}</style>
            )}

            {/* شريط الإجراءات العلوي */}
            <div className="print-actions-bar no-print">
                <button onClick={handlePrintOrPDF} className="action-btn print">
                    🖨️ طباعة ({printFormat === 'a4' ? 'A4' : 'حراري 80mm'})
                </button>
                <button onClick={handleTriggerWhatsApp} className="action-btn whatsapp">
                    📱 إرسال واتساب (WhatsApp)
                </button>
                <button onClick={() => setPrintFormat(f => f === 'a4' ? 'thermal' : 'a4')} className="action-btn format-switch">
                    تغيير للطباعة {printFormat === 'a4' ? 'الحرارية 🧾' : 'A4 📄'}
                </button>
                <button onClick={onClose} className="action-btn close">
                    ❌ إغلاق المعاينة
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

            {/* ========================================================================= */}
            {/* المعاينة الأولى: فاتورة A4 الرسمية                                         */}
            {/* ========================================================================= */}
            {printFormat === 'a4' ? (
                <div className="a4-preview-box">
                    
                    {/* 1️⃣ رأس الفاتورة */}
                    <div className="inv-header">
                        <div className="header-qr">
                            {!record.skip_zatca && (
                                <div className="qr-container">
                                    <ZatcaQRCode record={record} />
                                </div>
                            )}
                        </div>

                        <div className="header-center">
                            <h1 style={{ fontSize: '19px', fontWeight: 900, color: '#1E130B', margin: '0 0 4px 0' }}>صيدلية تاج المودة البيطرية</h1>
                            <h2 style={{ fontSize: '14px', fontWeight: 900, color: '#C29B62', margin: '0 0 6px 0', letterSpacing: '0.5px' }}>Taj Al-Mawadah Vet Pharmacy</h2>
                            <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155' }}>الرقم الضريبي (VAT No): 312487477800003</div>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginTop: '2px' }}>الرقم الموحد (Unified No): 7051013519</div>
                        </div>

                        <div className="header-logo">
                            <img src="/taj_logo.png" alt="شعار صيدلية تاج المودة" />
                        </div>
                    </div>

                    <div className="inv-title-box">
                        <div className="inv-title">
                            {record.skip_zatca ? 'فاتورة مبيعات داخلية | SALES INVOICE' : 'فاتورة ضريبية | TAX INVOICE'}
                        </div>
                    </div>

                    {/* 2️⃣ مربعات البيانات (بيانات العميل بالكامل + بيانات الفاتورة) */}
                    <div className="info-grid">
                        
                        {/* مربع العميل - يسحب كافة البيانات الحقيقية من Supabase */}
                        <div className="info-box">
                            <span className="box-label">صُدرت إلى / Invoice To</span>
                            <table className="inner-table">
                                <tbody>
                                    <tr>
                                        <td className="label-cell">اسم العميل:</td>
                                        <td className="value-cell value-highlight">{customerDisplayName}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">رقم الجوال:</td>
                                        <td className="value-cell" style={{ direction: 'ltr', textAlign: 'left' }}>{customerPhone || '---'}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">الرقم الضريبي:</td>
                                        <td className="value-cell">{customerVat || '---'}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">العنوان:</td>
                                        <td className="value-cell" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerAddress}</td>
                                    </tr>
                                    {customerCr && (
                                        <tr>
                                            <td className="label-cell">السجل التجاري:</td>
                                            <td className="value-cell">{customerCr}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* مربع بيانات الفاتورة والعملية */}
                        <div className="info-box">
                            <span className="box-label">بيانات الفاتورة / Invoice Details</span>
                            <table className="inner-table">
                                <tbody>
                                    <tr>
                                        <td className="label-cell">رقم الفاتورة:</td>
                                        <td className="value-cell value-highlight">#{record.invoice_number || record.id?.substring(0, 8)}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">تاريخ الإصدار:</td>
                                        <td className="value-cell" style={{ direction: 'ltr', textAlign: 'left' }}>{creationDate} {creationTime}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">طريقة الدفع:</td>
                                        <td className="value-cell">{record.payment_method || 'آجل'}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">المنفذ / الفرع:</td>
                                        <td className="value-cell">{outletName}</td>
                                    </tr>
                                    <tr>
                                        <td className="label-cell">المندوب / البائع:</td>
                                        <td className="value-cell">{delegateName}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* 3️⃣ جدول الأصناف المفصل - يدعم lines_data, lines, items, وكل الأصناف المسجلة */}
                    <div style={{ minHeight: '260px' }}>
                        <table className="inv-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '5%' }}>#</th>
                                    <th style={{ width: '40%', textAlign: 'right' }}>الصنف / Description</th>
                                    <th style={{ width: '10%' }}>الوحدة<br/>Unit</th>
                                    <th style={{ width: '10%' }}>الكمية<br/>Qty</th>
                                    <th style={{ width: '15%' }}>السعر (غير شامل)<br/>Price</th>
                                    <th style={{ width: '10%' }}>الضريبة (15%)<br/>VAT</th>
                                    <th style={{ width: '15%' }}>المجموع شامل<br/>Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length > 0 ? (
                                    lines.map((item, index) => (
                                        <tr key={index}>
                                            <td>{item.index}</td>
                                            <td className="desc">
                                                <div style={{ color: '#1E130B', fontWeight: 900 }}>{item.name}</div>
                                                {(item.batch_number || item.expiry_date) && (
                                                    <div style={{ fontSize: '10px', color: '#1E130B', marginTop: '2px', fontWeight: 700 }}>
                                                        {item.batch_number && <span style={{ marginLeft: '10px' }}>تشغيلة: <strong style={{ color: '#A8573C' }}>{item.batch_number}</strong></span>}
                                                        {item.expiry_date && <span>صلاحية: <strong style={{ color: '#059669' }}>{item.expiry_date}</strong></span>}
                                                    </div>
                                                )}
                                                {Boolean(item.discount && item.discount > 0) && (
                                                    <span style={{ display: 'block', fontSize: '10px', color: '#dc2626', fontWeight: 700 }}>
                                                        خصم: {formatCurrencyEn(item.discount)} -
                                                    </span>
                                                )}
                                            </td>
                                            <td>{item.unit}</td>
                                            <td>{formatNumberEn(item.quantity)}</td>
                                            <td>{formatCurrencyEn(item.unit_price)}</td>
                                            <td>{formatCurrencyEn(item.tax)}</td>
                                            <td style={{ fontWeight: 900, color: '#1E130B' }}>{formatCurrencyEn(item.total)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '20px', color: '#64748b' }}>
                                            لا توجد أصناف مسجلة في الفاتورة
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* 4️⃣ التفقيط والإجماليات والتوقيع */}
                    <div className="inv-footer-flex">
                        <div className="inv-amount-words">
                            <div className="words-box">
                                <span style={{ color: '#64748b', fontSize: '11px', display: 'block', marginBottom: '3px' }}>المبلغ فقط / Amount in words:</span>
                                {amountInWords} ريال سعودي لا غير.
                            </div>
                            
                            <div className="signature-area">
                                <div className="signature-title">المحاسب المعتمد / Authorized By</div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>{creatorInfo?.username}</div>
                                <div style={{ fontSize: '13.5px', fontWeight: 900, marginTop: '4px', color: THEME.primary }}>{finalFullName}</div>
                            </div>
                        </div>

                        <div className="inv-totals-box">
                            <div className="inv-total-row">
                                <span>إجمالي العمليات / Subtotal:</span>
                                <span>{formatCurrencyEn(taxableAmount + discountAmount)}</span>
                            </div>
                            {discountAmount > 0 && (
                                <div className="inv-total-row discount">
                                    <span>يخصم (خصم تجاري) / Discount:</span>
                                    <span>{formatCurrencyEn(discountAmount)} -</span>
                                </div>
                            )}
                            <div className="inv-total-row">
                                <span>الخاضع للضريبة / Taxable:</span>
                                <span>{formatCurrencyEn(taxableAmount)}</span>
                            </div>
                            <div className="inv-total-row tax">
                                <span>الضريبة (15%) / VAT (15%):</span>
                                <span>{formatCurrencyEn(taxAmount)}</span>
                            </div>
                            {guaranteeAmount > 0 && (
                                <div className="inv-total-row discount">
                                    <span>ضمان عمليات / Guarantee ({guaranteePercent}%):</span>
                                    <span>{formatCurrencyEn(guaranteeAmount)} -</span>
                                </div>
                            )}
                            <div className="inv-total-row grand-total">
                                <span>الصافي المستحق / Grand Total:</span>
                                <span>{formatCurrencyEn(totalAmount)}</span>
                            </div>
                            {paidAmount > 0 && (
                                <div className="inv-total-row" style={{ marginTop: '4px', color: '#16a34a' }}>
                                    <span>المبلغ المسدد / Paid:</span>
                                    <span>{formatCurrencyEn(paidAmount)}</span>
                                </div>
                            )}
                            {remainingAmount > 0 && (
                                <div className="inv-total-row" style={{ color: '#dc2626' }}>
                                    <span>المتبقي المستحق / Balance Due:</span>
                                    <span>{formatCurrencyEn(remainingAmount)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 5️⃣ إقرار الاستلام والتعهد القانوني المعتمد */}
                    <div style={{ marginTop: '10px', border: '1px solid rgba(194,155,98,0.35)', borderRadius: '10px', padding: '8px 12px', background: 'linear-gradient(135deg, rgba(194,155,98,0.06), rgba(168,87,60,0.04))' }}>
                        <p style={{ fontSize: '9px', lineHeight: '1.5', color: '#2C1A12', fontWeight: 600, margin: '0 0 6px 0' }}>
                            <strong style={{color:'#2C1A12', fontSize: '9.5px'}}>إقرار بالاستلام والسداد:</strong> أقرّ بأنني استلمت البضائع/الخدمات الواردة أعلاه كاملة بحالة سليمة، وأتعهد بسداد قيمتها البالغة <strong style={{color:'#A8573C'}}>{formatCurrencyEn(totalAmount)}</strong>. وفي حال التأخر يحق لصيدلية تاج المودة اتخاذ الإجراءات النظامية أمام المحاكم والجهات المختصة.
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px' }}>
                            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(44,26,18,0.6)' }}>الاسم والصفة</div><div style={{ borderBottom: '1px solid #C29B62', height: '18px' }}></div></div>
                            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(44,26,18,0.6)' }}>رقم الهوية / الإقامة</div><div style={{ borderBottom: '1px solid #C29B62', height: '18px' }}></div></div>
                            <div style={{ textAlign: 'center' }}><div style={{ fontSize: '9px', fontWeight: 800, color: 'rgba(44,26,18,0.6)' }}>التوقيع / الختم</div><div style={{ borderBottom: '1px solid #C29B62', height: '18px' }}></div></div>
                        </div>
                    </div>

                    {/* 6️⃣ الفوتر الثابت أسفل الصفحة */}
                    <div className="inv-footer-contact">
                        المملكة العربية السعودية &nbsp;|&nbsp; info@taj-mawadah.com &nbsp;|&nbsp; صيدلية تاج المودة البيطرية © {new Date().getFullYear()}
                    </div>

                </div>
            ) : (
                /* ========================================================================= */
                /* المعاينة الثانية: الإيصال الحراري 80mm المتكامل بالشعار وباركود ZATCA      */
                /* ========================================================================= */
                <div className="thermal-preview-box">
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

                    <table className="meta-table">
                        <tbody>
                            <tr>
                                <td className="meta-label">رقم الفاتورة:</td>
                                <td className="meta-val">#{record.invoice_number || record.id?.substring(0, 8)}</td>
                            </tr>
                            <tr>
                                <td className="meta-label">التاريخ والوقت:</td>
                                <td className="meta-val" style={{ direction: 'ltr', textAlign: 'right' }}>{creationDate} {creationTime}</td>
                            </tr>
                            <tr>
                                <td className="meta-label">المنفذ / الفرع:</td>
                                <td className="meta-val">{outletName}</td>
                            </tr>
                            <tr>
                                <td className="meta-label">المندوب / البائع:</td>
                                <td className="meta-val">{delegateName}</td>
                            </tr>
                            <tr>
                                <td className="meta-label">الكاشير:</td>
                                <td className="meta-val">{creatorInfo?.fullName || 'الكاشير'}</td>
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
                        </tbody>
                    </table>

                    <div className="thermal-divider" />

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

                    <div style={{ padding: '2px 0' }}>
                        <div className="totals-row">
                            <span>المبلغ الخاضع للضريبة:</span>
                            <span>{taxableAmount.toFixed(2)} ر.س</span>
                        </div>
                        {discountAmount > 0 && (
                            <div className="totals-row">
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
                            <div className="totals-row" style={{ fontWeight: 'bold' }}>
                                <span>المتبقي (آجل):</span>
                                <span>{remainingAmount.toFixed(2)} ر.س</span>
                            </div>
                        )}
                        <div style={{ fontSize: '10px', marginTop: '6px', textAlign: 'center', color: '#222' }}>
                            {amountInWords} ريال سعودي فقط لا غير.
                        </div>
                    </div>

                    <div className="thermal-divider" />

                    {!record.skip_zatca && thermalZatcaQr && (
                        <div style={{ margin: '10px 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <QRCodeSVG value={thermalZatcaQr} size={125} level="M" />
                            <div style={{ fontSize: '9px', marginTop: '4px', color: '#444' }}>
                                رمز التحقق الإلكتروني (هيئة الزكاة والضريبة)
                            </div>
                        </div>
                    )}

                    <div className="thermal-divider" />

                    <div style={{ fontSize: '10px', marginTop: '6px', color: '#111', lineHeight: '1.4' }}>
                        البضاعة المباعة تستبدل أو ترد خلال 3 أيام بحالتها الأصلية.<br/>
                        شكراً لتعاملكم مع <strong>صيدلية تاج المودة</strong> 🐎🐪<br/>
                        خدمة العملاء: info@taj-mawadah.com<br/>
                        <span style={{ fontSize: '8.5px', color: '#555' }}>تم الإصدار إلكترونياً عبر نظام تاج المودة</span>
                    </div>
                </div>
            )}
        </div>
    );

    return createPortal(modalContent, document.body);
}
