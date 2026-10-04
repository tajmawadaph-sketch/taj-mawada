
"use client";
import { useLanguage } from '@/lib/LanguageContext';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';
import { classifyPaymentMethod } from '@/lib/helpers';
import { notifyShiftClosed } from '@/lib/notificationService';
import { executeWithOfflineSync } from '@/lib/offline/offlineExecutor';
import { getPendingSyncItems } from '@/lib/offline/syncStore';
import { getInventoryItemsList } from '@/lib/cache/resources';

export default function ShiftCloseModal({ 
    isOpen, 
    onClose, 
    activeShift,
    warehouses = [],
    delegates = []
}: any) {
    const { language } = useLanguage();
    const isEn = language === 'en';

    const [actualCash, setActualCash] = useState<number | ''>('');
    const [actualBottlesReturned, setActualBottlesReturned] = useState<number | ''>('');
    const [bottlesSold, setBottlesSold] = useState(0);
    const [totals, setTotals] = useState({ cash: 0, card: 0, credit: 0, total: 0 });
    const [isLoadingStats, setIsLoadingStats] = useState(true);
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    const currentWarehouse = activeShift?.warehouse || warehouses?.find((w: any) => w.id === activeShift?.warehouse_id);
    const currentDelegate = activeShift?.delegate || delegates?.find((d: any) => 
        (activeShift?.delegate_id && (d.id === activeShift?.delegate_id || d.partnerId === activeShift?.delegate_id)) ||
        (activeShift?.user_id && d.userId === activeShift?.user_id)
    );

    useEffect(() => {
        if (isOpen && activeShift) {
            calculateZReport();
        }
    }, [isOpen, activeShift]);

    const calculateZReport = async () => {
        setIsLoadingStats(true);
        try {
            let shiftInvoices: any[] = [];
            let expenses: any[] = [];
            let shiftReceipts: any[] = [];
            let retItemSet = new Set<string>();

            // 1. Fetch from Supabase if online
            try {
                const { data: invData } = await supabase
                    .from('invoices')
                    .select('id, total_amount, payment_method, lines_data')
                    .eq('shift_id', activeShift.id)
                    .neq('status', 'ملغي');
                if (invData) shiftInvoices = [...invData];

                const { data: expData } = await supabase
                    .from('expenses')
                    .select('paid_amount, payment_method')
                    .eq('shift_id', activeShift.id)
                    .neq('is_deleted', true);
                if (expData) expenses = [...expData];

                const { data: rcData } = await supabase
                    .from('receipt_vouchers')
                    .select('amount, payment_method, invoice_id')
                    .eq('shift_id', activeShift.id)
                    .neq('status', 'ملغي');
                if (rcData) shiftReceipts = [...rcData];

                const { data: retItems } = await supabase
                    .from('inventory_items')
                    .select('id')
                    .eq('is_returnable_bottle', true);
                if (retItems) {
                    retItemSet = new Set((retItems || []).map(r => r.id));
                }
            } catch (netErr) {
                console.warn('⚠️ [ShiftClose] Network offline/unavailable, querying local sync queue:', netErr);
            }

            // 2. Fetch pending invoices from local sync queue (handles offline transactions)
            try {
                const pendingItems = await getPendingSyncItems();
                const shiftId = String(activeShift.id);
                const existingIds = new Set(shiftInvoices.map(i => String(i.id)));

                pendingItems.forEach(item => {
                    if (item.table === 'invoices' || item.type === 'invoice') {
                        const inv = item.payload || item.data;
                        if (inv && String(inv.shift_id) === shiftId && !existingIds.has(String(inv.id))) {
                            shiftInvoices.push({
                                id: inv.id,
                                total_amount: inv.total_amount,
                                payment_method: inv.payment_method,
                                lines_data: inv.lines_data || inv.items
                            });
                            existingIds.add(String(inv.id));
                        }
                    }
                });
            } catch (queueErr) {
                console.warn('⚠️ [ShiftClose] Error reading pending sync queue:', queueErr);
            }

            // 3. Fallback for returnable items if Supabase was offline
            if (retItemSet.size === 0) {
                try {
                    const allItems = await getInventoryItemsList();
                    allItems.filter((it: any) => it.is_returnable_bottle).forEach((it: any) => retItemSet.add(it.id));
                } catch (e) {}
            }

            const shiftInvoiceIdSet = new Set(shiftInvoices.map(i => i.id));

            let cashSales = 0;
            let cardSales = 0;
            let creditSales = 0;
            let standaloneCashReceipts = 0;
            let standaloneCardReceipts = 0;
            let totalExpenses = 0;
            let cashExpenses = 0;
            let soldUnits = 0;

            shiftInvoices.forEach(inv => {
                const amt = Number(inv.total_amount || 0);
                const paymentCat = classifyPaymentMethod(inv.payment_method);
                if (paymentCat === 'cash') cashSales += amt;
                else if (paymentCat === 'card') cardSales += amt;
                else if (paymentCat === 'credit') creditSales += amt;

                if (Array.isArray(inv.lines_data)) {
                    inv.lines_data.forEach((line: any) => {
                        const isReturnable = line.is_returnable_bottle === true || retItemSet.has(line.item_id);
                        if (isReturnable) {
                            soldUnits += Number(line.quantity || line.qty || 0);
                        }
                    });
                }
            });

            // Add standalone receipts collected during shift
            shiftReceipts.forEach((rc: any) => {
                if (!rc.invoice_id || !shiftInvoiceIdSet.has(rc.invoice_id)) {
                    const rcAmt = Number(rc.amount || 0);
                    const rcCat = classifyPaymentMethod(rc.payment_method);
                    if (rcCat === 'cash') standaloneCashReceipts += rcAmt;
                    else if (rcCat === 'card') standaloneCardReceipts += rcAmt;
                }
            });

            expenses.forEach(exp => {
                const amt = Number(exp.paid_amount || 0);
                totalExpenses += amt;
                const expCat = classifyPaymentMethod(exp.payment_method);
                if (expCat === 'cash') {
                    cashExpenses += amt;
                }
            });

            const totalSales = cashSales + cardSales + creditSales;
            setTotals({ 
                cash: cashSales, 
                card: cardSales, 
                credit: creditSales, 
                total: totalSales, 
                standaloneCash: standaloneCashReceipts,
                standaloneCard: standaloneCardReceipts,
                cashExpenses, 
                totalExpenses 
            } as any);
            setBottlesSold(soldUnits);
            setActualBottlesReturned(soldUnits);
        } catch (error) {
            console.error('Error calculating Z-Report:', error);
        } finally {
            setIsLoadingStats(false);
        }
    };

    const expectedCash = Number(activeShift?.starting_cash || 0) + (totals.cash || 0) + ((totals as any).standaloneCash || 0) - ((totals as any).cashExpenses || 0);
    const difference = actualCash === '' ? 0 : Number(actualCash) - expectedCash;
    const returnedCount = actualBottlesReturned === '' ? 0 : Number(actualBottlesReturned);
    const bottlesShortage = bottlesSold - returnedCount;

    const closeShiftMutation = useMutation({
        mutationFn: async () => {
            if (actualCash === '') throw new Error(isEn ? 'Please enter the actual cash in the register' : 'الرجاء إدخال النقدية الفعلية الموجودة في الدرج');
            
            const payload = {
                id: activeShift.id,
                closed_at: new Date().toISOString(),
                expected_cash: expectedCash,
                actual_cash: Number(actualCash),
                total_sales: totals.total,
                total_cash_sales: totals.cash,
                total_card_sales: totals.card,
                total_credit_sales: totals.credit,
                total_expenses: (totals as any).totalExpenses || 0,
                shortage_overage: difference,
                bottles_sold: bottlesSold,
                bottles_returned: returnedCount,
                bottles_shortage: bottlesShortage,
                status: 'closed'
            };

            const result = await executeWithOfflineSync({
                cloudOperation: async () => {
                    const { data, error } = await supabase.from('pos_shifts')
                        .update(payload)
                        .eq('id', activeShift.id)
                        .select()
                        .maybeSingle();

                    if (error) throw new Error(error.message);
                    return data;
                },
                offlineBackup: {
                    type: 'pos_shift',
                    action: 'update',
                    payload
                }
            });

            return result;
        },
        onSuccess: (res: any) => {
            const isOffline = res?.isOffline;
            if (isOffline) {
                showToast(isEn ? 'Shift closed and saved locally (will sync once online) 📶' : 'تم إغلاق الوردية وحفظ التقفيل محلياً في وضع الأوفلاين (سيتم المزامنة تلقائياً) 📶', 'success');
            } else {
                showToast(isEn ? 'Shift closed and register reconciled successfully 🔒' : 'تم إغلاق الوردية وتقفيل الصندوق وعهدة الفوارغ بنجاح 🔒', 'success');
            }
            queryClient.invalidateQueries({ queryKey: ['active_pos_shift'] });
            queryClient.invalidateQueries({ queryKey: ['pos_open_shifts'] });
            queryClient.invalidateQueries({ queryKey: ['pos_today_closed_shift'] });
            
            // 🔔 بث إشعار إغلاق الوردية مع حالة الصندوق
            notifyShiftClosed({
                shiftId: activeShift?.id,
                cashierName: activeShift?.user_name || activeShift?.cashier_name || 'الكاشير',
                totalSales: Number(totals.total) || 0,
                shortageOverage: Number(difference) || 0
            }).catch(() => {});

            onClose();
        },
        onError: (err: any) => showToast(`فشل إغلاق الوردية: ${err.message}`, 'error')
    });

    // ⌨️ استجابة لوحة المفاتيح: Esc للإغلاق و Ctrl+Enter للتقفيل النهائي
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.code === 'NumpadEnter')) {
                if (!closeShiftMutation.isPending && actualCash !== '') {
                    e.preventDefault();
                    e.stopPropagation();
                    closeShiftMutation.mutate();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, actualCash, closeShiftMutation]);

    if (!isOpen) return null;

    if (!activeShift) {
        return (
            <div style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(30, 19, 11, 0.65)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 99999,
                padding: '15px'
            }}>
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '24px',
                    width: '95vw',
                    maxWidth: '450px',
                    padding: '35px 25px',
                    textAlign: 'center',
                    direction: 'rtl',
                    boxShadow: '0 20px 50px rgba(30, 19, 11, 0.15)',
                    border: '1.5px solid rgba(194, 155, 98, 0.35)'
                }}>
                    <div style={{ fontSize: '50px', marginBottom: '12px' }}>ℹ️</div>
                    <h3 style={{ color: '#1E130B', marginBottom: '10px', fontWeight: 900, fontSize: '20px' }}>{isEn ? 'No active shift' : 'لا توجد وردية نشطة حالياً'}</h3>
                    <p style={{ color: '#64748b', fontSize: '14px', marginBottom: '25px', fontWeight: 700, lineHeight: '1.6' }}>
                        {isEn ? 'You do not have an active shift to close. You can open a new shift from the top control bar.' : 'لا توجد وردية مفتوحة حالياً لحسابك لإغلاقها. يمكنك فتح وردية جديدة من شريط التحكم بأعلى الشاشة.'}
                    </p>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'linear-gradient(135deg, #C29B62, #A8573C)',
                            color: 'white',
                            border: 'none',
                            padding: '12px 30px',
                            borderRadius: '14px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            fontSize: '15px',
                            boxShadow: '0 4px 15px rgba(168, 87, 60, 0.3)',
                            minHeight: '44px'
                        }}
                    >
                        {isEn ? 'Got it' : 'حسناً، فهمت'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(30, 19, 11, 0.65)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999,
            padding: '15px'
        }}>
            <div style={{
                background: '#FFFFFF',
                border: '1.5px solid rgba(194, 155, 98, 0.35)',
                borderRadius: '24px',
                width: '95vw',
                maxWidth: '520px',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '28px 24px',
                textAlign: 'right',
                direction: 'rtl',
                boxShadow: '0 20px 50px rgba(30, 19, 11, 0.15)',
                position: 'relative'
            }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(194, 155, 98, 0.2)', paddingBottom: '15px', marginBottom: '14px' }}>
                    <div>
                        <h2 style={{ color: '#1E130B', margin: 0, fontSize: '20px', fontWeight: 900 }}>🔒 {isEn ? 'Close Register & Shift (Z-Report)' : 'تقفيل الصندوق والوردية (Z-Report)'}</h2>
                        <span style={{ fontSize: '12px', color: '#8c7662', fontWeight: 700 }}>
                            {isEn ? 'Shift ID:' : 'وردية رقم:'} #{String(activeShift.id).slice(-6)}
                        </span>
                    </div>
                    <button 
                        onClick={onClose} 
                        style={{ 
                            background: '#fee2e2', 
                            color: '#ef4444', 
                            border: 'none', 
                            width: '36px', 
                            height: '36px', 
                            borderRadius: '50%', 
                            fontSize: '18px', 
                            cursor: 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            fontWeight: 'bold' 
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* تفاصيل المستودع والمندوب للوردية */}
                <div style={{
                    background: 'rgba(194, 155, 98, 0.08)',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    borderRadius: '16px',
                    padding: '12px 16px',
                    marginBottom: '16px',
                    fontSize: '12px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '10px'
                }}>
                    <div>
                        <span style={{ color: '#8c7662', fontSize: '11px', display: 'block', fontWeight: 700 }}>🏪 {isEn ? 'Branch:' : 'منفذ البيع:'}</span>
                        <strong style={{ color: '#1E130B', fontSize: '13px' }}>{currentWarehouse?.name || (isEn ? 'Unknown Branch' : 'مستودع غير محدد')}</strong>
                    </div>
                    <div>
                        <span style={{ color: '#8c7662', fontSize: '11px', display: 'block', fontWeight: 700 }}>👤 {isEn ? 'Cashier / Rep:' : 'المندوب / الكاشير:'}</span>
                        <strong style={{ color: '#1E130B', fontSize: '13px' }}>{currentDelegate?.name || (isEn ? 'Direct Sales' : 'مبيعات مباشرة')}</strong>
                    </div>
                    <div>
                        <span style={{ color: '#8c7662', fontSize: '11px', display: 'block', fontWeight: 700 }}>🕒 {isEn ? 'Open Time:' : 'وقت الفتح:'}</span>
                        <strong style={{ color: '#1E130B', fontSize: '12px' }}>
                            {activeShift?.opened_at ? new Date(activeShift.opened_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </strong>
                    </div>
                </div>

                {isLoadingStats ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#8c7662', fontWeight: 800, fontSize: '15px' }}>
                        {isEn ? '⏳ Calculating shift sales...' : '⏳ جاري جرد وحساب مبيعات الوردية...'}
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {/* ملخص المبيعات */}
                        <div style={{ background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.25)', padding: '16px', borderRadius: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#475569' }}>
                                <span>💵 {isEn ? 'Opening Cash:' : 'العهدة الافتتاحية:'}</span>
                                <strong style={{ color: '#1E130B' }}>{Number(activeShift.starting_cash || 0).toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#059669' }}>
                                <span>💰 {isEn ? 'Cash Sales:' : 'المبيعات النقدية (كاش):'}</span>
                                <strong>+ {totals.cash.toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                            </div>
                            {Number((totals as any).standaloneCash || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#0284c7' }}>
                                    <span>📥 {isEn ? 'Additional Collections:' : 'تحصيلات نقدية إضافية:'}</span>
                                    <strong>+ {Number((totals as any).standaloneCash).toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                                </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#C29B62' }}>
                                <span>💳 {isEn ? 'Card / POS Sales:' : 'مبيعات الشبكة / مدى:'}</span>
                                <strong>{totals.card.toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#d97706' }}>
                                <span>📋 {isEn ? 'Credit Sales:' : 'المبيعات الآجلة:'}</span>
                                <strong>{totals.credit.toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                            </div>
                            {Number((totals as any).cashExpenses || 0) > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px', fontWeight: 700, color: '#A8573C' }}>
                                    <span>💸 {isEn ? 'Drawer Expenses:' : 'مصروفات الدرج (كاش):'}</span>
                                    <strong>- {Number((totals as any).cashExpenses).toFixed(2)} {isEn ? 'SAR' : 'ريال'}</strong>
                                </div>
                            )}
                            <hr style={{ borderColor: 'rgba(194, 155, 98, 0.2)', margin: '10px 0' }} />
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 900, color: '#1E130B' }}>
                                <span>🏦 {isEn ? 'Expected Cash in Register:' : 'النقدية المتوقعة بالدرج:'}</span>
                                <span style={{ fontSize: '20px', color: '#C29B62' }}>{expectedCash.toFixed(2)} {isEn ? 'SAR' : 'ريال'}</span>
                            </div>
                        </div>

                        {/* إدخال النقدية الفعلية */}
                        <div className="form-group">
                            <label style={{ fontWeight: 900, color: '#A8573C', fontSize: '14px', display: 'block', marginBottom: '8px' }}>
                                💵 {isEn ? 'Actual Cash in Register (Counted):' : 'المبلغ الفعلي الموجود في الدرج الآن (بعد العد):'}
                            </label>
                            <input 
                                type="number" 
                                value={actualCash} 
                                onChange={(e) => setActualCash(e.target.value === '' ? '' : Number(e.target.value))}
                                onFocus={(e) => e.target.select()}
                                style={{
                                    width: '100%',
                                    fontSize: '26px',
                                    fontWeight: 900,
                                    textAlign: 'center',
                                    border: '2px solid rgba(194, 155, 98, 0.4)',
                                    borderRadius: '14px',
                                    height: '54px',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                                placeholder="0.00"
                            />
                        </div>

                        {actualCash !== '' && (
                            <div style={{ 
                                textAlign: 'center', 
                                fontSize: '15px', 
                                fontWeight: 900, 
                                color: difference === 0 ? '#059669' : difference > 0 ? '#C29B62' : '#A8573C', 
                                padding: '12px', 
                                background: difference === 0 ? '#ECFDF5' : difference > 0 ? '#FDFBF7' : '#FEF2F2', 
                                borderRadius: '12px',
                                border: `1px solid ${difference === 0 ? '#A7F3D0' : difference > 0 ? 'rgba(194, 155, 98, 0.4)' : '#FECACA'}`
                            }}>
                                {difference === 0 
                                    ? (isEn ? '✅ Register matches exactly (No variance)' : '✅ الصندوق مطابق تماماً (لا يوجد عجز أو زيادة)') 
                                    : difference > 0 
                                        ? (isEn ? `💰 Cash surplus: +${difference.toFixed(2)} SAR` : `💰 يوجد زيادة بقيمة: +${difference.toFixed(2)} ريال`) 
                                        : (isEn ? `⚠️ Cash shortage: -${Math.abs(difference).toFixed(2)} SAR` : `⚠️ يوجد عجز بقيمة: -${Math.abs(difference).toFixed(2)} ريال`)}
                            </div>
                        )}

                        {/* 🔄 مطابقة عهدة فوارغ الجالونات والعبوات */}
                        <div style={{ background: '#FDFBF7', border: '1px solid rgba(194, 155, 98, 0.3)', padding: '15px', borderRadius: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 900, color: '#1E130B' }}>🔄 {isEn ? 'Sold Returnables Custody:' : 'عهدة العبوات والمستلزمات المستردة:'}</span>
                                <span style={{ fontSize: '15px', fontWeight: 900, color: '#C29B62' }}>{bottlesSold} {isEn ? 'Bottles / Gallons' : 'عبوة / جالون'}</span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                                <label style={{ fontSize: '12px', fontWeight: 800, color: '#1E130B' }}>{isEn ? 'Actual returnables received:' : 'عدد الفوارغ المستلمة فعلياً:'}</label>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={actualBottlesReturned}
                                    onChange={(e) => setActualBottlesReturned(e.target.value === '' ? '' : Number(e.target.value))}
                                    onFocus={(e) => e.target.select()}
                                    style={{
                                        fontSize: '18px',
                                        fontWeight: 'bold',
                                        textAlign: 'center',
                                        border: '1.5px solid rgba(194, 155, 98, 0.4)',
                                        borderRadius: '10px',
                                        padding: '8px',
                                        background: '#FFFFFF',
                                        color: '#1E130B',
                                        outline: 'none',
                                        minHeight: '44px'
                                    }}
                                    placeholder={isEn ? 'Returnables' : 'الفوارغ'}
                                />
                            </div>

                            <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 800, textAlign: 'center', padding: '8px', borderRadius: '10px', background: bottlesShortage === 0 ? '#ECFDF5' : bottlesShortage > 0 ? '#FEF2F2' : '#FDFBF7', color: bottlesShortage === 0 ? '#059669' : bottlesShortage > 0 ? '#A8573C' : '#C29B62' }}>
                                {bottlesShortage === 0 
                                    ? (isEn ? '✅ Returnables match exactly' : '✅ الفوارغ مطابقة تماماً') 
                                    : bottlesShortage > 0 
                                        ? (isEn ? `⚠️ Returnables shortage: ${bottlesShortage} bottles (Charged to rep)` : `⚠️ عجز فوارغ: ${bottlesShortage} عبوة (تُقيد كذمة على المندوب)`) 
                                        : (isEn ? `ℹ️ Extra returnables received: +${Math.abs(bottlesShortage)} bottles` : `ℹ️ فوارغ إضافية مستلمة: +${Math.abs(bottlesShortage)} عبوة`)}
                            </div>
                        </div>

                        {/* أزرار الإجراء */}
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginTop: '8px' }}>
                            <button 
                                onClick={() => closeShiftMutation.mutate()} 
                                disabled={closeShiftMutation.isPending || actualCash === ''}
                                style={{ 
                                    minHeight: '48px', 
                                    borderRadius: '14px', 
                                    border: 'none', 
                                    background: (actualCash === '' || closeShiftMutation.isPending) ? '#cbd5e1' : 'linear-gradient(135deg, #A8573C 0%, #1E130B 100%)', 
                                    color: 'white', 
                                    fontWeight: 900, 
                                    fontSize: '16px', 
                                    cursor: (actualCash === '' || closeShiftMutation.isPending) ? 'not-allowed' : 'pointer',
                                    boxShadow: '0 4px 15px rgba(168, 87, 60, 0.3)',
                                    transition: '0.2s'
                                }}
                            >
                                {closeShiftMutation.isPending ? (isEn ? '⏳ Closing...' : '⏳ جاري الإغلاق...') : (isEn ? '🔒 Confirm & Close Register' : '🔒 تأكيد وإغلاق الصندوق')}
                            </button>
                            <button
                                onClick={onClose}
                                type="button"
                                style={{
                                    minHeight: '48px',
                                    borderRadius: '14px',
                                    border: '1.5px solid rgba(194, 155, 98, 0.3)',
                                    background: '#FDFBF7',
                                    color: '#1E130B',
                                    fontWeight: 800,
                                    fontSize: '15px',
                                    cursor: 'pointer'
                                }}
                            >
                                {isEn ? 'Cancel' : 'إلغاء'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
