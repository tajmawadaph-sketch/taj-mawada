"use client";
import { useLanguage } from '@/lib/LanguageContext';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';
import { notifyShiftOpened } from '@/lib/notificationService';
import { executeWithOfflineSync } from '@/lib/offline/offlineExecutor';


export default function ShiftOpenModal({ 
    isOpen, 
    onClose, 
    userProfile, 
    delegateId, 
    warehouseId,
    warehouses = [],
    delegates = [],
    onWarehouseChange,
    onDelegateChange
}: any) {
    const { language } = useLanguage();
    const isEn = language === 'en';

    const [targetWarehouseId, setTargetWarehouseId] = useState<string>(warehouseId || '');
    const [targetDelegateId, setTargetDelegateId] = useState<string>(delegateId || '');
    const [startingCash, setStartingCash] = useState<number | ''>(0);
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (isOpen) {
            setTargetWarehouseId(warehouseId || '');
            setTargetDelegateId(delegateId || '');
            setStartingCash(0);
        }
    }, [isOpen, warehouseId, delegateId]);

    // 🔒 جلب كافة الورديات النشطة حالياً في النظام لفحص التعارضات فورياً وبأمان تام
    const { data: allActiveShifts = [], isLoading: checkingShifts } = useQuery({
        queryKey: ['pos_open_shifts', isOpen],
        enabled: !!isOpen,
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pos_shifts')
                .select('id, warehouse_id, delegate_id, user_id, opened_at, starting_cash')
                .eq('status', 'open');

            if (error) {
                console.warn('Error fetching all active shifts:', error);
                return [];
            }

            return (data || []).map((s: any) => {
                const wh = warehouses.find((w: any) => w.id === s.warehouse_id);
                const del = delegates.find((d: any) => 
                    (s.delegate_id && (d.id === s.delegate_id || d.partnerId === s.delegate_id)) ||
                    (s.user_id && d.userId === s.user_id)
                );
                return {
                    ...s,
                    warehouse: wh || { name: 'المستودع' },
                    delegate: del ? { name: del.name } : null
                };
            });
        }
    });

    // 🔄 فحص هل نفس الموظف/المندوب لديه وردية أُغلقت اليوم في هذا المنفذ؟
    const { data: todayClosedShift = null } = useQuery({
        queryKey: ['pos_today_closed_shift', targetWarehouseId, targetDelegateId],
        enabled: !!isOpen && !!targetWarehouseId,
        queryFn: async () => {
            const now = new Date();
            const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
            const todayStartIso = `${todayDateStr}T00:00:00.000Z`;

            let q = supabase
                .from('pos_shifts')
                .select('id, starting_cash, opened_at, closed_at, total_sales')
                .eq('warehouse_id', targetWarehouseId)
                .eq('status', 'closed')
                .gte('opened_at', todayStartIso)
                .order('closed_at', { ascending: false })
                .limit(1);

            const selectedEmp = delegates.find((d: any) => d.id === targetDelegateId || d.partnerId === targetDelegateId);
            const partId = selectedEmp?.partnerId || selectedEmp?.id || targetDelegateId;

            if (partId) {
                q = q.eq('delegate_id', partId);
            } else {
                q = q.is('delegate_id', null);
            }

            const { data, error } = await q;
            if (error) {
                console.warn('Error checking today closed shift:', error);
                return null;
            }
            return data?.[0] || null;
        }
    });

    // 👑 صلاحية الإدارة العليا للإشراف على عدة فروع
    const isManagerOrAdmin = Boolean(
        userProfile?.role === 'super_admin' || 
        userProfile?.role === 'admin' || 
        userProfile?.role === 'manager'
    );

    // 1. هل المستودع المختار لديه وردية مفتوحة بالفعل؟
    const existingWarehouseShift = (allActiveShifts || []).find(
        (s: any) => s.warehouse_id === targetWarehouseId
    );

    // 2. هل الموظف المختار لديه وردية مفتوحة في مستودع آخر؟
    const selectedDelegate = delegates?.find((d: any) => d.id === targetDelegateId || d.partnerId === targetDelegateId);

    const existingDelegateShift = selectedDelegate ? (allActiveShifts || []).find(
        (s: any) => (s.delegate_id && (s.delegate_id === selectedDelegate.id || s.delegate_id === selectedDelegate.partnerId)) ||
                    (s.user_id && selectedDelegate.userId && s.user_id === selectedDelegate.userId)
    ) : null;

    // يُستثنى المدير / المشرف من المنع عند فتح ورديات لفروع ومستودعات مختلفة لضمان استقلالية كل فرع
    const isConflictWithOtherWarehouse = !isManagerOrAdmin && Boolean(existingDelegateShift && existingDelegateShift.id !== existingWarehouseShift?.id);

    const selectedWarehouse = warehouses?.find((w: any) => w.id === targetWarehouseId);

    const openShiftMutation = useMutation({
        mutationFn: async () => {
            if (!targetWarehouseId) {
                throw new Error(isEn ? 'Please select a branch first' : 'يرجى تحديد منفذ البيع / المستودع أولاً');
            }

            let currentUserId = userProfile?.id;
            if (!currentUserId) {
                const { data: { session } } = await supabase.auth.getSession();
                currentUserId = session?.user?.id;
            }
            if (!currentUserId) {
                const { data: { user } } = await supabase.auth.getUser();
                currentUserId = user?.id;
            }

            const chosenEmp = delegates.find((d: any) => d.id === targetDelegateId || d.partnerId === targetDelegateId);
            const resolvedShiftUserId = chosenEmp?.userId || currentUserId;
            const resolvedShiftDelegateId = chosenEmp?.partnerId || chosenEmp?.id || targetDelegateId;

            const payload = {
                warehouse_id: targetWarehouseId,
                delegate_id: resolvedShiftDelegateId || null,
                user_id: resolvedShiftUserId || null,
                starting_cash: Number(startingCash) || 0
            };

            const execResult = await executeWithOfflineSync({
                cloudOperation: async () => {
                    const res = await fetch('/api/pos/shifts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });

                    const result = await res.json();
                    if (!res.ok || !result.success) {
                        throw new Error(result.error || 'فشل فتح الوردية');
                    }
                    return result;
                },
                offlineBackup: {
                    type: 'pos_shift' as any,
                    action: 'insert',
                    payload: {
                        id: `offline-shift-${Date.now()}`,
                        ...payload,
                        status: 'open',
                        opened_at: new Date().toISOString()
                    }
                }
            });

            return {
                ...(execResult.data || {}),
                is_offline: execResult.isOffline
            };
        },
        onSuccess: (res: any) => {
            const isOffline = res?.is_offline;
            const isResumed = res?.is_resumed;
            if (isOffline) {
                showToast(isEn ? 'Shift opened locally in offline mode 📶' : 'تم فتح الوردية محلياً في وضع الأوفلاين بنجاح 📶', 'success');
            } else {
                showToast(isResumed ? (res?.message || (isEn ? 'Shift resumed successfully 🔄' : 'تم استئناف وردية اليوم بنجاح وتكملة المبيعات عليها 🔄')) : (isEn ? 'Shift opened successfully 🚀' : 'تم فتح الوردية بنجاح 🚀'), 'success');
            }
            if (onWarehouseChange && targetWarehouseId !== warehouseId) {
                onWarehouseChange(targetWarehouseId);
            }
            if (onDelegateChange && targetDelegateId !== delegateId) {
                onDelegateChange(targetDelegateId);
            }
            queryClient.invalidateQueries({ queryKey: ['active_pos_shift'] });
            queryClient.invalidateQueries({ queryKey: ['pos_open_shifts'] });
            queryClient.invalidateQueries({ queryKey: ['pos_today_closed_shift'] });

            // 🔔 بث إشعار فتح الوردية للمسؤولين
            const whObj = warehouses.find((w: any) => w.id === targetWarehouseId);
            notifyShiftOpened({
                shiftId: res?.shift?.id || 'new-shift',
                cashierName: userProfile?.displayName || userProfile?.full_name || 'الكاشير',
                warehouseName: whObj?.name || 'الفرع/المنفذ',
                startingCash: Number(startingCash) || 0
            }).catch(() => {});

            if (onClose) onClose();

        },
        onError: (err: any) => showToast(`فشل فتح الوردية: ${err.message}`, 'error')
    });

    // ⌨️ استجابة لوحة المفاتيح: Esc للإغلاق و Enter / Ctrl+Enter للبدء
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (onClose) onClose();
            } else if (e.key === 'Enter' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) {
                if (!openShiftMutation.isPending && targetWarehouseId && !existingWarehouseShift && !isConflictWithOtherWarehouse) {
                    e.preventDefault();
                    e.stopPropagation();
                    openShiftMutation.mutate();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose, targetWarehouseId, existingWarehouseShift, isConflictWithOtherWarehouse, openShiftMutation]);

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 99999,
            padding: '15px'
        }}>
            <style>{`
                .royal-shift-btn {
                    background: linear-gradient(135deg, #C29B62 0%, #A8573C 100%);
                    color: white;
                    border: none;
                    border-radius: 14px;
                    width: 100%;
                    min-height: 48px;
                    padding: 14px;
                    font-size: 16px;
                    font-weight: 900;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    box-shadow: 0 4px 15px rgba(194, 155, 98, 0.35);
                }
                .royal-shift-btn:hover:not(:disabled) {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 22px rgba(168, 87, 60, 0.35);
                    filter: brightness(1.06);
                }
                .royal-shift-btn:disabled {
                    opacity: 0.55;
                    cursor: not-allowed;
                    transform: none;
                }
                .royal-shift-input {
                    width: 100%;
                    background: #FDFBF7;
                    border: 2px solid rgba(194, 155, 98, 0.35);
                    border-radius: 14px;
                    padding: 12px;
                    font-size: 24px;
                    font-weight: 900;
                    text-align: center;
                    color: #1E130B;
                    transition: all 0.25s ease;
                    outline: none;
                    box-sizing: border-box;
                }
                .royal-shift-input:focus {
                    border-color: #C29B62;
                    box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.2);
                    background: #ffffff;
                }
                .royal-solid-card {
                    background: #FFFFFF;
                    border: 1.5px solid rgba(194, 155, 98, 0.35);
                    border-radius: 24px;
                    width: 95vw;
                    max-width: 480px;
                    padding: 30px 24px;
                    text-align: right;
                    box-shadow: 0 15px 40px rgba(30, 19, 11, 0.12);
                    animation: fadeUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
                    direction: rtl;
                }
                @keyframes fadeUp {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .shift-select-field {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 12px;
                    border: 1.5px solid rgba(194, 155, 98, 0.3);
                    background: #FDFBF7;
                    font-size: 13px;
                    font-weight: 700;
                    color: #1E130B;
                    outline: none;
                    transition: 0.2s;
                    box-sizing: border-box;
                    min-height: 44px;
                }
                .shift-select-field:focus {
                    border-color: #C29B62;
                    box-shadow: 0 0 0 3px rgba(194, 155, 98, 0.15);
                    background: #FFFFFF;
                }
            `}</style>
            
            <div className="royal-solid-card" style={{ position: 'relative' }}>
                {onClose && (
                    <button 
                        onClick={onClose} 
                        type="button"
                        style={{ 
                            position: 'absolute', top: 18, left: 18, 
                            background: '#fee2e2', border: 'none', 
                            fontSize: '15px', color: '#ef4444',
                            width: '32px', height: '32px', borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', zIndex: 10, fontWeight: 'bold' 
                        }}
                    >
                        ✕
                    </button>
                )}
                <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '42px', marginBottom: '4px' }}>💵</div>
                    <h2 style={{ color: '#2C1A12', margin: 0, fontWeight: 900, fontSize: '21px' }}>{isEn ? 'Open New Shift' : 'فتح وردية جديدة'}</h2>
                    <p style={{ color: 'rgba(44, 26, 18, 0.6)', margin: '4px 0 0 0', fontWeight: 700, fontSize: '12px' }}>
                        {isEn ? 'Record opening cash and start register' : 'تسجيل العهدة الافتتاحية وبدء تشغيل الصندوق'}
                    </p>
                </div>

                {/* اختيار وتحديد منفذ البيع والمندوب */}
                <div style={{
                    background: 'rgba(194, 155, 98, 0.08)',
                    border: '1px solid rgba(194, 155, 98, 0.25)',
                    borderRadius: '16px',
                    padding: '14px',
                    marginBottom: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#2C1A12', marginBottom: '5px' }}>
                            🏪 {isEn ? 'Branch / Warehouse to open shift for:' : 'منفذ البيع / المستودع المراد فتح ورديته:'}
                        </label>
                        <select 
                            className="shift-select-field"
                            value={targetWarehouseId}
                            onChange={(e) => setTargetWarehouseId(e.target.value)}
                        >
                            <option value="">{isEn ? '-- Select Branch --' : '-- اختر منفذ البيع --'}</option>
                            {warehouses.map((w: any) => {
                                const hasOpen = allActiveShifts.some((s: any) => s.warehouse_id === w.id);
                                return (
                                    <option key={w.id} value={w.id}>
                                        {w.name} {hasOpen ? (isEn ? '🔴 (Busy - Active Shift)' : '🔴 (مشغول - به وردية نشطة)') : (isEn ? '🟢 (Available)' : '🟢 (متاح لفتح وردية)')}
                                    </option>
                                );
                            })}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#2C1A12', marginBottom: '5px' }}>
                            👤 {isEn ? 'Responsible Employee / Cashier:' : 'الموظف / الكاشير المسؤول عن الوردية:'}
                        </label>
                        <select 
                            className="shift-select-field"
                            value={targetDelegateId}
                            onChange={(e) => setTargetDelegateId(e.target.value)}
                        >
                            <option value="">{isEn ? '-- Select Responsible Employee / Cashier --' : '-- اختر الموظف / الكاشير المسؤول --'}</option>
                            {delegates.map((d: any) => {
                                const hasOpen = allActiveShifts.some((s: any) => 
                                    (s.delegate_id && (s.delegate_id === d.id || s.delegate_id === d.partnerId)) ||
                                    (s.user_id && d.userId && s.user_id === d.userId)
                                );
                                const roleLabel = d.role ? `(${d.role})` : '';
                                return (
                                    <option key={d.id} value={d.id}>
                                        {d.name} {roleLabel} {hasOpen ? (isEn ? '🔴 (Has active shift)' : '🔴 (لديه وردية نشطة حالياً)') : (isEn ? '🟢 (Available)' : '🟢 (متاح)')}
                                    </option>
                                );
                            })}
                        </select>
                    </div>
                </div>

                {/* ⛔ تنبيه الحماية 1: المستودع لديه وردية مفتوحة بالفعل */}
                {existingWarehouseShift && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.12) 0%, rgba(220, 38, 38, 0.05) 100%)',
                        border: '1.5px solid #ef4444',
                        borderRadius: '16px',
                        padding: '14px',
                        marginBottom: '16px',
                        textAlign: 'right'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#dc2626', fontWeight: 900, fontSize: '14px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '18px' }}>⛔</span>
                            <span>{isEn ? 'Branch already running!' : 'المستودع قيد التشغيل بالفعل!'}</span>
                        </div>
                        <p style={{ color: '#991b1b', fontSize: '12.5px', margin: '0 0 8px 0', lineHeight: 1.6, fontWeight: 700 }}>
                            {isEn ? 'There is currently an active shift in ' : 'توجد حالياً وردية مفتوحة في '}<strong>{selectedWarehouse?.name}</strong>{isEn ? ' ID: ' : ' برقم '}<strong>#{String(existingWarehouseShift.id).slice(-6)}</strong>.
                            <br />
                            {isEn ? 'Current Cashier: ' : 'المسؤول الحالي: '}<strong style={{ color: '#111827' }}>{(Array.isArray(existingWarehouseShift.delegate) ? existingWarehouseShift.delegate[0]?.name : (existingWarehouseShift.delegate as any)?.name) || (isEn ? 'Direct Sales' : 'مبيعات مباشرة')}</strong>.
                        </p>
                        <div style={{
                            background: 'rgba(255, 255, 255, 0.9)',
                            padding: '8px 10px',
                            borderRadius: '10px',
                            color: '#b91c1c',
                            fontSize: '11.5px',
                            fontWeight: 800,
                            border: '1px dashed #ef4444'
                        }}>
                            {isEn ? '🔒 System Protection: Only one active shift per branch is allowed. Please close the current shift first.' : '🔒 حماية النظام: المسؤول شخص واحد في المستودع ولا يمكن فتح ورديتين معاً في نفس الوقت. يجب إنهاء وتقفيل الوردية الحالية أولاً لبدء وردية جديدة.'}
                        </div>
                    </div>
                )}

                {/* ⚠️ تنبيه الحماية 2: المندوب لديه وردية مفتوحة في مستودع آخر */}
                {isConflictWithOtherWarehouse && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(217, 119, 6, 0.05) 100%)',
                        border: '1.5px solid #f59e0b',
                        borderRadius: '16px',
                        padding: '14px',
                        marginBottom: '16px',
                        textAlign: 'right'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706', fontWeight: 900, fontSize: '14px', marginBottom: '6px' }}>
                            <span style={{ fontSize: '18px' }}>⚠️</span>
                            <span>{isEn ? 'Rep has active shift in another branch!' : 'المندوب مسؤول عن وردية نشطة في منفذ آخر!'}</span>
                        </div>
                        <p style={{ color: '#92400e', fontSize: '12.5px', margin: 0, lineHeight: 1.6, fontWeight: 700 }}>
                            {isEn ? 'Rep ' : 'المندوب '}<strong>{selectedDelegate?.name}</strong>{isEn ? ' is currently managing an active shift in ' : ' يدير حالياً وردية نشطة في '}<strong>{(Array.isArray(existingDelegateShift?.warehouse) ? existingDelegateShift?.warehouse[0]?.name : (existingDelegateShift?.warehouse as any)?.name) || (isEn ? 'another branch' : 'منفذ آخر')}</strong>.
                            <br />
                            {isEn ? 'A rep cannot manage two shifts simultaneously.' : 'المسؤول شخص واحد ولا يمكن الجمع بين ورديتين لنفس الشخص في نفس الوقت.'}
                        </p>
                    </div>
                )}

                {/* 👑 إشعار الإدارة: إمكانية فتح وإشراف ورديات متعددة للفروع المستقلة */}
                {isManagerOrAdmin && existingDelegateShift && existingDelegateShift.id !== existingWarehouseShift?.id && !existingWarehouseShift && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(194, 155, 98, 0.15) 0%, rgba(168, 87, 60, 0.08) 100%)',
                        border: '1.5px solid rgba(194, 155, 98, 0.45)',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        marginBottom: '16px',
                        textAlign: 'right'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#A8573C', fontWeight: 900, fontSize: '13px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '16px' }}>👑</span>
                            <span>{isEn ? 'Management Mode: Multi-Branch Shifts Permitted' : 'وضع الإدارة: فتح وإدارة ورديات مستقلة للفروع متاح'}</span>
                        </div>
                        <p style={{ color: '#2C1A12', fontSize: '12px', margin: 0, lineHeight: 1.5, fontWeight: 700 }}>
                            {isEn 
                                ? 'As an administrator, you can open and supervise independent shifts across different branches simultaneously.' 
                                : 'بصفتك مديراً / مسؤول نظام، يمكنك فتح وردية مستقلة تماماً لهذا الفرع مع بقاء ورديات الفروع الأخرى نشطة ومستقلة بمبيعاتها وخزينتها.'}
                        </p>
                    </div>
                )}

                {/* 🔄 إشعار استئناف وردية اليوم لنفس المندوب */}
                {todayClosedShift && !existingWarehouseShift && !isConflictWithOtherWarehouse && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(40, 145, 200, 0.12) 0%, rgba(28, 115, 171, 0.05) 100%)',
                        border: '1.5px solid #2891C8',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        marginBottom: '16px',
                        textAlign: 'right'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1C73AB', fontWeight: 900, fontSize: '13.5px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '18px' }}>🔄</span>
                            <span>{isEn ? 'Resume today\'s shift for this rep' : 'استئناف وردية اليوم لنفس المندوب'}</span>
                        </div>
                        <p style={{ color: '#0369a1', fontSize: '12px', margin: 0, lineHeight: 1.5, fontWeight: 700 }}>
                            {isEn ? 'There is a closed shift today for this rep in this branch ID: ' : 'توجد وردية أُغلقت اليوم لهذا المندوب في هذا المنفذ برقم '}<strong>#{todayClosedShift.shift_number || String(todayClosedShift.id).slice(-6)}</strong>.
                            <br />
                            {isEn ? 'Clicking below will ' : 'النقر أدناه سيقوم بـ '}<strong>{isEn ? 'resume the same shift' : 'استئناف نفس الوردية'}</strong>{isEn ? ' to continue today\'s sales.' : ' لتكملة مبيعات اليوم عليها دون فتح وردية مكررة.'}
                        </p>
                    </div>
                )}

                <div style={{ textAlign: 'right', marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', color: '#1E130B', fontWeight: 900, fontSize: '13px' }}>
                        {isEn ? 'Opening Cash (Amount in register SAR):' : 'العهدة الافتتاحية (المبلغ بالدرج الآن بالريال):'}
                    </label>
                    <input 
                        type="number" 
                        className="royal-shift-input"
                        value={startingCash} 
                        onChange={(e) => setStartingCash(e.target.value === '' ? '' : Number(e.target.value))}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        min="0"
                        disabled={!!existingWarehouseShift || !!isConflictWithOtherWarehouse || !targetWarehouseId}
                        style={{
                            opacity: (existingWarehouseShift || isConflictWithOtherWarehouse || !targetWarehouseId) ? 0.5 : 1,
                            cursor: (existingWarehouseShift || isConflictWithOtherWarehouse || !targetWarehouseId) ? 'not-allowed' : 'text'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                        onClick={() => openShiftMutation.mutate()} 
                        disabled={
                            openShiftMutation.isPending || 
                            !targetWarehouseId || 
                            !!existingWarehouseShift || 
                            !!isConflictWithOtherWarehouse
                        }
                        className="royal-shift-btn"
                        style={{ 
                            flex: 2,
                            opacity: (!targetWarehouseId || !!existingWarehouseShift || !!isConflictWithOtherWarehouse) ? 0.6 : 1,
                            cursor: (!targetWarehouseId || !!existingWarehouseShift || !!isConflictWithOtherWarehouse) ? 'not-allowed' : 'pointer',
                            background: (existingWarehouseShift || isConflictWithOtherWarehouse)
                                ? '#94a3b8'
                                : todayClosedShift
                                    ? 'linear-gradient(135deg, #059669 0%, #1E130B 100%)'
                                    : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)'
                        }}
                    >
                        {openShiftMutation.isPending 
                            ? (todayClosedShift ? (isEn ? '⏳ Resuming shift...' : '⏳ جاري استئناف الوردية...') : (isEn ? '⏳ Opening shift...' : '⏳ جاري فتح الوردية...'))
                            : existingWarehouseShift 
                                ? (isEn ? '⛔ Branch has active shift' : '⛔ المستودع به وردية نشطة بالفعل') 
                                : isConflictWithOtherWarehouse 
                                    ? (isEn ? '⛔ Rep has active shift' : '⛔ المندوب لديه وردية نشطة') 
                                    : !targetWarehouseId
                                        ? (isEn ? '⚠️ Select Branch' : '⚠️ اختر منفذ البيع')
                                        : todayClosedShift
                                            ? (isEn ? '🔄 Resume Shift' : '🔄 استئناف وردية اليوم وتكملة المبيعات')
                                            : (isEn ? '✨ Open Shift & Start' : '✨ فتح الصندوق وبدء الوردية')
                        }
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            type="button"
                            style={{
                                flex: 1,
                                background: '#f1f5f9',
                                color: '#64748b',
                                border: 'none',
                                borderRadius: '16px',
                                fontWeight: 800,
                                fontSize: '14px',
                                cursor: 'pointer'
                            }}
                        >
                            {isEn ? 'Cancel' : 'إلغاء'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
