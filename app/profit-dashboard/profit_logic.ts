"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface ItemProfitRow {
    id: string;
    name: string;
    quantity: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
}

export interface DelegateProfitRow {
    name: string;
    invoicesCount: number;
    revenue: number;
    cogs: number;
    profit: number;
    marginPct: number;
}

export function useProfitDashboardLogic() {
    // Default: Current Month
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const defaultStart = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0];
    const defaultEnd = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0];

    const [dateFrom, setDateFrom] = useState(defaultStart);
    const [dateTo, setDateTo] = useState(defaultEnd);
    const [activeTab, setActiveTab] = useState<'overview' | 'items' | 'delegates' | 'fleet'>('overview');

    const setPeriodPreset = (type: 'today' | 'this_month' | 'this_quarter' | 'this_year' | 'all') => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        if (type === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            setDateFrom(todayStr);
            setDateTo(todayStr);
        } else if (type === 'this_month') {
            const start = new Date(y, m, 1).toISOString().split('T')[0];
            const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
            setDateFrom(start);
            setDateTo(end);
        } else if (type === 'this_quarter') {
            const q = Math.floor(m / 3);
            const start = new Date(y, q * 3, 1).toISOString().split('T')[0];
            const end = new Date(y, (q + 1) * 3, 0).toISOString().split('T')[0];
            setDateFrom(start);
            setDateTo(end);
        } else if (type === 'this_year') {
            setDateFrom(`${y}-01-01`);
            setDateTo(`${y}-12-31`);
        } else if (type === 'all') {
            setDateFrom('');
            setDateTo('');
        }
    };

    const invoicesQuery = useQuery({
        queryKey: ['profit_dash_invoices', dateFrom, dateTo],
        queryFn: async () => {
            let q = supabase.from('invoices').select(`
                id, total_amount, paid_amount, lines_data, status, date,
                delegate:partners!invoices_delegate_id_fkey(name)
            `).neq('status', 'ملغي').neq('status', 'draft').neq('status', 'cancelled');
            
            if (dateFrom) q = q.gte('date', dateFrom);
            if (dateTo) q = q.lte('date', dateTo);
            
            const { data: invData, error: invErr } = await q;
            if (invErr) throw invErr;

            const { data: itemsCost } = await supabase.from('inventory_items').select('id, name, cost_price, barcode');
            const costMap: Record<string, number> = {};
            itemsCost?.forEach(i => { costMap[i.id] = Number(i.cost_price || 0); });

            return { invoices: invData || [], costMap };
        }
    });

    const tripsQuery = useQuery({
        queryKey: ['profit_dash_trips', dateFrom, dateTo],
        queryFn: async () => {
            let q = supabase.from('fleet_operations').select('id, operation_date, total_sales, total_expenses, inventory_cost, net_profit, status');
            if (dateFrom) q = q.gte('operation_date', dateFrom);
            if (dateTo) q = q.lte('operation_date', dateTo);
            
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }
    });

    const expensesQuery = useQuery({
        queryKey: ['profit_dash_expenses', dateFrom, dateTo],
        queryFn: async () => {
            let q = supabase.from('expenses').select('id, date, total_price, unit_price, quantity, vat_amount, discount_amount, paid_amount, is_posted');
            if (dateFrom) q = q.gte('date', dateFrom);
            if (dateTo) q = q.lte('date', dateTo);
            
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }
    });

    const dashboardData = useMemo(() => {
        const rawInvoices = invoicesQuery.data?.invoices || [];
        const costMap = invoicesQuery.data?.costMap || {};
        const rawTrips = tripsQuery.data || [];
        const rawExpenses = expensesQuery.data || [];

        let totalRevenue = 0, totalCOGS = 0;
        const itemsMap = new Map<string, { id: string, name: string, quantity: number, revenue: number, cogs: number, profit: number }>();
        const delegatesMap = new Map<string, { name: string, invoicesCount: number, revenue: number, cogs: number, profit: number }>();

        rawInvoices.forEach((inv: any) => {
            const amount = Number(inv.total_amount || 0);
            totalRevenue += amount;
            
            const delegateName = (inv.delegate as any)?.name || 'مبيعات الكاشير المباشرة';
            if (!delegatesMap.has(delegateName)) {
                delegatesMap.set(delegateName, { name: delegateName, invoicesCount: 0, revenue: 0, cogs: 0, profit: 0 });
            }
            const d = delegatesMap.get(delegateName)!;
            d.invoicesCount += 1;
            d.revenue += amount;

            let invCogs = 0;
            if (inv.lines_data) {
                let lines: any[] = [];
                try {
                    lines = typeof inv.lines_data === 'string' ? JSON.parse(inv.lines_data) : inv.lines_data;
                } catch(e){}

                lines.forEach((line: any) => {
                    const itemName = line.item_name || line.name || 'دواء بيطري';
                    const itemId = line.item_id || line.id || itemName;
                    const qty = Number(line.quantity || 0);
                    const lineRev = qty * Number(line.unit_price || line.price || 0);
                    const unitCost = costMap[itemId] || Number(line.cost_price || 0);
                    const lineCogs = qty * unitCost;
                    
                    invCogs += lineCogs;
                    totalCOGS += lineCogs;

                    if (!itemsMap.has(itemName)) {
                        itemsMap.set(itemName, { id: itemId, name: itemName, quantity: 0, revenue: 0, cogs: 0, profit: 0 });
                    }
                    const itemRec = itemsMap.get(itemName)!;
                    itemRec.quantity += qty;
                    itemRec.revenue += lineRev; 
                    itemRec.cogs += lineCogs; 
                    itemRec.profit += (lineRev - lineCogs);
                });
            }
            d.cogs += invCogs;
            d.profit += (amount - invCogs);
        });

        // Calculate Operating Expenses
        let totalOperatingExpenses = 0;
        rawExpenses.forEach((exp: any) => {
            const expAmount = Number(exp.total_price) || 
                ((Number(exp.quantity || 1) * Number(exp.unit_price || 0)) + Number(exp.vat_amount || 0) - Number(exp.discount_amount || 0)) || 
                Number(exp.paid_amount || 0);
            totalOperatingExpenses += expAmount;
        });

        // Trips metrics
        let tripSales = 0, tripExp = 0, tripInv = 0, tripProfit = 0;
        rawTrips.forEach((t: any) => {
            tripSales += Number(t.total_sales || 0);
            tripExp += Number(t.total_expenses || 0);
            tripInv += Number(t.inventory_cost || 0);
            tripProfit += Number(t.net_profit || 0);
        });

        const grossProfit = totalRevenue - totalCOGS;
        const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
        const netOperatingProfit = grossProfit - totalOperatingExpenses;
        const netMargin = totalRevenue > 0 ? (netOperatingProfit / totalRevenue) * 100 : 0;

        const allItemsList: ItemProfitRow[] = Array.from(itemsMap.values()).map(it => ({
            ...it,
            marginPct: it.revenue > 0 ? (it.profit / it.revenue) * 100 : 0
        })).sort((a, b) => b.profit - a.profit);

        const allDelegatesList: DelegateProfitRow[] = Array.from(delegatesMap.values()).map(del => ({
            ...del,
            marginPct: del.revenue > 0 ? (del.profit / del.revenue) * 100 : 0
        })).sort((a, b) => b.profit - a.profit);

        const tripMargin = tripSales > 0 ? (tripProfit / tripSales) * 100 : 0;

        return {
            totalRevenue, 
            totalCOGS,
            grossProfit,
            grossMargin,
            totalOperatingExpenses,
            netOperatingProfit,
            netMargin,
            invoicesCount: rawInvoices.length,
            allItemsList,
            topItems: allItemsList.slice(0, 7),
            allDelegatesList,
            topDelegates: allDelegatesList.slice(0, 6),
            trips: { 
                sales: tripSales, 
                expenses: tripExp, 
                invCost: tripInv, 
                profit: tripProfit, 
                count: rawTrips.length,
                marginPct: tripMargin
            }
        };
    }, [invoicesQuery.data, tripsQuery.data, expensesQuery.data]);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. KPI Sheet
        const kpiRows = [
            { 'المؤشر': 'إجمالي المبيعات (Revenues)', 'القيمة (SAR)': dashboardData.totalRevenue },
            { 'المؤشر': 'تكلفة البضاعة المباعة (COGS)', 'القيمة (SAR)': dashboardData.totalCOGS },
            { 'المؤشر': 'مجمل الربح (Gross Profit)', 'القيمة (SAR)': dashboardData.grossProfit },
            { 'المؤشر': 'هامش مجمل الربح %', 'القيمة (SAR)': `${dashboardData.grossMargin.toFixed(1)}%` },
            { 'المؤشر': 'المصروفات التشغيلية', 'القيمة (SAR)': dashboardData.totalOperatingExpenses },
            { 'المؤشر': 'صافي الربح التشغيلي', 'القيمة (SAR)': dashboardData.netOperatingProfit },
            { 'المؤشر': 'هامش صافي الربح %', 'القيمة (SAR)': `${dashboardData.netMargin.toFixed(1)}%` },
            { 'المؤشر': 'إجمالي عدد الفواتير', 'القيمة (SAR)': dashboardData.invoicesCount },
            { 'المؤشر': 'مبيعات رحلات الأسطول', 'القيمة (SAR)': dashboardData.trips.sales },
            { 'المؤشر': 'صافي أرباح رحلات الأسطول', 'القيمة (SAR)': dashboardData.trips.profit },
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpiRows), "ملخص الربحية");

        // 2. Top Items Sheet
        const itemRows = dashboardData.allItemsList.map(it => ({
            'اسم الصنف': it.name,
            'الكمية المباعة': it.quantity,
            'إجمالي الإيرادات (SAR)': Number(it.revenue.toFixed(2)),
            'تكلفة البضاعة (SAR)': Number(it.cogs.toFixed(2)),
            'مجمل الربح (SAR)': Number(it.profit.toFixed(2)),
            'هامش الربح %': `${it.marginPct.toFixed(1)}%`
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), "أرباح الأصناف");

        // 3. Delegates Sheet
        const delegateRows = dashboardData.allDelegatesList.map(del => ({
            'اسم المندوب': del.name,
            'عدد الفواتير': del.invoicesCount,
            'المبيعات (SAR)': Number(del.revenue.toFixed(2)),
            'تكلفة البضاعة (SAR)': Number(del.cogs.toFixed(2)),
            'الأرباح (SAR)': Number(del.profit.toFixed(2)),
            'هامش الربح %': `${del.marginPct.toFixed(1)}%`
        }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(delegateRows), "أرباح المناديب");

        XLSX.writeFile(wb, `Profit_Analysis_${dateFrom || 'start'}_to_${dateTo || 'end'}.xlsx`);
        showGlobalToast("✅ تم تصدير تقرير تحليل الربحية إلى Excel بنجاح", 'success');
    };

    return {
        dateFrom, setDateFrom, 
        dateTo, setDateTo,
        activeTab, setActiveTab,
        setPeriodPreset,
        isLoading: invoicesQuery.isLoading || tripsQuery.isLoading || expensesQuery.isLoading,
        refetch: () => {
            invoicesQuery.refetch();
            tripsQuery.refetch();
            expensesQuery.refetch();
        },
        exportToExcel,
        ...dashboardData
    };
}
