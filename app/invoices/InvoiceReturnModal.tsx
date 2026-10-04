"use client";
import React, { useState, useEffect, useMemo } from 'react';
import AquaModalWrapper from '@/components/AquaModalWrapper';
import { THEME } from '@/lib/theme';
import { showGlobalToast } from '@/lib/toast-context';

interface InvoiceReturnModalProps {
    isOpen: boolean;
    onClose: () => void;
    invoice: any;
    onConfirmReturn: (payload: {
        originalInvoice: any;
        returnedItems: any[];
        returnStockToWarehouse: boolean;
        refundCashFromDrawer: boolean;
        reason: string;
    }) => void;
    isSubmitting: boolean;
}

const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-SA', { style: 'currency', currency: 'SAR' }).format(amount || 0);
};

export default function InvoiceReturnModal({
    isOpen,
    onClose,
    invoice,
    onConfirmReturn,
    isSubmitting
}: InvoiceReturnModalProps) {
    const [mounted, setMounted] = useState(false);
    const [returnStockToWarehouse, setReturnStockToWarehouse] = useState(true);
    const [refundCashFromDrawer, setRefundCashFromDrawer] = useState(true);
    const [reason, setReason] = useState('إرجاع بطلب من العميل');
    const [itemsToReturn, setItemsToReturn] = useState<any[]>([]);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (isOpen && invoice) {
            const rawLines = invoice.lines_data || invoice.lines || invoice.items || [];
            // تهيئة بنود المرتجع بناء على الفاتورة الأصلية
            const initialItems = rawLines.map((line: any, idx: number) => {
                const qty = Number(line.quantity || line.qty || 1);
                const unitPrice = Number(line.unit_price || line.price || 0);
                const discount = Number(line.discount || 0);
                const lineTotal = line.total !== undefined ? Number(line.total) : ((qty * unitPrice) - discount);
                const taxRate = (line.tax_rate !== undefined && line.tax_rate !== null) ? Number(line.tax_rate) : (invoice.skip_zatca ? 0 : 15);

                return {
                    idx,
                    item_id: line.item_id || line.id,
                    name: line.name || line.description || `صنف #${idx + 1}`,
                    original_qty: qty,
                    return_qty: qty, // افتراضياً إرجاع الكمية كاملة
                    unit_price: unitPrice,
                    tax_rate: taxRate,
                    unit: line.unit || 'حبة',
                    is_selected: true
                };
            });
            setItemsToReturn(initialItems);
            setReturnStockToWarehouse(true);
            setRefundCashFromDrawer(invoice.payment_method === 'نقدي (كاش)' || invoice.payment_method === 'نقدي');
        }
    }, [isOpen, invoice]);

    const updateItemReturnQty = (idx: number, newQty: number) => {
        setItemsToReturn(prev => prev.map(it => {
            if (it.idx !== idx) return it;
            const validQty = Math.max(0, Math.min(it.original_qty, newQty));
            return { ...it, return_qty: validQty, is_selected: validQty > 0 };
        }));
    };

    const toggleItemSelection = (idx: number) => {
        setItemsToReturn(prev => prev.map(it => {
            if (it.idx !== idx) return it;
            const willSelect = !it.is_selected;
            return {
                ...it,
                is_selected: willSelect,
                return_qty: willSelect ? (it.return_qty > 0 ? it.return_qty : it.original_qty) : 0
            };
        }));
    };

    // احتساب مجاميع المرتجع
    const returnSummary = useMemo(() => {
        const selectedItems = itemsToReturn.filter(it => it.is_selected && it.return_qty > 0);
        let subtotal = 0;
        let tax = 0;

        selectedItems.forEach(it => {
            const lineGross = it.return_qty * it.unit_price;
            if (it.tax_rate === 0 || invoice?.skip_zatca) {
                subtotal += lineGross;
            } else {
                const lineSub = lineGross / (1 + (it.tax_rate / 100));
                const lineTax = lineGross - lineSub;
                subtotal += lineSub;
                tax += lineTax;
            }
        });

        const total = subtotal + tax;
        return {
            selectedCount: selectedItems.length,
            subtotal: Math.round(subtotal * 100) / 100,
            tax: Math.round(tax * 100) / 100,
            total: Math.round(total * 100) / 100,
            selectedItems: selectedItems.map(it => ({
                item_id: it.item_id,
                name: it.name,
                quantity: it.return_qty,
                unit: it.unit,
                unit_price: it.unit_price,
                tax_rate: it.tax_rate,
                total: Math.round((it.return_qty * it.unit_price) * 100) / 100
            }))
        };
    }, [itemsToReturn, invoice?.skip_zatca]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (returnSummary.selectedItems.length === 0) {
            showGlobalToast("يرجى اختيار صنف واحد على الأقل لإرجاعه وتحديد كميته.", 'warning');
            return;
        }

        onConfirmReturn({
            originalInvoice: invoice,
            returnedItems: returnSummary.selectedItems,
            returnStockToWarehouse,
            refundCashFromDrawer,
            reason
        });
    };

    if (!isOpen || !mounted || !invoice) return null;

    const isCashInvoice = invoice.payment_method === 'نقدي (كاش)' || invoice.payment_method === 'نقدي';

    return (
        <AquaModalWrapper
            isOpen={isOpen}
            onClose={onClose}
            title={`إجراء مرتجع مبيعات للفاتورة #${invoice.invoice_number} 🔄`}
            icon="↩️"
            width="780px"
        >
            <style>{`
                .return-sec-card {
                    background: linear-gradient(135deg, rgba(255, 253, 250, 0.85) 0%, rgba(255, 253, 250, 0.5) 100%);
                    border: 1px solid rgba(194, 155, 98, 0.3);
                    border-radius: 16px;
                    padding: 14px 18px;
                    margin-bottom: 12px;
                    box-shadow: 0 4px 12px rgba(44, 26, 18, 0.04);
                }
                .return-sec-title {
                    font-size: 13px;
                    font-weight: 900;
                    color: #2C1A12;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    border-bottom: 1px dashed rgba(194, 155, 98, 0.25);
                    padding-bottom: 6px;
                }
                .return-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 12px;
                }
                .return-table th {
                    background: rgba(44, 26, 18, 0.06);
                    color: #2C1A12;
                    padding: 8px 10px;
                    font-weight: 900;
                    text-align: right;
                }
                .return-table td {
                    padding: 8px 10px;
                    border-bottom: 1px solid rgba(194, 155, 98, 0.15);
                    vertical-align: middle;
                }
                .return-toggle-option {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: rgba(255, 255, 255, 0.8);
                    border: 1px solid rgba(194, 155, 98, 0.25);
                    padding: 10px 14px;
                    border-radius: 12px;
                    cursor: pointer;
                    margin-bottom: 8px;
                    transition: 0.2s;
                }
                .return-toggle-option.active {
                    background: linear-gradient(135deg, rgba(194, 155, 98, 0.15) 0%, rgba(168, 87, 60, 0.12) 100%);
                    border-color: #C29B62;
                }
                .return-qty-stepper {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    background: white;
                    border: 1px solid rgba(194, 155, 98, 0.35);
                    border-radius: 8px;
                    padding: 2px 4px;
                }
                .return-qty-btn {
                    width: 26px;
                    height: 26px;
                    border: none;
                    background: rgba(194, 155, 98, 0.15);
                    color: #2C1A12;
                    border-radius: 6px;
                    font-weight: 900;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .return-qty-btn:hover {
                    background: #C29B62;
                    color: white;
                }
            `}</style>

            <form onSubmit={handleSubmit}>
                {/* 1. ملخص الفاتورة الأصلية */}
                <div className="return-sec-card">
                    <div className="return-sec-title">
                        <span>🧾</span>
                        <span>بيانات الفاتورة الأصلية المراد عمل مرتجع لها</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', fontSize: '12px' }}>
                        <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>رقم الفاتورة:</span>{' '}
                            <strong style={{ color: '#2C1A12' }}>#{invoice.invoice_number}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>العميل:</span>{' '}
                            <strong style={{ color: '#2C1A12' }}>{invoice.client_name || 'عميل نقدي'}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>التاريخ:</span>{' '}
                            <strong style={{ color: '#2C1A12' }}>{invoice.date ? new Date(invoice.date).toLocaleDateString('ar-EG') : '-'}</strong>
                        </div>
                        <div>
                            <span style={{ color: '#64748b', fontWeight: 700 }}>طريقة الدفع:</span>{' '}
                            <span style={{ 
                                background: isCashInvoice ? 'rgba(34, 197, 94, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                color: isCashInvoice ? '#16a34a' : '#2563eb',
                                padding: '2px 8px', borderRadius: '6px', fontWeight: 800
                            }}>
                                {invoice.payment_method || 'نقدي (كاش)'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. جدول الأصناف المراد إرجاعها */}
                <div className="return-sec-card">
                    <div className="return-sec-title" style={{ justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span>📦</span>
                            <span>حدد الأصناف والكميات المراد إرجاعها</span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>
                            (يمكن إرجاع الفاتورة بالكامل أو تحديد أصناف وكميات جزئية)
                        </span>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table className="return-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px', textAlign: 'center' }}>تضمين</th>
                                    <th>الصنف</th>
                                    <th style={{ textAlign: 'center' }}>الكمية المباعة</th>
                                    <th style={{ textAlign: 'center' }}>الكمية المرتجعة</th>
                                    <th style={{ textAlign: 'center' }}>سعر الوحدة</th>
                                    <th style={{ textAlign: 'center' }}>الضريبة</th>
                                    <th style={{ textAlign: 'center' }}>إجمالي الاسترداد</th>
                                </tr>
                            </thead>
                            <tbody>
                                {itemsToReturn.map(it => {
                                    const lineRefund = it.return_qty * it.unit_price;
                                    return (
                                        <tr key={it.idx} style={{ opacity: it.is_selected ? 1 : 0.45 }}>
                                            <td style={{ textAlign: 'center' }}>
                                                <input 
                                                    type="checkbox" 
                                                    checked={it.is_selected} 
                                                    onChange={() => toggleItemSelection(it.idx)}
                                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#C29B62' }}
                                                />
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 800, color: '#2C1A12' }}>{it.name}</div>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                                                {it.original_qty} {it.unit}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <div className="return-qty-stepper">
                                                    <button 
                                                        type="button" 
                                                        className="return-qty-btn"
                                                        onClick={() => updateItemReturnQty(it.idx, it.return_qty - 1)}
                                                        disabled={!it.is_selected || it.return_qty <= 0}
                                                    >
                                                        -
                                                    </button>
                                                    <input 
                                                        type="number"
                                                        min="0"
                                                        max={it.original_qty}
                                                        value={it.return_qty}
                                                        onChange={(e) => updateItemReturnQty(it.idx, Number(e.target.value) || 0)}
                                                        disabled={!it.is_selected}
                                                        style={{ width: '44px', textAlign: 'center', border: 'none', fontWeight: 900, outline: 'none', color: '#2C1A12' }}
                                                    />
                                                    <button 
                                                        type="button" 
                                                        className="return-qty-btn"
                                                        onClick={() => updateItemReturnQty(it.idx, it.return_qty + 1)}
                                                        disabled={!it.is_selected || it.return_qty >= it.original_qty}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                                                {formatCurrency(it.unit_price)}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {it.tax_rate === 0 ? (
                                                    <span style={{ fontSize: '10.5px', color: '#15803d', fontWeight: 800, background: 'rgba(34, 197, 94, 0.12)', padding: '2px 6px', borderRadius: '6px' }}>
                                                        0% معفي
                                                    </span>
                                                ) : (
                                                    <span style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>
                                                        15%
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'center', fontWeight: 900, color: '#A8573C' }}>
                                                {formatCurrency(lineRefund)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 3. خيارات المعالجة والأثر المالي والمخزني */}
                <div className="return-sec-card">
                    <div className="return-sec-title">
                        <span>⚙️</span>
                        <span>خيارات الأثر المخزني والمالي للمرتجع</span>
                    </div>

                    {/* خيار إعادة البضاعة للمخزن */}
                    <div 
                        onClick={() => setReturnStockToWarehouse(!returnStockToWarehouse)}
                        className={`return-toggle-option ${returnStockToWarehouse ? 'active' : ''}`}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '20px' }}>📦</span>
                            <div>
                                <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#2C1A12' }}>
                                    إعادة البضاعة للمخزون (المستودع الرئيسي / الفرع)
                                </div>
                                <div style={{ fontSize: '11px', color: '#64748b' }}>
                                    يقوم النظام بزيادة رصيد الأصناف المرتجعة في المستودع فوراً وإثبات حركة وارد مرتجع
                                </div>
                            </div>
                        </div>
                        <div style={{
                            width: '22px', height: '22px', borderRadius: '6px',
                            border: returnStockToWarehouse ? '2px solid #C29B62' : '2px solid #94a3b8',
                            background: returnStockToWarehouse ? '#C29B62' : 'white',
                            color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '13px', fontWeight: 900
                        }}>
                            {returnStockToWarehouse ? '✓' : ''}
                        </div>
                    </div>

                    {/* خيار استرداد الكاش من الدرج */}
                    {isCashInvoice && (
                        <div 
                            onClick={() => setRefundCashFromDrawer(!refundCashFromDrawer)}
                            className={`return-toggle-option ${refundCashFromDrawer ? 'active' : ''}`}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '20px' }}>💵</span>
                                <div>
                                    <div style={{ fontSize: '12.5px', fontWeight: 900, color: '#2C1A12' }}>
                                        استرداد المبلغ نقداً وخصمه من نقدية الدرج / الوردية
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                                        يقوم النظام بخصم المبلغ المرتجع من نقدية الوردية بالكاشير لضبط مطابقة الدرج
                                    </div>
                                </div>
                            </div>
                            <div style={{
                                width: '22px', height: '22px', borderRadius: '6px',
                                border: refundCashFromDrawer ? '2px solid #C29B62' : '2px solid #94a3b8',
                                background: refundCashFromDrawer ? '#C29B62' : 'white',
                                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '13px', fontWeight: 900
                            }}>
                                {refundCashFromDrawer ? '✓' : ''}
                            </div>
                        </div>
                    )}

                    {/* سبب المرتجع */}
                    <div style={{ marginTop: '10px' }}>
                        <label style={{ fontSize: '11.5px', fontWeight: 800, color: '#2C1A12', display: 'block', marginBottom: '4px' }}>
                            سبب المرتجع وملاحظات:
                        </label>
                        <input 
                            type="text"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="مثال: رغبة العميل، عيب مصنعي، استبدال..."
                            className="glass-input-field"
                            style={{ width: '100%', height: '38px', borderRadius: '10px', fontSize: '12px' }}
                        />
                    </div>
                </div>

                {/* 4. ملخص مبالغ الاسترداد والزر النهائي */}
                <div style={{
                    background: 'linear-gradient(135deg, #2C1A12 0%, #1a100a 100%)',
                    borderRadius: '16px',
                    padding: '14px 18px',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    boxShadow: '0 8px 20px rgba(44, 26, 18, 0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>الأصناف المرتجعة</div>
                            <div style={{ fontSize: '16px', fontWeight: 900 }}>{returnSummary.selectedCount} أصناف</div>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.2)' }} />
                        <div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>المسترد قبل الضريبة</div>
                            <div style={{ fontSize: '16px', fontWeight: 900 }}>{formatCurrency(returnSummary.subtotal)}</div>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.2)' }} />
                        <div>
                            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>الضريبة المستردة</div>
                            <div style={{ fontSize: '16px', fontWeight: 900 }}>{formatCurrency(returnSummary.tax)}</div>
                        </div>
                        <div style={{ width: '1px', height: '28px', background: 'rgba(255,255,255,0.2)' }} />
                        <div>
                            <div style={{ fontSize: '11px', color: '#C29B62', fontWeight: 900 }}>إجمالي المبلغ المسترد للعميل</div>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#C29B62' }}>{formatCurrency(returnSummary.total)}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={onClose}
                            className="btn-glass-cancel"
                            style={{ minWidth: '90px', margin: 0, height: '42px', borderRadius: '10px' }}
                        >
                            إلغاء
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || returnSummary.total <= 0}
                            className="btn-glass-save"
                            style={{ 
                                minWidth: '150px', margin: 0, height: '42px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #A8573C 0%, #873820 100%)',
                                color: 'white', fontWeight: 900, fontSize: '13px'
                            }}
                        >
                            {isSubmitting ? '⏳ جاري المعالجة...' : '🔄 تأكيد المرتجع وإصدار الإشعار'}
                        </button>
                    </div>
                </div>
            </form>
        </AquaModalWrapper>
    );
}
