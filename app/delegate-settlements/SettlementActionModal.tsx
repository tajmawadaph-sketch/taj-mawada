"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { MAIN_WAREHOUSE_ID } from '@/lib/inventory_engine';
import { ACC } from '@/lib/account-ids';
import { showGlobalToast } from '@/lib/toast-context';

interface SettlementActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    trip: any;
    inventoryItems: any[];
    accounts: any[];
    warehouses: any[];
    onExecuteSettlement: (payload: any) => void;
    isSubmitting: boolean;
}

export default function SettlementActionModal({
    isOpen,
    onClose,
    trip,
    inventoryItems,
    accounts,
    warehouses,
    onExecuteSettlement,
    isSubmitting
}: SettlementActionModalProps) {
    const [activeTab, setActiveTab] = useState<'inventory' | 'cash' | 'journal'>('inventory');

    // Form States
    const [settlementDate, setSettlementDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedSafeAcc, setSelectedSafeAcc] = useState<string>(ACC.CASH_BOX);
    const [selectedMainWh, setSelectedMainWh] = useState<string>(MAIN_WAREHOUSE_ID);
    const [actualCashHandedOver, setActualCashHandedOver] = useState<number>(0);
    const [shortageAction, setShortageAction] = useState<'debt_on_delegate' | 'rounding' | 'none'>('debt_on_delegate');
    const [closeTripAfterSettlement, setCloseTripAfterSettlement] = useState<boolean>(true);
    const [settlementNotes, setSettlementNotes] = useState<string>('');

    // Inventory return rows: mapped from trip.inventoryItems
    const [returnRows, setReturnRows] = useState<Array<{
        itemId: string;
        itemName: string;
        unit: string;
        costPrice: number;
        loadedQty: number;
        soldQty: number;
        remainingQty: number;
        returnQty: number;
        wasteQty: number;
        shortageQty: number;
    }>>([]);

    // Extra item selector to add non-preloaded items
    const [selectedNewItemId, setSelectedNewItemId] = useState<string>('');

    // Initialize data when trip opens
    useEffect(() => {
        if (trip && isOpen) {
            setSettlementDate(new Date().toISOString().split('T')[0]);
            setSelectedSafeAcc(ACC.CASH_BOX);
            setSelectedMainWh(MAIN_WAREHOUSE_ID);
            setCloseTripAfterSettlement(true);
            setSettlementNotes('');
            setActiveTab('inventory');

            // Default cash handed over to remaining cash custody
            const defaultCash = Math.max(0, Number(trip.remainingCashCustody || trip.netCashDue || 0));
            setActualCashHandedOver(defaultCash);

            // Populate inventory return rows
            const rows = (trip.inventoryItems || []).map((item: any) => {
                const rem = Number(item.remainingQty || 0);
                return {
                    itemId: item.itemId,
                    itemName: item.itemName,
                    unit: item.unit,
                    costPrice: Number(item.costPrice || 0),
                    loadedQty: Number(item.loadedQty || 0),
                    soldQty: Number(item.soldQty || 0),
                    remainingQty: rem,
                    returnQty: rem, // Default: return all remaining goods to main warehouse
                    wasteQty: 0,
                    shortageQty: 0
                };
            });
            setReturnRows(rows);
        }
    }, [trip, isOpen]);

    // Update return row field
    const handleUpdateRow = (idx: number, field: 'returnQty' | 'wasteQty' | 'shortageQty', value: number) => {
        setReturnRows(prev => {
            const next = [...prev];
            const val = Math.max(0, Number(value) || 0);
            next[idx] = { ...next[idx], [field]: val };
            return next;
        });
    };

    // Return All remaining goods
    const handleReturnAll = (idx: number) => {
        setReturnRows(prev => {
            const next = [...prev];
            next[idx] = {
                ...next[idx],
                returnQty: next[idx].remainingQty,
                wasteQty: 0,
                shortageQty: 0
            };
            return next;
        });
    };

    // Add new item to return rows
    const handleAddNewItem = () => {
        if (!selectedNewItemId) return;
        const found = inventoryItems.find(i => i.id === selectedNewItemId);
        if (!found) return;

        // Check if already in list
        if (returnRows.some(r => r.itemId === found.id)) {
            showGlobalToast('هذا الصنف موجود بالفعل في القائمة', 'warning');
            return;
        }

        setReturnRows(prev => [
            ...prev,
            {
                itemId: found.id,
                itemName: found.name,
                unit: found.unit || 'حبة',
                costPrice: Number(found.cost_price || 0),
                loadedQty: 0,
                soldQty: 0,
                remainingQty: 0,
                returnQty: 1,
                wasteQty: 0,
                shortageQty: 0
            }
        ]);
        setSelectedNewItemId('');
    };

    // Remove row
    const handleRemoveRow = (idx: number) => {
        setReturnRows(prev => prev.filter((_, i) => i !== idx));
    };

    // Calculations
    const netCashDue = Number(trip?.netCashDue || 0);
    const cashDifference = actualCashHandedOver - netCashDue; // positive = over, negative = shortage
    const cashShortage = Math.max(0, -cashDifference);

    const totalReturnUnits = returnRows.reduce((s, r) => s + Number(r.returnQty || 0), 0);
    const totalWasteUnits = returnRows.reduce((s, r) => s + Number(r.wasteQty || 0), 0);
    const totalShortageUnits = returnRows.reduce((s, r) => s + Number(r.shortageQty || 0), 0);

    const totalReturnValue = returnRows.reduce((s, r) => s + (Number(r.returnQty || 0) * r.costPrice), 0);
    const totalWasteValue = returnRows.reduce((s, r) => s + (Number(r.wasteQty || 0) * r.costPrice), 0);
    const totalShortageValue = returnRows.reduce((s, r) => s + (Number(r.shortageQty || 0) * r.costPrice), 0);

    // Journal Preview Lines
    const journalPreviewLines = useMemo(() => {
        const lines: Array<{ accountName: string; code: string; debit: number; credit: number; notes: string; partnerName?: string }> = [];
        const driverInfo = `${trip?.driverName || ''}${trip?.driverPhone ? ` (${trip.driverPhone})` : ''}`;
        const vehicleInfo = trip?.vehiclePlate ? ` | مركبة: ${trip.vehiclePlate}` : '';

        // 1. Cash settlement lines
        if (actualCashHandedOver > 0) {
            const safeAccObj = accounts.find(a => a.id === selectedSafeAcc);
            lines.push({
                accountName: safeAccObj ? `${safeAccObj.name}` : 'الخزينة الرئيسية',
                code: safeAccObj?.code || '122',
                debit: actualCashHandedOver,
                credit: 0,
                notes: `توريد نقدية للخزينة من عهدة رحلة #${trip?.operationNumber || ''} | المندوب المسؤول: ${driverInfo}${vehicleInfo}`
            });

            lines.push({
                accountName: 'عهدة موظفين ومناديب',
                code: '125',
                debit: 0,
                credit: actualCashHandedOver,
                partnerName: driverInfo,
                notes: `إخلاء عهدة نقدية للمندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''} | المورد: ${formatCurrency(actualCashHandedOver)}`
            });

            if (cashShortage > 0) {
                if (shortageAction === 'debt_on_delegate') {
                    lines.push({
                        accountName: 'سلف وذمم مناديب وموظفين',
                        code: '128',
                        debit: cashShortage,
                        credit: 0,
                        partnerName: driverInfo,
                        notes: `إثبات عجز عهدة نقدية كذمة مستحقة على المندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''}`
                    });
                    lines.push({
                        accountName: 'عهدة موظفين ومناديب',
                        code: '125',
                        debit: 0,
                        credit: cashShortage,
                        partnerName: driverInfo,
                        notes: `إقفال عجز عهدة رحلة #${trip?.operationNumber || ''} بذمة المندوب ${driverInfo}`
                    });
                } else if (shortageAction === 'rounding') {
                    lines.push({
                        accountName: 'تسويات وفروق هللات',
                        code: '527',
                        debit: cashShortage,
                        credit: 0,
                        notes: `فروق وهللات تسوية عهدة رحلة #${trip?.operationNumber || ''} | المندوب: ${driverInfo}`
                    });
                    lines.push({
                        accountName: 'عهدة موظفين ومناديب',
                        code: '125',
                        debit: 0,
                        credit: cashShortage,
                        partnerName: driverInfo,
                        notes: `إقفال فرق هللات تسوية عهدة رحلة #${trip?.operationNumber || ''} للمندوب ${driverInfo}`
                    });
                }
            }
        }

        // 2. Inventory return lines
        const returnedSummary = returnRows
            .filter(r => r.returnQty > 0)
            .map(r => `${r.itemName} (${r.returnQty})`)
            .join('، ');
        const wasteSummary = returnRows
            .filter(r => r.wasteQty > 0)
            .map(r => `${r.itemName} (${r.wasteQty})`)
            .join('، ');
        const shortageSummary = returnRows
            .filter(r => r.shortageQty > 0)
            .map(r => `${r.itemName} (${r.shortageQty})`)
            .join('، ');

        if (totalReturnValue > 0) {
            lines.push({
                accountName: 'مخزون البضائع بالمستودع الرئيسي',
                code: '126',
                debit: totalReturnValue,
                credit: 0,
                notes: `إرجاع بضاعة للمستودع الرئيسي من عهدة رحلة #${trip?.operationNumber || ''} | المندوب: ${driverInfo}${returnedSummary ? ` [${returnedSummary}]` : ''}`
            });
            lines.push({
                accountName: 'عهدة مخزون (سيارة/مندوب)',
                code: '130',
                debit: 0,
                credit: totalReturnValue,
                partnerName: driverInfo,
                notes: `إخلاء عهدة مخزون بضاعة مرتجعة للمندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''}`
            });
        }

        if (totalWasteValue > 0) {
            lines.push({
                accountName: 'خسائر توالف وهدر مخزني',
                code: '528',
                debit: totalWasteValue,
                credit: 0,
                notes: `إثبات توالف وهدر بضاعة رحلة #${trip?.operationNumber || ''} | المندوب: ${driverInfo}${wasteSummary ? ` [${wasteSummary}]` : ''}`
            });
            lines.push({
                accountName: 'عهدة مخزون (سيارة/مندوب)',
                code: '130',
                debit: 0,
                credit: totalWasteValue,
                partnerName: driverInfo,
                notes: `تخفيض عهدة المخزون بالتوالف للمندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''}`
            });
        }

        if (totalShortageValue > 0) {
            lines.push({
                accountName: 'سلف وذمم مناديب وموظفين',
                code: '128',
                debit: totalShortageValue,
                credit: 0,
                partnerName: driverInfo,
                notes: `عجز بضاعة مفقودة محمل كذمة على المندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''}${shortageSummary ? ` [${shortageSummary}]` : ''}`
            });
            lines.push({
                accountName: 'عهدة مخزون (سيارة/مندوب)',
                code: '130',
                debit: 0,
                credit: totalShortageValue,
                partnerName: driverInfo,
                notes: `إقفال عهدة المخزون بالعجز المحمل على المندوب ${driverInfo} | رحلة #${trip?.operationNumber || ''}`
            });
        }

        return lines;
    }, [actualCashHandedOver, cashShortage, shortageAction, totalReturnValue, totalWasteValue, totalShortageValue, returnRows, trip, selectedSafeAcc, accounts]);

    const totalDebit = journalPreviewLines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = journalPreviewLines.reduce((s, l) => s + l.credit, 0);
    const isJournalBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

    // Handle Submit
    const handleSubmit = () => {
        if (!trip) return;

        if (actualCashHandedOver < 0) {
            showGlobalToast('المبلغ المورد لا يمكن أن يكون سالباً', 'warning');
            return;
        }

        if (!trip.driverId) {
            showGlobalToast('خطأ: لا يوجد معرف شريك/مندوب (driver_id) مربوط بهذه الرحلة!', 'error');
            return;
        }

        const payload = {
            tripId: trip.id,
            operationNumber: trip.operationNumber,
            driverId: trip.driverId,
            driverName: trip.driverName,
            driverPhone: trip.driverPhone,
            driverCode: trip.driverCode,
            vehicleId: trip.vehicleId,
            vehiclePlate: trip.vehiclePlate,
            warehouseId: trip.warehouseId,
            warehouseName: trip.warehouseName,
            mainWarehouseId: selectedMainWh,
            settlementDate,
            cashAmount: Number(actualCashHandedOver || 0),
            safeBankAccId: selectedSafeAcc,
            netCashDue,
            cashShortage,
            shortageAction,
            totalSales: trip.totalSales,
            cashSales: trip.cashSales,
            creditSales: trip.creditSales,
            totalCollections: trip.totalCollections,
            totalExpenses: trip.totalExpenses,
            inventoryReturns: returnRows.map(r => ({
                itemId: r.itemId,
                itemName: r.itemName,
                costPrice: r.costPrice,
                returnQty: Number(r.returnQty || 0),
                wasteQty: Number(r.wasteQty || 0),
                shortageQty: Number(r.shortageQty || 0)
            })),
            closeTrip: closeTripAfterSettlement,
            notes: settlementNotes
        };

        onExecuteSettlement(payload);
    };

    if (!isOpen || !trip) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(18, 41, 70, 0.65)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            padding: '16px',
            direction: 'rtl',
            boxSizing: 'border-box'
        }}>
            <style>{`
                .settle-modal-card {
                    animation: settleFadeUp 0.3s cubic-bezier(0.165, 0.84, 0.44, 1);
                }
                @keyframes settleFadeUp {
                    from { opacity: 0; transform: translateY(20px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @media (max-width: 768px) {
                    .settle-modal-card { width: 95vw !important; max-height: 94vh !important; padding: 16px !important; border-radius: 20px !important; }
                    .settle-grid-responsive { grid-template-columns: 1fr !important; gap: 12px !important; }
                    .settle-tabs { flex-wrap: wrap !important; gap: 6px !important; }
                    .settle-tab-btn { flex: 1 1 100% !important; min-height: 44px !important; font-size: 13px !important; }
                }
            `}</style>

            <div className="settle-modal-card" style={{
                background: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(40px) saturate(200%)',
                WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                borderRadius: '32px',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                boxShadow: '0 25px 60px -15px rgba(28, 115, 171, 0.35), inset 0 2px 4px rgba(255, 255, 255, 1)',
                width: '100%',
                maxWidth: '920px',
                maxHeight: '90vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                color: '#122946'
            }}>
                {/* Modal Header */}
                <div style={{
                    padding: '24px 30px',
                    borderBottom: '1px solid rgba(28, 115, 171, 0.12)',
                    background: 'linear-gradient(135deg, rgba(28, 115, 171, 0.08) 0%, rgba(40, 145, 200, 0.03) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <div style={{
                            width: '54px',
                            height: '54px',
                            borderRadius: '18px',
                            background: 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF',
                            fontSize: '26px',
                            boxShadow: '0 8px 20px rgba(168, 87, 60, 0.25)'
                        }}>
                            🤝
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 900, color: '#2C1A12' }}>
                                    تسوية عهدة الرحلة ومطابقة الأرصدة
                                </h2>
                                <span style={{
                                    background: 'rgba(194, 155, 98, 0.15)',
                                    color: '#C29B62',
                                    padding: '4px 12px',
                                    borderRadius: '50px',
                                    fontSize: '12px',
                                    fontWeight: 900
                                }}>
                                    #{trip.operationNumber}
                                </span>
                            </div>
                            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'rgba(44, 26, 18, 0.7)', fontWeight: 700 }}>
                                المندوب: <b>{trip.driverName}</b> (معرف الشريك: <code style={{ color: '#2C1A12' }}>{trip.driverId?.slice(0, 8)}...</code>) | السيارة: <b>{trip.vehiclePlate}</b>
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        disabled={isSubmitting}
                        style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '50%',
                            border: '1px solid rgba(28, 115, 171, 0.2)',
                            background: 'rgba(255, 255, 255, 0.8)',
                            color: '#122946',
                            fontSize: '20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)'; e.currentTarget.style.color = '#122946'; }}
                    >
                        ✕
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="settle-tabs" style={{
                    display: 'flex',
                    background: 'rgba(28, 115, 171, 0.05)',
                    padding: '8px 24px',
                    gap: '12px',
                    borderBottom: '1px solid rgba(28, 115, 171, 0.1)'
                }}>
                    <button
                        className="settle-tab-btn"
                        onClick={() => setActiveTab('inventory')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '16px',
                            border: 'none',
                            fontWeight: 900,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: activeTab === 'inventory' ? '#C29B62' : 'transparent',
                            color: activeTab === 'inventory' ? '#FFFFFF' : '#C29B62',
                            boxShadow: activeTab === 'inventory' ? '0 4px 15px rgba(168, 87, 60, 0.25)' : 'none'
                        }}
                    >
                        <span>📦 إرجاع البضائع للمستودع</span>
                        {totalReturnUnits > 0 && (
                            <span style={{
                                background: activeTab === 'inventory' ? 'rgba(255,255,255,0.3)' : 'rgba(194, 155, 98, 0.15)',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontSize: '11px'
                            }}>
                                {totalReturnUnits} حبة
                            </span>
                        )}
                    </button>

                    <button
                        className="settle-tab-btn"
                        onClick={() => setActiveTab('cash')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '16px',
                            border: 'none',
                            fontWeight: 900,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: activeTab === 'cash' ? '#C29B62' : 'transparent',
                            color: activeTab === 'cash' ? '#FFFFFF' : '#C29B62',
                            boxShadow: activeTab === 'cash' ? '0 4px 15px rgba(168, 87, 60, 0.25)' : 'none'
                        }}
                    >
                        <span>💵 توريد النقدية وتسوية الخزينة</span>
                        <span style={{
                            background: activeTab === 'cash' ? 'rgba(255,255,255,0.3)' : 'rgba(194, 155, 98, 0.15)',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px'
                        }}>
                            {formatCurrency(actualCashHandedOver)}
                        </span>
                    </button>

                    <button
                        className="settle-tab-btn"
                        onClick={() => setActiveTab('journal')}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '16px',
                            border: 'none',
                            fontWeight: 900,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: activeTab === 'journal' ? '#C29B62' : 'transparent',
                            color: activeTab === 'journal' ? '#FFFFFF' : '#C29B62',
                            boxShadow: activeTab === 'journal' ? '0 4px 15px rgba(168, 87, 60, 0.25)' : 'none'
                        }}
                    >
                        <span>⚖️ معاينة القيود المحاسبية</span>
                        <span style={{
                            background: isJournalBalanced ? 'rgba(22, 163, 74, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                            color: isJournalBalanced ? '#16a34a' : '#ef4444',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '11px'
                        }}>
                            {isJournalBalanced ? 'متزن ✅' : 'غير متزن ⚠️'}
                        </span>
                    </button>
                </div>

                {/* Modal Body / Scrollable Content */}
                <div style={{ padding: '24px 30px', overflowY: 'auto', flex: 1 }}>
                    {/* TAB 1: INVENTORY RETURN */}
                    {activeTab === 'inventory' && (
                        <div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '20px',
                                flexWrap: 'wrap',
                                gap: '15px'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#2C1A12' }}>
                                        حصر بضاعة السيارة وإرجاع المتبقي للمستودع الرئيسي
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'rgba(44, 26, 18, 0.7)', fontWeight: 600 }}>
                                        يتم تحويل الكميات المرتجعة مباشرة إلى المستودع الرئيسي وتوليد سند استلام وقيد مخزني مدين.
                                    </p>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <label style={{ fontSize: '13px', fontWeight: 800, color: '#2C1A12' }}>المستودع المستلم:</label>
                                    <select
                                        value={selectedMainWh}
                                        onChange={(e) => setSelectedMainWh(e.target.value)}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '12px',
                                            border: '1px solid rgba(194, 155, 98, 0.3)',
                                            background: 'rgba(255, 255, 255, 0.8)',
                                            fontWeight: 800,
                                            fontSize: '13px',
                                            color: '#2C1A12',
                                            outline: 'none'
                                        }}
                                    >
                                        {warehouses.map(wh => (
                                            <option key={wh.id} value={wh.id}>{wh.name} {wh.id === MAIN_WAREHOUSE_ID ? '(الرئيسي)' : ''}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Inventory Table */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.7)',
                                borderRadius: '20px',
                                border: '1px solid rgba(194, 155, 98, 0.25)',
                                overflow: 'hidden',
                                boxShadow: '0 4px 15px rgba(44, 26, 18, 0.05)',
                                marginBottom: '20px'
                            }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                        <thead style={{ background: 'rgba(194, 155, 98, 0.1)', borderBottom: '1px solid rgba(194, 155, 98, 0.2)' }}>
                                            <tr>
                                                <th style={{ padding: '12px 16px', color: '#2C1A12', fontWeight: 900 }}>الصنف</th>
                                                <th style={{ padding: '12px 16px', color: '#2C1A12', fontWeight: 900, textAlign: 'center' }}>المحمل</th>
                                                <th style={{ padding: '12px 16px', color: '#2C1A12', fontWeight: 900, textAlign: 'center' }}>المباع</th>
                                                <th style={{ padding: '12px 16px', color: '#f59e0b', fontWeight: 900, textAlign: 'center' }}>المتبقي بالسيارة</th>
                                                <th style={{ padding: '12px 16px', color: '#4E734F', fontWeight: 900, textAlign: 'center', width: '140px' }}>المرتجع للمستودع 🔄</th>
                                                <th style={{ padding: '12px 16px', color: '#ef4444', fontWeight: 900, textAlign: 'center', width: '110px' }}>تالف / هدر ⚠️</th>
                                                <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 900, textAlign: 'center', width: '110px' }}>عجز مفقود ❓</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>إجراء</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {returnRows.length > 0 ? returnRows.map((row, idx) => (
                                                <tr key={row.itemId} style={{ borderBottom: '1px solid rgba(194, 155, 98, 0.1)' }}>
                                                    <td style={{ padding: '12px 16px', fontWeight: 800 }}>
                                                        <div style={{ color: '#2C1A12' }}>{row.itemName}</div>
                                                        <div style={{ fontSize: '11px', color: 'rgba(44, 26, 18, 0.6)' }}>تكلفة: {formatCurrency(row.costPrice)} / {row.unit}</div>
                                                    </td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>{row.loadedQty}</td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: '#2C1A12' }}>{row.soldQty}</td>
                                                    <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: '#f59e0b', fontSize: '14px' }}>
                                                        {row.remainingQty}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                value={row.returnQty}
                                                                onChange={(e) => handleUpdateRow(idx, 'returnQty', Number(e.target.value))}
                                                                style={{
                                                                    width: '70px',
                                                                    padding: '8px',
                                                                    borderRadius: '10px',
                                                                    border: '1px solid #16a34a',
                                                                    background: 'rgba(22, 163, 74, 0.06)',
                                                                    textAlign: 'center',
                                                                    fontWeight: 900,
                                                                    color: '#16a34a',
                                                                    fontSize: '14px',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                            {row.remainingQty > 0 && (
                                                                <button
                                                                    type="button"
                                                                    title="إرجاع كامل المتبقي"
                                                                    onClick={() => handleReturnAll(idx)}
                                                                    style={{
                                                                        padding: '6px 8px',
                                                                        borderRadius: '8px',
                                                                        border: 'none',
                                                                        background: 'rgba(28, 115, 171, 0.12)',
                                                                        color: '#1C73AB',
                                                                        cursor: 'pointer',
                                                                        fontSize: '11px',
                                                                        fontWeight: 800
                                                                    }}
                                                                >
                                                                    الكل
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={row.wasteQty}
                                                            onChange={(e) => handleUpdateRow(idx, 'wasteQty', Number(e.target.value))}
                                                            style={{
                                                                width: '65px',
                                                                padding: '8px',
                                                                borderRadius: '10px',
                                                                border: '1px solid #ef4444',
                                                                background: 'rgba(239, 68, 68, 0.06)',
                                                                textAlign: 'center',
                                                                fontWeight: 800,
                                                                color: '#ef4444',
                                                                fontSize: '14px',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={row.shortageQty}
                                                            onChange={(e) => handleUpdateRow(idx, 'shortageQty', Number(e.target.value))}
                                                            style={{
                                                                width: '65px',
                                                                padding: '8px',
                                                                borderRadius: '10px',
                                                                border: '1px solid #64748b',
                                                                background: 'rgba(100, 116, 139, 0.06)',
                                                                textAlign: 'center',
                                                                fontWeight: 800,
                                                                color: '#334155',
                                                                fontSize: '14px',
                                                                outline: 'none'
                                                            }}
                                                        />
                                                    </td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveRow(idx)}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: '#ef4444',
                                                                cursor: 'pointer',
                                                                fontSize: '15px'
                                                            }}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </td>
                                                </tr>
                                            )) : (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '35px', textAlign: 'center', color: '#1C73AB', fontWeight: 800 }}>
                                                        لم يتم تحميل أصناف مسجلة مسبقاً لهذه الرحلة. يمكنك إضافة أصناف للإرجاع أدناه.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Summary Footer of table */}
                                <div style={{
                                    padding: '14px 20px',
                                    background: 'rgba(28, 115, 171, 0.05)',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '15px',
                                    fontSize: '13px',
                                    fontWeight: 800
                                }}>
                                    <div style={{ display: 'flex', gap: '20px' }}>
                                        <span>إجمالي المرتجع: <b style={{ color: '#16a34a' }}>{totalReturnUnits} حبة</b> ({formatCurrency(totalReturnValue)})</span>
                                        <span>إجمالي التوالف: <b style={{ color: '#ef4444' }}>{totalWasteUnits} حبة</b> ({formatCurrency(totalWasteValue)})</span>
                                        <span>إجمالي العجز: <b style={{ color: '#64748b' }}>{totalShortageUnits} حبة</b> ({formatCurrency(totalShortageValue)})</span>
                                    </div>

                                    {/* Add manual item */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <select
                                            value={selectedNewItemId}
                                            onChange={(e) => setSelectedNewItemId(e.target.value)}
                                            style={{
                                                padding: '6px 10px',
                                                borderRadius: '8px',
                                                border: '1px solid rgba(28, 115, 171, 0.3)',
                                                fontSize: '12px',
                                                outline: 'none'
                                            }}
                                        >
                                            <option value="">+ اختر صنفاً لإضافته للتسوية...</option>
                                            {inventoryItems.map(item => (
                                                <option key={item.id} value={item.id}>{item.name} ({item.unit || 'حبة'})</option>
                                            ))}
                                        </select>
                                        <button
                                            type="button"
                                            onClick={handleAddNewItem}
                                            disabled={!selectedNewItemId}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                border: 'none',
                                                background: selectedNewItemId ? '#1C73AB' : '#ccc',
                                                color: '#fff',
                                                cursor: selectedNewItemId ? 'pointer' : 'not-allowed',
                                                fontWeight: 800,
                                                fontSize: '12px'
                                            }}
                                        >
                                            إضافة
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: CASH SETTLEMENT */}
                    {activeTab === 'cash' && (
                        <div>
                            <h3 style={{ margin: '0 0 16px 0', fontSize: '17px', fontWeight: 900, color: '#122946' }}>
                                احتساب النقدية ومطابقة عهدة الصندوق
                            </h3>

                            {/* Cash Breakdown Grid */}
                            <div className="settle-grid-responsive" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(4, 1fr)',
                                gap: '15px',
                                marginBottom: '25px'
                            }}>
                                <div style={{
                                    background: 'rgba(28, 115, 171, 0.06)',
                                    borderRadius: '18px',
                                    padding: '16px',
                                    border: '1px solid rgba(28, 115, 171, 0.15)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '12px', color: '#1C73AB', fontWeight: 800 }}>مبيعات الكاش (+)</div>
                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#122946', marginTop: '6px' }}>
                                        {formatCurrency(trip.cashSales)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                        {trip.invoicesCount} فواتير بيع
                                    </div>
                                </div>

                                <div style={{
                                    background: 'rgba(22, 163, 74, 0.06)',
                                    borderRadius: '18px',
                                    padding: '16px',
                                    border: '1px solid rgba(22, 163, 74, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '12px', color: '#16a34a', fontWeight: 800 }}>تحصيلات من عملاء (+)</div>
                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#16a34a', marginTop: '6px' }}>
                                        {formatCurrency(trip.totalCollections)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                        سندات قبض أثناء الرحلة
                                    </div>
                                </div>

                                <div style={{
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    borderRadius: '18px',
                                    padding: '16px',
                                    border: '1px solid rgba(239, 68, 68, 0.2)',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 800 }}>مصروفات المندوب (-)</div>
                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444', marginTop: '6px' }}>
                                        {formatCurrency(trip.totalExpenses)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                                        وقود وصيانة وتشغيل
                                    </div>
                                </div>

                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(28, 115, 171, 0.15) 0%, rgba(40, 145, 200, 0.1) 100%)',
                                    borderRadius: '18px',
                                    padding: '16px',
                                    border: '1px solid #1C73AB',
                                    textAlign: 'center'
                                }}>
                                    <div style={{ fontSize: '12px', color: '#1C73AB', fontWeight: 900 }}>صافي النقدية المستحقة (=)</div>
                                    <div style={{ fontSize: '22px', fontWeight: 900, color: '#1C73AB', marginTop: '6px' }}>
                                        {formatCurrency(netCashDue)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: '#122946', fontWeight: 700, marginTop: '4px' }}>
                                        الواجب توريده للخزينة
                                    </div>
                                </div>
                            </div>

                            {/* Handover Input & Safe Selector */}
                            <div style={{
                                background: 'rgba(255, 255, 255, 0.75)',
                                borderRadius: '22px',
                                padding: '24px',
                                border: '1px solid rgba(28, 115, 171, 0.18)',
                                boxShadow: '0 8px 25px rgba(28, 115, 171, 0.06)'
                            }}>
                                <div className="settle-grid-responsive" style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '20px',
                                    marginBottom: '20px'
                                }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, color: '#122946', marginBottom: '8px' }}>
                                            المبلغ المورد فعلياً للخزينة (ر.س) 💵
                                        </label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={actualCashHandedOver}
                                                onChange={(e) => setActualCashHandedOver(Number(e.target.value))}
                                                style={{
                                                    flex: 1,
                                                    padding: '12px 16px',
                                                    borderRadius: '14px',
                                                    border: '2px solid #1C73AB',
                                                    background: '#FFFFFF',
                                                    fontSize: '18px',
                                                    fontWeight: 900,
                                                    color: '#1C73AB',
                                                    outline: 'none'
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setActualCashHandedOver(netCashDue)}
                                                style={{
                                                    padding: '10px 16px',
                                                    borderRadius: '14px',
                                                    border: 'none',
                                                    background: 'rgba(28, 115, 171, 0.15)',
                                                    color: '#1C73AB',
                                                    fontWeight: 900,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap'
                                                }}
                                            >
                                                توريد كامل الصافي ⚡
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 900, color: '#122946', marginBottom: '8px' }}>
                                            الخزينة / الحساب البنكي المستلم 🏦
                                        </label>
                                        <select
                                            value={selectedSafeAcc}
                                            onChange={(e) => setSelectedSafeAcc(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '13px 16px',
                                                borderRadius: '14px',
                                                border: '1px solid rgba(28, 115, 171, 0.3)',
                                                background: '#FFFFFF',
                                                fontSize: '14px',
                                                fontWeight: 800,
                                                color: '#122946',
                                                outline: 'none'
                                            }}
                                        >
                                            {accounts.map(acc => (
                                                <option key={acc.id} value={acc.id}>
                                                    {acc.code} - {acc.name} {acc.id === ACC.CASH_BOX ? '(الخزينة الرئيسية)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Difference Status Banner */}
                                <div style={{
                                    padding: '14px 20px',
                                    borderRadius: '16px',
                                    background: cashDifference >= 0 ? 'rgba(22, 163, 74, 0.1)' : 'rgba(245, 158, 11, 0.12)',
                                    border: `1px solid ${cashDifference >= 0 ? '#16a34a' : '#f59e0b'}`,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ fontSize: '20px' }}>{cashDifference >= 0 ? '✅' : '⚠️'}</span>
                                        <div>
                                            <div style={{ fontWeight: 900, color: cashDifference >= 0 ? '#16a34a' : '#b45309', fontSize: '14px' }}>
                                                {cashDifference === 0 && 'مطابقة تامة! النقدية الموردة تساوي صافي استحقاق الرحلة بالكامل.'}
                                                {cashDifference > 0 && `يوجد فائض في التوريد بقيمة ${formatCurrency(cashDifference)} لصالح الشركة.`}
                                                {cashDifference < 0 && `يوجد عجز في عهدة المندوب بقيمة ${formatCurrency(cashShortage)}.`}
                                            </div>
                                            {cashDifference < 0 && (
                                                <div style={{ fontSize: '12px', color: '#78350f', marginTop: '3px' }}>
                                                    اختر طريقة معالجة العجز أدناه لترحيل القيد المحاسبي.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {cashDifference < 0 && (
                                        <div style={{ display: 'flex', gap: '15px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="shortageAction"
                                                    checked={shortageAction === 'debt_on_delegate'}
                                                    onChange={() => setShortageAction('debt_on_delegate')}
                                                />
                                                <span>تسجيل كذمة/سلفة على المندوب (حـ/ 128)</span>
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, cursor: 'pointer' }}>
                                                <input
                                                    type="radio"
                                                    name="shortageAction"
                                                    checked={shortageAction === 'rounding'}
                                                    onChange={() => setShortageAction('rounding')}
                                                />
                                                <span>تسويات وفروق هللات (حـ/ 527)</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: ACCOUNTING JOURNAL PREVIEW */}
                    {activeTab === 'journal' && (
                        <div>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '16px',
                                flexWrap: 'wrap',
                                gap: '10px'
                            }}>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: '#122946' }}>
                                        معاينة القيود المحاسبية وسند القبض المولدة آلياً
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#1C73AB', fontWeight: 600 }}>
                                        يتم ربط سطر قيد العهدة والمخزون مباشرة بمعرف المندوب (<code>partner_id</code>) لحفظ مديونية وذمة السائق بدقة.
                                    </p>
                                </div>

                                <span style={{
                                    background: isJournalBalanced ? 'rgba(22, 163, 74, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                    color: isJournalBalanced ? '#16a34a' : '#ef4444',
                                    padding: '6px 16px',
                                    borderRadius: '50px',
                                    fontWeight: 900,
                                    fontSize: '13px'
                                }}>
                                    {isJournalBalanced ? '✅ القيد المحاسبي متزن 100%' : '⚠️ القيد غير متزن'}
                                </span>
                            </div>

                            <div style={{
                                background: 'rgba(255, 255, 255, 0.75)',
                                borderRadius: '20px',
                                border: '1px solid rgba(28, 115, 171, 0.18)',
                                overflow: 'hidden',
                                boxShadow: '0 4px 15px rgba(28, 115, 171, 0.05)',
                                marginBottom: '20px'
                            }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'right', fontSize: '13px' }}>
                                    <thead style={{ background: 'rgba(28, 115, 171, 0.08)', borderBottom: '1px solid rgba(28, 115, 171, 0.15)' }}>
                                        <tr>
                                            <th style={{ padding: '12px 16px', color: '#1C73AB', fontWeight: 900 }}>رمز الحساب</th>
                                            <th style={{ padding: '12px 16px', color: '#1C73AB', fontWeight: 900 }}>اسم الحساب الدفتري</th>
                                            <th style={{ padding: '12px 16px', color: '#1C73AB', fontWeight: 900 }}>الطرف المرتبط (Partner ID)</th>
                                            <th style={{ padding: '12px 16px', color: '#16a34a', fontWeight: 900, textAlign: 'center' }}>مدين (+)</th>
                                            <th style={{ padding: '12px 16px', color: '#1C73AB', fontWeight: 900, textAlign: 'center' }}>دائن (-)</th>
                                            <th style={{ padding: '12px 16px', color: '#64748b', fontWeight: 900 }}>البيان / الشرح</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {journalPreviewLines.length > 0 ? journalPreviewLines.map((line, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(28, 115, 171, 0.08)' }}>
                                                <td style={{ padding: '12px 16px', fontWeight: 900, color: '#1C73AB' }}>
                                                    <span style={{ background: 'rgba(28, 115, 171, 0.1)', padding: '3px 8px', borderRadius: '6px' }}>{line.code}</span>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 800 }}>{line.accountName}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 800, color: line.partnerName ? '#1C73AB' : '#94a3b8' }}>
                                                    {line.partnerName ? `👤 ${line.partnerName}` : '---'}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: line.debit > 0 ? '#16a34a' : '#cbd5e1' }}>
                                                    {line.debit > 0 ? formatCurrency(line.debit) : '---'}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: line.credit > 0 ? '#1C73AB' : '#cbd5e1' }}>
                                                    {line.credit > 0 ? formatCurrency(line.credit) : '---'}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontSize: '12px', color: '#64748b' }}>{line.notes}</td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                                                    لا توجد قيود مولدة (المبالغ والكميات تساوي صفر)
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot style={{ background: 'rgba(28, 115, 171, 0.05)', fontWeight: 900 }}>
                                        <tr>
                                            <td colSpan={3} style={{ padding: '14px 16px', textAlign: 'left', color: '#122946' }}>المجموع الكلي:</td>
                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: '#16a34a', fontSize: '15px' }}>{formatCurrency(totalDebit)}</td>
                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: '#1C73AB', fontSize: '15px' }}>{formatCurrency(totalCredit)}</td>
                                            <td></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Common Settlement Settings (Always Visible at bottom of modal body) */}
                    <div style={{
                        marginTop: '20px',
                        padding: '16px 20px',
                        borderRadius: '18px',
                        background: 'rgba(28, 115, 171, 0.04)',
                        border: '1px solid rgba(28, 115, 171, 0.12)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                    }}>
                        <div className="settle-grid-responsive" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '15px', alignItems: 'center' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1C73AB', marginBottom: '6px' }}>
                                    تاريخ التسوية 📅
                                </label>
                                <input
                                    type="date"
                                    value={settlementDate}
                                    onChange={(e) => setSettlementDate(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(28, 115, 171, 0.3)',
                                        background: '#fff',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: '#1C73AB', marginBottom: '6px' }}>
                                    ملاحظات التسوية 📝
                                </label>
                                <input
                                    type="text"
                                    placeholder="أي ملاحظات إضافية حول التوريد أو استلام البضائع..."
                                    value={settlementNotes}
                                    onChange={(e) => setSettlementNotes(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(28, 115, 171, 0.3)',
                                        background: '#fff',
                                        fontSize: '13px',
                                        outline: 'none'
                                    }}
                                />
                            </div>
                        </div>

                        <label style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            fontSize: '13px',
                            fontWeight: 800,
                            color: '#122946',
                            cursor: 'pointer',
                            marginTop: '4px'
                        }}>
                            <input
                                type="checkbox"
                                checked={closeTripAfterSettlement}
                                onChange={(e) => setCloseTripAfterSettlement(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: '#1C73AB' }}
                            />
                            <span>إغلاق الرحلة رسمياً بعد اعتماد التسوية (تغيير حالة الرحلة إلى "مغلق" 🔒)</span>
                        </label>
                    </div>
                </div>

                {/* Modal Footer */}
                <div style={{
                    padding: '18px 30px',
                    borderTop: '1px solid rgba(28, 115, 171, 0.12)',
                    background: 'rgba(255, 255, 255, 0.9)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        style={{
                            padding: '12px 24px',
                            borderRadius: '50px',
                            border: '1px solid rgba(28, 115, 171, 0.2)',
                            background: 'transparent',
                            color: '#122946',
                            fontWeight: 800,
                            fontSize: '14px',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                        }}
                    >
                        إلغاء التراجع
                    </button>

                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        style={{
                            padding: '14px 36px',
                            borderRadius: '50px',
                            border: 'none',
                            background: isSubmitting ? '#94a3b8' : 'linear-gradient(135deg, #C29B62 0%, #A8573C 100%)',
                            color: '#FFFFFF',
                            fontWeight: 900,
                            fontSize: '15px',
                            cursor: isSubmitting ? 'not-allowed' : 'pointer',
                            boxShadow: '0 8px 25px rgba(168, 87, 60, 0.35)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            transition: 'all 0.3s'
                        }}
                    >
                        {isSubmitting ? (
                            <>
                                <span>جاري ترحيل القيود واعتماد التسوية...</span>
                                <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span>
                            </>
                        ) : (
                            <>
                                <span>اعتماد التسوية وإرجاع البضائع وتوريد الخزينة</span>
                                <span style={{ fontSize: '18px' }}>🚀</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
