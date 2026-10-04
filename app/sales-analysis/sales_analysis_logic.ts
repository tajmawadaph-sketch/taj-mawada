"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

export interface ItemProfitabilityRecord {
    id: string;
    code: string;
    name: string;
    unit: string;
    qty: number;
    avgSellingPrice: number;
    wacUnitCost: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
}

export function useSalesAnalysisLogic() {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [itemSortBy, setItemSortBy] = useState<'revenue' | 'profit' | 'margin' | 'qty'>('revenue');

    const invoicesQuery = useQuery({
        queryKey: ['sales_analysis_invoices', dateFrom, dateTo],
        queryFn: async () => {
            // 1. Fetch Invoices with status filter
            let q = supabase
                .from('invoices')
                .select(`
                    id, 
                    date, 
                    total_amount, 
                    taxable_amount, 
                    tax_amount, 
                    paid_amount,
                    lines_data, 
                    client_name,
                    partner_id,
                    delegate_id,
                    partner:partners!invoices_partner_id_fkey(name),
                    delegate:partners!invoices_delegate_id_fkey(name)
                `)
                .in('status', ['مرحل', 'معتمد', 'مغلق', 'مدفوع']);

            if (dateFrom) q = q.gte('date', dateFrom);
            if (dateTo) q = q.lte('date', dateTo);

            const { data: invData, error: invError } = await q;
            if (invError) throw invError;

            // 2. Fetch inventory items
            const { data: itemsData, error: itemsError } = await supabase
                .from('inventory_items')
                .select('id, name, code, barcode, cost_price, default_price, unit');
            if (itemsError) throw itemsError;

            // 3. Fetch inbound transactions to calculate true Weighted Average Cost (WAC)
            const { data: inboundTx, error: txError } = await supabase
                .from('inventory_transactions')
                .select('item_id, quantity, unit_price, transaction_type')
                .in('transaction_type', ['in', 'purchase', 'adjustment_in', 'transfer_in']);
            if (txError) throw txError;

            // Compute dynamic WAC totals
            const wacTotals: Record<string, { qty: number; value: number }> = {};
            inboundTx?.forEach((tx: any) => {
                const qty = Math.abs(Number(tx.quantity || 0));
                const price = Number(tx.unit_price || 0);
                if (qty > 0 && price > 0) {
                    if (!wacTotals[tx.item_id]) wacTotals[tx.item_id] = { qty: 0, value: 0 };
                    wacTotals[tx.item_id].qty += qty;
                    wacTotals[tx.item_id].value += (qty * price);
                }
            });

            // Build item metadata and WAC map
            const itemDetailsMap: Record<string, { name: string; code: string; unit: string; wac: number }> = {};
            itemsData?.forEach((i: any) => {
                const wac = (wacTotals[i.id] && wacTotals[i.id].qty > 0)
                    ? (wacTotals[i.id].value / wacTotals[i.id].qty)
                    : Number(i.cost_price || 0);
                const finalCost = wac > 0 ? wac : Number(i.cost_price || 0);
                itemDetailsMap[i.id] = {
                    name: i.name,
                    code: i.code || i.barcode || '',
                    unit: i.unit || 'حبة',
                    wac: finalCost
                };
            });

            return {
                invoices: invData || [],
                itemDetailsMap
            };
        }
    });

    const rawInvoices = invoicesQuery.data?.invoices || [];
    const itemDetailsMap = invoicesQuery.data?.itemDetailsMap || {};

    const {
        topClients,
        topDelegates,
        topItems,
        allProfitabilityItems,
        totalRevenue,
        totalInvoices,
        averageInvoiceValue,
        totalCOGS,
        grossProfit,
        grossMargin,
        totalOutstanding
    } = useMemo(() => {
        let totalRev = 0;
        let totalCost = 0;
        let totalOut = 0;
        const clientsMap = new Map<string, { name: string; total: number; count: number }>();
        const delegatesMap = new Map<string, { name: string; total: number; count: number }>();
        const itemsMap = new Map<string, ItemProfitabilityRecord>();

        rawInvoices.forEach((inv: any) => {
            const amount = Number(inv.total_amount || 0);
            const paid = Number(inv.paid_amount || 0);
            totalRev += amount;
            totalOut += Math.max(0, amount - paid);

            // Clients
            const clientName = (inv.partner as any)?.name || inv.client_name || 'عميل نقدي';
            if (!clientsMap.has(clientName)) clientsMap.set(clientName, { name: clientName, total: 0, count: 0 });
            const c = clientsMap.get(clientName)!;
            c.total += amount; 
            c.count += 1;

            // Delegates
            const delegateName = (inv.delegate as any)?.name || 'بدون مندوب';
            if (!delegatesMap.has(delegateName)) delegatesMap.set(delegateName, { name: delegateName, total: 0, count: 0 });
            const d = delegatesMap.get(delegateName)!;
            d.total += amount; 
            d.count += 1;

            // Items + COGS at WAC
            if (inv.lines_data) {
                let lines: any[] = [];
                if (typeof inv.lines_data === 'string') {
                    try { lines = JSON.parse(inv.lines_data); } catch(e){}
                } else if (Array.isArray(inv.lines_data)) {
                    lines = inv.lines_data;
                }

                lines.forEach((line: any) => {
                    const itemId = line.item_id || line.id || '';
                    const meta = itemId ? itemDetailsMap[itemId] : null;
                    const itemName = line.item_name || line.name || meta?.name || 'صنف غير معروف';
                    const itemCode = line.code || meta?.code || '';
                    const itemUnit = line.unit || meta?.unit || 'حبة';
                    const qty = Number(line.quantity || line.qty || 0);
                    const unitPrice = Number(line.unit_price || line.price || 0);
                    const discount = Number(line.discount || 0);
                    const lineRevenue = line.total !== undefined ? Number(line.total) : (qty * unitPrice - discount);

                    const unitWacCost = meta?.wac !== undefined ? meta.wac : Number(line.cost_price || 0);
                    const lineCOGS = qty * unitWacCost;
                    const lineProfit = lineRevenue - lineCOGS;

                    totalCost += lineCOGS;

                    const itemKey = itemId || itemName;
                    if (!itemsMap.has(itemKey)) {
                        itemsMap.set(itemKey, {
                            id: itemId,
                            code: itemCode,
                            name: itemName,
                            unit: itemUnit,
                            qty: 0,
                            avgSellingPrice: 0,
                            wacUnitCost: unitWacCost,
                            revenue: 0,
                            cogs: 0,
                            profit: 0,
                            marginPct: 0
                        });
                    }
                    const itemRec = itemsMap.get(itemKey)!;
                    itemRec.qty += qty;
                    itemRec.revenue += lineRevenue;
                    itemRec.cogs += lineCOGS;
                    itemRec.profit += lineProfit;
                    if (!itemRec.code && itemCode) itemRec.code = itemCode;
                    if (unitWacCost > 0 && itemRec.wacUnitCost === 0) itemRec.wacUnitCost = unitWacCost;
                });
            }
        });

        // Calculate averages and margins for all items
        const allProfitabilityItems: ItemProfitabilityRecord[] = Array.from(itemsMap.values()).map(item => {
            const avgSellingPrice = item.qty > 0 ? (item.revenue / item.qty) : 0;
            const marginPct = item.revenue > 0 ? (item.profit / item.revenue) * 100 : 0;
            return {
                ...item,
                avgSellingPrice,
                marginPct
            };
        });

        const grossProf = totalRev - totalCost;
        const grossMarg = totalRev > 0 ? (grossProf / totalRev) * 100 : 0;

        const topClients = Array.from(clientsMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
        const topDelegates = Array.from(delegatesMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
        const topItems = [...allProfitabilityItems].sort((a, b) => b.qty - a.qty).slice(0, 10);
        const averageInvoiceValue = rawInvoices.length > 0 ? totalRev / rawInvoices.length : 0;

        return {
            topClients,
            topDelegates,
            topItems,
            allProfitabilityItems,
            totalRevenue: totalRev,
            totalInvoices: rawInvoices.length,
            averageInvoiceValue,
            totalCOGS: totalCost,
            grossProfit: grossProf,
            grossMargin: grossMarg,
            totalOutstanding: totalOut
        };
    }, [rawInvoices, itemDetailsMap]);

    // Filtered and sorted profitability matrix
    const filteredProfitabilityItems = useMemo(() => {
        let list = allProfitabilityItems;
        if (itemSearch.trim()) {
            const query = itemSearch.trim().toLowerCase();
            list = list.filter(i => 
                i.name.toLowerCase().includes(query) || 
                i.code.toLowerCase().includes(query)
            );
        }

        return [...list].sort((a, b) => {
            if (itemSortBy === 'revenue') return b.revenue - a.revenue;
            if (itemSortBy === 'profit') return b.profit - a.profit;
            if (itemSortBy === 'margin') return b.marginPct - a.marginPct;
            if (itemSortBy === 'qty') return b.qty - a.qty;
            return 0;
        });
    }, [allProfitabilityItems, itemSearch, itemSortBy]);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Matrix sheet
        const matrixData = filteredProfitabilityItems.map((i, idx) => ({
            '#': idx + 1,
            'كود الصنف': i.code || '-',
            'اسم الصنف': i.name,
            'الوحدة': i.unit,
            'الكمية المباعة': i.qty,
            'متوسط سعر البيع': Number(i.avgSellingPrice.toFixed(2)),
            'تكلفة الوحدة (WAC)': Number(i.wacUnitCost.toFixed(2)),
            'إجمالي المبيعات (SAR)': Number(i.revenue.toFixed(2)),
            'تكلفة المبيعات COGS (SAR)': Number(i.cogs.toFixed(2)),
            'مجمل الربح (SAR)': Number(i.profit.toFixed(2)),
            'هامش الربح %': `${i.marginPct.toFixed(1)}%`
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matrixData), "مصفوفة ربحية الأصناف");

        // 2. Clients sheet
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            topClients.map((c, idx) => ({
                '#': idx + 1,
                'اسم العميل': c.name,
                'عدد الفواتير': c.count,
                'إجمالي المبيعات (SAR)': Number(c.total.toFixed(2))
            }))
        ), "أفضل العملاء");

        // 3. Delegates sheet
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            topDelegates.map((d, idx) => ({
                '#': idx + 1,
                'المندوب': d.name,
                'عدد الفواتير': d.count,
                'إجمالي المبيعات (SAR)': Number(d.total.toFixed(2))
            }))
        ), "أفضل المناديب");

        // 4. Financial Summary sheet
        const summaryData = [
            { 'المؤشر المالي': 'إجمالي المبيعات', 'القيمة': totalRevenue.toFixed(2) },
            { 'المؤشر المالي': 'تكلفة البضاعة المباعة (WAC)', 'القيمة': totalCOGS.toFixed(2) },
            { 'المؤشر المالي': 'مجمل الأرباح', 'القيمة': grossProfit.toFixed(2) },
            { 'المؤشر المالي': 'هامش الربح الإجمالي', 'القيمة': `${grossMargin.toFixed(1)}%` },
            { 'المؤشر المالي': 'عدد الفواتير المعتمدة', 'القيمة': totalInvoices },
            { 'المؤشر المالي': 'متوسط قيمة الفاتورة', 'القيمة': averageInvoiceValue.toFixed(2) },
            { 'المؤشر المالي': 'إجمالي الذمم المعلقة', 'القيمة': totalOutstanding.toFixed(2) }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), "ملخص الأداء المالي");

        XLSX.writeFile(wb, `Taj_Sales_Profitability_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return {
        dateFrom, setDateFrom,
        dateTo, setDateTo,
        itemSearch, setItemSearch,
        itemSortBy, setItemSortBy,
        topClients, topDelegates, topItems,
        allProfitabilityItems,
        filteredProfitabilityItems,
        totalRevenue, totalInvoices, averageInvoiceValue,
        totalCOGS, grossProfit, grossMargin, totalOutstanding,
        isLoading: invoicesQuery.isLoading,
        exportToExcel
    };
}
