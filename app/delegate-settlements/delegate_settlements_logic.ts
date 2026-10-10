"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { useAuth } from '@/components/authGuard';
import { useToast } from '@/lib/toast-context';
import { ACC } from '@/lib/account-ids';
import { MAIN_WAREHOUSE_ID, syncAllWarehouseBalances } from '@/lib/inventory_engine';
import { emitTableChange } from '@/lib/useRealtimeSync';
import { sendSystemNotification } from '@/lib/notificationService';
import { classifyPaymentMethod } from '@/lib/helpers';

export interface TripInventoryItem {
    itemId: string;
    itemName: string;
    unit: string;
    costPrice: number;
    defaultPrice: number;
    loadedQty: number;
    soldQty: number;
    returnedQty: number;
    wasteQty: number;
    shortageQty: number;
    remainingQty: number;
}

export interface SettlementPayload {
    tripId: string;
    operationNumber: string;
    driverId: string;
    driverName: string;
    driverPhone?: string;
    driverCode?: string;
    vehicleId?: string | null;
    vehiclePlate?: string;
    warehouseId?: string | null;
    warehouseName?: string;
    mainWarehouseId: string;
    settlementDate: string;
    // Cash Settlement
    cashAmount: number;
    safeBankAccId: string;
    netCashDue: number;
    cashShortage: number;
    shortageAction: 'debt_on_delegate' | 'rounding' | 'none';
    totalSales?: number;
    cashSales?: number;
    creditSales?: number;
    totalCollections?: number;
    totalExpenses?: number;
    // Inventory Settlement
    inventoryReturns: Array<{
        itemId: string;
        itemName: string;
        costPrice: number;
        returnQty: number;
        wasteQty: number;
        shortageQty: number;
        notes?: string;
    }>;
    closeTrip: boolean;
    notes: string;
}

export function useDelegateSettlementsLogic() {
    const queryClient = useQueryClient();
    const { showToast } = useToast();
    const { profile } = useAuth();

    // Filters
    const [globalSearch, setGlobalSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'settled' | 'shortage'>('all');

    // Selected trip for settlement modal
    const [selectedTripForSettlement, setSelectedTripForSettlement] = useState<any | null>(null);
    const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false);

    // Selected trip for print modal
    const [selectedTripForPrint, setSelectedTripForPrint] = useState<any | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    // 1. Fetch Fleet Operations (Trips)
    const tripsQuery = useQuery({
        queryKey: ['delegate_settlements_trips', dateFrom, dateTo, profile?.id],
        queryFn: async () => {
            let q = supabase
                .from('fleet_operations')
                .select('id, operation_number, operation_date, status, vehicle_id, driver_id, warehouse_id, total_sales, total_expenses, inventory_cost, net_profit, notes, created_at')
                .order('operation_date', { ascending: false });

            if (dateFrom) q = q.gte('operation_date', dateFrom);
            if (dateTo) q = q.lte('operation_date', dateTo);

            if (profile) {
                const role = String(profile.role || '').toLowerCase();
                const isGlobalAdmin = role === 'admin' || role === 'super_admin' || role === 'manager' || profile.is_admin === true;
                if (!isGlobalAdmin && profile.linked_partner_id) {
                    q = q.eq('driver_id', profile.linked_partner_id);
                }
            }

            const [opsRes, driversRes, vehRes, whRes] = await Promise.all([
                q,
                supabase.from('partners').select('id, name, phone, code, partner_type, account_id'),
                supabase.from('fleet_vehicles').select('id, plate_number, vehicle_model'),
                supabase.from('warehouses').select('id, name, type')
            ]);

            if (opsRes.error) throw opsRes.error;

            const driverMap = new Map((driversRes.data || []).map((d: any) => [d.id, d]));
            const vehMap = new Map((vehRes.data || []).map((v: any) => [v.id, v]));
            const whMap = new Map((whRes.data || []).map((w: any) => [w.id, w]));

            return (opsRes.data || []).map((op: any) => ({
                ...op,
                driver: driverMap.get(op.driver_id) || null,
                vehicle: vehMap.get(op.vehicle_id) || null,
                warehouse: whMap.get(op.warehouse_id) || null
            }));
        },
        enabled: !!profile,
        staleTime: 0
    });

    // 2. Fetch Invoices for trips
    const invoicesQuery = useQuery({
        queryKey: ['delegate_settlements_invoices', dateFrom, dateTo],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('invoices')
                .select('id, invoice_number, date, total_amount, payment_method, status, fleet_operation_id, delegate_id, lines_data')
                .not('fleet_operation_id', 'is', null)
                .neq('status', 'ملغي');
            if (error) throw error;
            return data || [];
        },
        staleTime: 0
    });

    // 3. Fetch Expenses for trips
    const expensesQuery = useQuery({
        queryKey: ['delegate_settlements_expenses', dateFrom, dateTo],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('expenses')
                .select('id, exp_date, description, total_price, paid_amount, payment_method, fleet_operation_id, payee_id')
                .not('fleet_operation_id', 'is', null)
                .neq('is_deleted', true);
            if (error) throw error;
            return data || [];
        },
        staleTime: 0
    });

    // 4. Fetch Receipts (Customer collections & settlement receipts)
    const receiptsQuery = useQuery({
        queryKey: ['delegate_settlements_receipts', dateFrom, dateTo],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('receipt_vouchers')
                .select('id, receipt_number, date, amount, payment_method, fleet_operation_id, delegate_id, partner_id, status, notes, safe_bank_acc_id, invoice_id')
                .not('fleet_operation_id', 'is', null)
                .neq('status', 'ملغي');
            if (error) throw error;
            return data || [];
        },
        staleTime: 0
    });

    // 5. Fetch Inventory Transactions for trips
    const inventoryTxnsQuery = useQuery({
        queryKey: ['delegate_settlements_inventory_txns', dateFrom, dateTo],
        queryFn: async () => {
            const [txRes, itemsRes] = await Promise.all([
                supabase
                    .from('inventory_transactions')
                    .select('id, transaction_number, transaction_date, type, quantity, item_id, unit_price, total_price, status, fleet_operation_id, warehouse_id, destination_warehouse_id, delegate_id, partner_id, notes')
                    .not('fleet_operation_id', 'is', null),
                supabase
                    .from('inventory_items')
                    .select('id, name, unit, cost_price, default_price')
            ]);
            if (txRes.error) throw txRes.error;
            const itemsMap = new Map((itemsRes.data || []).map((i: any) => [i.id, i]));
            return (txRes.data || []).map((t: any) => ({
                ...t,
                item: itemsMap.get(t.item_id) || null
            }));
        },
        staleTime: 0
    });

    // 6. Fetch Vehicle Inventory
    const vehicleInventoryQuery = useQuery({
        queryKey: ['delegate_settlements_vehicle_inv'],
        queryFn: async () => {
            const [vInvRes, itemsRes] = await Promise.all([
                supabase
                    .from('vehicle_inventory')
                    .select('id, fleet_operation_id, item_id, quantity, loaded_qty, sold_qty, returned_qty, waste_qty, shortage_qty'),
                supabase
                    .from('inventory_items')
                    .select('id, name, unit, cost_price, default_price')
            ]);
            if (vInvRes.error) throw vInvRes.error;
            const itemsMap = new Map((itemsRes.data || []).map((i: any) => [i.id, i]));
            return (vInvRes.data || []).map((v: any) => ({
                ...v,
                item: itemsMap.get(v.item_id) || null
            }));
        },
        staleTime: 0
    });

    // 7. Fetch Active Inventory Items (for adding manual items during settlement)
    const inventoryItemsQuery = useQuery({
        queryKey: ['delegate_settlements_active_items'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('inventory_items')
                .select('id, name, unit, current_quantity, cost_price, default_price, code')
                .eq('is_active', true)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        staleTime: 1000 * 60 * 5
    });

    // 8. Fetch Cash/Bank Accounts
    const accountsQuery = useQuery({
        queryKey: ['delegate_settlements_cash_accounts'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('accounts')
                .select('id, code, name, account_type')
                .or('code.ilike.122%,code.ilike.129%,code.ilike.121%')
                .order('code');
            if (error) throw error;
            return data || [];
        },
        staleTime: 1000 * 60 * 10
    });

    // 9. Fetch Warehouses
    const warehousesQuery = useQuery({
        queryKey: ['delegate_settlements_warehouses'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('warehouses')
                .select('id, name, type, vehicle_id')
                .eq('is_active', true)
                .order('name');
            if (error) throw error;
            return data || [];
        },
        staleTime: 1000 * 60 * 10
    });

    const rawTrips = tripsQuery.data || [];
    const rawInvoices = invoicesQuery.data || [];
    const rawExpenses = expensesQuery.data || [];
    const rawReceipts = receiptsQuery.data || [];
    const rawTxns = inventoryTxnsQuery.data || [];
    const rawVehicleInv = vehicleInventoryQuery.data || [];

    // Helper to check if payment method is cash
    const isCashMethod = (method: string) => {
        if (!method) return true;
        const m = method.toLowerCase();
        return m.includes('كاش') || m.includes('نقدي') || m === 'cash';
    };

    // Helper to check if payment method is credit
    const isCreditMethod = (method: string) => {
        if (!method) return false;
        const m = method.toLowerCase();
        return m.includes('آجل') || m.includes('اجل') || m === 'credit';
    };

    // Process & Aggregate All Data by Trip
    const processedSettlements = useMemo(() => {
        // Group invoices by trip
        const invoicesByTrip = new Map<string, any[]>();
        rawInvoices.forEach(inv => {
            if (inv.fleet_operation_id) {
                const list = invoicesByTrip.get(inv.fleet_operation_id) || [];
                list.push(inv);
                invoicesByTrip.set(inv.fleet_operation_id, list);
            }
        });

        // Group expenses by trip
        const expensesByTrip = new Map<string, any[]>();
        rawExpenses.forEach(exp => {
            if (exp.fleet_operation_id) {
                const list = expensesByTrip.get(exp.fleet_operation_id) || [];
                list.push(exp);
                expensesByTrip.set(exp.fleet_operation_id, list);
            }
        });

        // Group receipts by trip (separate customer collections vs settlement handovers)
        const receiptsByTrip = new Map<string, { collections: any[], settlements: any[] }>();
        rawReceipts.forEach(rc => {
            if (rc.fleet_operation_id) {
                const current = receiptsByTrip.get(rc.fleet_operation_id) || { collections: [], settlements: [] };
                const isSettlement = String(rc.receipt_number || '').includes('SETTLE') || 
                                     String(rc.notes || '').includes('تسوية عهدة') || 
                                     String(rc.notes || '').includes('توريد نقدية');
                if (isSettlement) {
                    current.settlements.push(rc);
                } else {
                    current.collections.push(rc);
                }
                receiptsByTrip.set(rc.fleet_operation_id, current);
            }
        });

        // Group inventory transactions by trip
        const txnsByTrip = new Map<string, any[]>();
        rawTxns.forEach(tx => {
            if (tx.fleet_operation_id) {
                const list = txnsByTrip.get(tx.fleet_operation_id) || [];
                list.push(tx);
                txnsByTrip.set(tx.fleet_operation_id, list);
            }
        });

        // Group vehicle inventory by trip
        const vInvByTrip = new Map<string, any[]>();
        rawVehicleInv.forEach(vi => {
            if (vi.fleet_operation_id) {
                const list = vInvByTrip.get(vi.fleet_operation_id) || [];
                list.push(vi);
                vInvByTrip.set(vi.fleet_operation_id, list);
            }
        });

        return rawTrips.map((trip: any) => {
            const tripInvoices = invoicesByTrip.get(trip.id) || [];
            const tripExpenses = expensesByTrip.get(trip.id) || [];
            const tripReceipts = receiptsByTrip.get(trip.id) || { collections: [], settlements: [] };
            const tripTxns = txnsByTrip.get(trip.id) || [];
            const tripVInv = vInvByTrip.get(trip.id) || [];

            // 1. Sales breakdown
            let totalSales = 0;
            let cashSales = 0;
            let creditSales = 0;
            let cardSales = 0;
            let otherSales = 0;
            const tripCashInvoiceIds = new Set<string>();

            tripInvoices.forEach(inv => {
                const amt = Number(inv.total_amount || 0);
                totalSales += amt;
                const cat = classifyPaymentMethod(inv.payment_method);
                if (cat === 'cash') {
                    cashSales += amt;
                    tripCashInvoiceIds.add(inv.id);
                } else if (cat === 'credit') {
                    creditSales += amt;
                } else if (cat === 'card') {
                    cardSales += amt;
                } else {
                    otherSales += amt;
                }
            });

            // 2. Collections during trip
            // 🛡️ CRITICAL FIX: Exclude receipts that correspond to cash invoices of this trip to prevent DOUBLE COUNTING!
            const standaloneReceipts = tripReceipts.collections.filter(rc => {
                if (rc.invoice_id && tripCashInvoiceIds.has(rc.invoice_id)) {
                    return false;
                }
                return true;
            });

            // Standalone cash collections that actually entered the driver's custody:
            const standaloneCashCollections = standaloneReceipts.reduce((s, r) => {
                if (classifyPaymentMethod(r.payment_method) === 'cash') {
                    return s + Number(r.amount || 0);
                }
                return s;
            }, 0);

            const totalCollections = standaloneReceipts.reduce((s, r) => s + Number(r.amount || 0), 0);

            // 3. Expenses paid by delegate
            const totalExpenses = tripExpenses.reduce((s, e) => s + Number(e.paid_amount || e.total_price || 0), 0);
            const cashExpenses = tripExpenses.reduce((s, e) => {
                if (classifyPaymentMethod(e.payment_method) === 'cash') {
                    return s + Number(e.paid_amount || e.total_price || 0);
                }
                return s;
            }, 0);

            // 4. Cash settlements handed over to company safe
            const handedOverCash = tripReceipts.settlements.reduce((s, r) => s + Number(r.amount || 0), 0);

            // 5. Net cash custody due from delegate
            // Formula: Cash sales + Standalone Cash Collections - Cash Expenses paid by delegate
            const netCashDue = Math.max(0, cashSales + standaloneCashCollections - cashExpenses);
            const remainingCashCustody = Math.max(0, netCashDue - handedOverCash);
            const cashDifference = handedOverCash - netCashDue;

            // 6. Inventory breakdown per item
            const itemMap = new Map<string, TripInventoryItem>();

            // Populate from vehicle_inventory if available
            tripVInv.forEach(vi => {
                const itm = vi.item || {};
                const loaded = Number(vi.loaded_qty || vi.quantity || 0);
                const sold = Number(vi.sold_qty || 0);
                const returned = Number(vi.returned_qty || 0);
                const waste = Number(vi.waste_qty || 0);
                const shortage = Number(vi.shortage_qty || 0);
                const rem = Math.max(0, loaded - sold - returned - waste - shortage);

                itemMap.set(vi.item_id, {
                    itemId: vi.item_id,
                    itemName: itm.name || 'صنف',
                    unit: itm.unit || 'حبة',
                    costPrice: Number(itm.cost_price || 0),
                    defaultPrice: Number(itm.default_price || 0),
                    loadedQty: loaded,
                    soldQty: sold,
                    returnedQty: returned,
                    wasteQty: waste,
                    shortageQty: shortage,
                    remainingQty: rem
                });
            });

            // Correlate with inventory_transactions
            tripTxns.forEach(tx => {
                const itmId = tx.item_id;
                if (!itmId) return;
                const existing = itemMap.get(itmId) || {
                    itemId: itmId,
                    itemName: tx.item?.name || 'صنف',
                    unit: tx.item?.unit || 'حبة',
                    costPrice: Number(tx.unit_price || tx.item?.cost_price || 0),
                    defaultPrice: Number(tx.item?.default_price || 0),
                    loadedQty: 0,
                    soldQty: 0,
                    returnedQty: 0,
                    wasteQty: 0,
                    shortageQty: 0,
                    remainingQty: 0
                };

                const qty = Number(tx.quantity || 0);
                if (tx.type === 'out' || tx.type === 'transfer_out') {
                    // Loaded onto vehicle
                    if (tripVInv.length === 0) existing.loadedQty += qty;
                } else if (tx.type === 'in' || tx.type === 'transfer_in') {
                    // Returned to main warehouse
                    if (tripVInv.length === 0) existing.returnedQty += qty;
                } else if (tx.type === 'waste') {
                    if (tripVInv.length === 0) existing.wasteQty += qty;
                } else if (tx.type === 'sales_deduction') {
                    if (tripVInv.length === 0) existing.soldQty += qty;
                }

                if (tripVInv.length === 0) {
                    existing.remainingQty = Math.max(0, existing.loadedQty - existing.soldQty - existing.returnedQty - existing.wasteQty);
                }

                itemMap.set(itmId, existing);
            });

            // Also check invoice lines for sold quantities if tripTxns had no sales_deduction
            if (tripVInv.length === 0) {
                tripInvoices.forEach(inv => {
                    if (Array.isArray(inv.lines_data)) {
                        inv.lines_data.forEach((line: any) => {
                            const lineItemId = line.item_id;
                            if (lineItemId && itemMap.has(lineItemId)) {
                                const itmObj = itemMap.get(lineItemId)!;
                                if (itmObj.soldQty === 0) {
                                    itmObj.soldQty += Number(line.quantity || line.qty || 0);
                                    itmObj.remainingQty = Math.max(0, itmObj.loadedQty - itmObj.soldQty - itmObj.returnedQty - itmObj.wasteQty);
                                }
                            }
                        });
                    }
                });
            }

            const inventoryItems = Array.from(itemMap.values());
            const totalLoadedQty = inventoryItems.reduce((s, i) => s + i.loadedQty, 0);
            const totalSoldQty = inventoryItems.reduce((s, i) => s + i.soldQty, 0);
            const totalReturnedQty = inventoryItems.reduce((s, i) => s + i.returnedQty, 0);
            const totalWasteQty = inventoryItems.reduce((s, i) => s + i.wasteQty, 0);
            const totalRemainingQty = inventoryItems.reduce((s, i) => s + i.remainingQty, 0);

            // Settlement Status
            const isFullySettled = (trip.status === 'مغلق' || (remainingCashCustody <= 0.05 && totalRemainingQty === 0 && (totalLoadedQty > 0 || totalSales > 0)));
            const isPartiallySettled = !isFullySettled && (handedOverCash > 0 || totalReturnedQty > 0);
            const settlementStatus: 'settled' | 'partial' | 'pending' = isFullySettled ? 'settled' : (isPartiallySettled ? 'partial' : 'pending');

            return {
                id: trip.id,
                operationNumber: trip.operation_number,
                date: trip.operation_date,
                status: trip.status || 'مفتوح',
                settlementStatus,
                driverId: trip.driver_id,
                driverName: trip.driver?.name || 'بدون مندوب',
                driverPhone: trip.driver?.phone || '',
                driverCode: trip.driver?.code || '',
                driverPartner: trip.driver,
                vehicleId: trip.vehicle_id,
                vehiclePlate: trip.vehicle?.plate_number || 'بدون سيارة',
                vehicleModel: trip.vehicle?.vehicle_model || '',
                warehouseId: trip.warehouse_id,
                warehouseName: trip.warehouse?.name || 'المستودع الرئيسي',
                // Sales
                totalSales,
                cashSales,
                creditSales,
                cardSales,
                otherSales,
                invoicesCount: tripInvoices.length,
                // Receipts & Collections
                totalCollections,
                standaloneCashCollections,
                handedOverCash,
                collections: standaloneReceipts,
                settlementReceipts: tripReceipts.settlements,
                // Expenses
                totalExpenses,
                cashExpenses,
                // Balances
                netCashDue,
                remainingCashCustody,
                cashDifference,
                // Inventory
                inventoryItems,
                totalLoadedQty,
                totalSoldQty,
                totalReturnedQty,
                totalWasteQty,
                totalRemainingQty
            };
        });
    }, [rawTrips, rawInvoices, rawExpenses, rawReceipts, rawTxns, rawVehicleInv]);

    // Filter by Search & Status Tab
    const filteredSettlements = useMemo(() => {
        let res = processedSettlements;

        // Status Filter Tab
        if (statusFilter === 'pending') {
            res = res.filter(ts => ts.settlementStatus === 'pending' || ts.settlementStatus === 'partial');
        } else if (statusFilter === 'settled') {
            res = res.filter(ts => ts.settlementStatus === 'settled');
        } else if (statusFilter === 'shortage') {
            res = res.filter(ts => ts.remainingCashCustody > 0 || ts.totalRemainingQty > 0);
        }

        // Global Text Search
        if (globalSearch.trim()) {
            const s = globalSearch.toLowerCase().trim();
            res = res.filter(ts =>
                ts.driverName.toLowerCase().includes(s) ||
                String(ts.operationNumber).toLowerCase().includes(s) ||
                ts.vehiclePlate.toLowerCase().includes(s) ||
                (ts.driverPhone && ts.driverPhone.includes(s))
            );
        }

        return res;
    }, [processedSettlements, statusFilter, globalSearch]);

    // KPI Totals across all trips
    const totals = useMemo(() => {
        return processedSettlements.reduce((acc, curr) => {
            acc.totalTrips += 1;
            if (curr.settlementStatus === 'settled') acc.settledTrips += 1;
            else acc.pendingTrips += 1;

            acc.totalSales += curr.totalSales;
            acc.cashSales += curr.cashSales;
            acc.creditSales += curr.creditSales;
            acc.totalCollections += curr.totalCollections;
            acc.totalExpenses += curr.totalExpenses;
            acc.totalNetCashDue += curr.netCashDue;
            acc.totalHandedOverCash += curr.handedOverCash;
            acc.totalRemainingCash += curr.remainingCashCustody;
            acc.totalRemainingItems += curr.totalRemainingQty;

            return acc;
        }, {
            totalTrips: 0,
            settledTrips: 0,
            pendingTrips: 0,
            totalSales: 0,
            cashSales: 0,
            creditSales: 0,
            totalCollections: 0,
            totalExpenses: 0,
            totalNetCashDue: 0,
            totalHandedOverCash: 0,
            totalRemainingCash: 0,
            totalRemainingItems: 0
        });
    }, [processedSettlements]);

    // 🚀 Execute Settlement Mutation
    const executeSettlementMutation = useMutation({
        mutationFn: async (payload: SettlementPayload) => {
            const {
                tripId,
                operationNumber,
                driverId,
                driverName,
                driverPhone,
                driverCode,
                vehicleId,
                vehiclePlate,
                warehouseId,
                warehouseName,
                safeBankAccId,
                cashAmount,
                netCashDue,
                cashShortage,
                shortageAction,
                totalSales,
                cashSales,
                creditSales,
                totalCollections,
                totalExpenses,
                inventoryReturns,
                closeTrip,
                settlementDate,
                notes,
                mainWarehouseId
            } = payload;

            const date = settlementDate || new Date().toISOString().split('T')[0];
            const targetMainWh = mainWarehouseId || MAIN_WAREHOUSE_ID;
            const targetSafeAcc = safeBankAccId || ACC.CASH_BOX;

            // ⚡ Execute complete settlement atomically via Supabase RPC
            const { data: rpcRes, error: rpcErr } = await supabase.rpc('rpc_settle_fleet_trip', {
                p_data: {
                    fleet_operation_id: tripId,
                    settlement_date: date,
                    actual_cash_collected: cashAmount,
                    safe_bank_acc_id: targetSafeAcc,
                    shortage_action: shortageAction,
                    close_trip: closeTrip,
                    return_warehouse_id: targetMainWh,
                    notes,
                    lines: (inventoryReturns || []).map(r => ({
                        item_id: r.itemId,
                        returned_qty: Number(r.returnQty || 0),
                        waste_qty: Number(r.wasteQty || 0),
                        shortage_qty: Number(r.shortageQty || 0),
                        unit_price: Number(r.costPrice || 0),
                        notes: r.notes
                    }))
                }
            });

            if (rpcErr) throw rpcErr;
            if (!rpcRes?.success) throw new Error(rpcRes?.message || 'فشلت تسوية رحلة الأسطول');

            // ─────────────────────────────────────────────────────────────
            // REALTIME NOTIFICATIONS & CACHE INVALIDATIONS
            // ─────────────────────────────────────────────────────────────
            emitTableChange('fleet_operations');
            emitTableChange('receipt_vouchers');
            emitTableChange('inventory_transactions');
            emitTableChange('warehouse_inventory');
            emitTableChange('vehicle_inventory');
            emitTableChange('journal_headers');
            emitTableChange('journal_lines');

            sendSystemNotification({
                title: `🤝 تسوية عهدة رحلة #${operationNumber}`,
                message: `تم اعتماد تسوية عهدة المندوب ${driverName} بنجاح، وتوريد مبلغ ${cashAmount.toLocaleString('ar-SA')} ر.س للخزينة وإرجاع البضائع للمستودع الرئيسي.`,
                type: 'finance',
                action_url: `/delegate-settlements`
            }).catch(() => {});

            return {
                success: true,
                receiptVoucherId: rpcRes.receipt_voucher_id,
                cashJournalId: rpcRes.cash_journal_id,
                inventoryJournalId: rpcRes.inventory_journal_id
            };
        },
        onSuccess: () => {
            showToast("تم اعتماد تسوية العهدة وتوريد النقدية وإرجاع البضائع للمستودع الرئيسي بنجاح! 🚀", "success");
            setIsSettlementModalOpen(false);
            setSelectedTripForSettlement(null);

            // Invalidate all related caches
            queryClient.invalidateQueries({ queryKey: ['delegate_settlements_trips'] });
            queryClient.invalidateQueries({ queryKey: ['delegate_settlements_receipts'] });
            queryClient.invalidateQueries({ queryKey: ['delegate_settlements_inventory_txns'] });
            queryClient.invalidateQueries({ queryKey: ['delegate_settlements_vehicle_inv'] });
            queryClient.invalidateQueries({ queryKey: ['fleet_operations'] });
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['warehouse_inventory'] });
            queryClient.invalidateQueries({ queryKey: ['inventory_items'] });
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] });
        },
        onError: (err: any) => {
            showToast(`فشلت التسوية: ${err.message || err}`, "error");
        }
    });

    // 📑 Export to Excel
    const exportToExcel = () => {
        const exportData = filteredSettlements.map(s => ({
            'رقم الرحلة': s.operationNumber,
            'التاريخ': s.date,
            'اسم المندوب': s.driverName,
            'رقم الجوال': s.driverPhone || '---',
            'السيارة': s.vehiclePlate,
            'حالة الرحلة': s.status,
            'حالة التسوية': s.settlementStatus === 'settled' ? 'تمت التسوية' : (s.settlementStatus === 'partial' ? 'تسوية جزئية' : 'بانتظار التسوية'),
            'إجمالي المبيعات (ر.س)': s.totalSales,
            'مبيعات نقدية (ر.س)': s.cashSales,
            'مبيعات آجلة (ر.س)': s.creditSales,
            'التحصيلات النقدية (ر.س)': s.totalCollections,
            'المصروفات المسددة (ر.س)': s.totalExpenses,
            'صافي النقدية المستحقة (ر.س)': s.netCashDue,
            'المورد فعلياً للخزينة (ر.س)': s.handedOverCash,
            'المتبقي في العهدة (ر.س)': s.remainingCashCustody,
            'إجمالي المحمل بالسيارة': s.totalLoadedQty,
            'إجمالي المباع بالسيارة': s.totalSoldQty,
            'إجمالي المرتجع للمستودع': s.totalReturnedQty,
            'المتبقي بالسيارة': s.totalRemainingQty
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "تسويات عهد المناديب");
        XLSX.writeFile(wb, `Delegate_Settlements_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return {
        // Data & Filters
        processedSettlements,
        filteredSettlements,
        globalSearch,
        setGlobalSearch,
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        statusFilter,
        setStatusFilter,
        totals,
        // Supporting data
        inventoryItems: inventoryItemsQuery.data || [],
        accounts: accountsQuery.data || [],
        warehouses: warehousesQuery.data || [],
        // Modals state
        selectedTripForSettlement,
        setSelectedTripForSettlement,
        isSettlementModalOpen,
        setIsSettlementModalOpen,
        selectedTripForPrint,
        setSelectedTripForPrint,
        isPrintModalOpen,
        setIsPrintModalOpen,
        // Actions
        executeSettlement: executeSettlementMutation.mutate,
        isSettling: executeSettlementMutation.isPending,
        exportToExcel,
        isLoading: tripsQuery.isLoading || invoicesQuery.isLoading || receiptsQuery.isLoading
    };
}
