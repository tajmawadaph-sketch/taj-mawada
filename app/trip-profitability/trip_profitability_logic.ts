"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface TripProfitabilityItem {
  id: string;
  operation_number: string;
  operation_date: string;
  status: string;
  vehicle_id: string;
  vehicle_name: string;
  driver_id: string;
  driver_name: string;
  total_sales: number;
  cash_sales: number;
  credit_sales: number;
  inventory_cost: number;
  total_expenses: number;
  commission_rate: number;
  commission_amount: number;
  gross_profit: number;
  gross_margin_pct: number;
  net_profit: number;
  net_margin_pct: number;
  rating: 'excellent' | 'good' | 'fair' | 'loss';
}

export function useTripProfitabilityLogic() {
  const [isLoading, setIsLoading] = useState(false);
  const [trips, setTrips] = useState<TripProfitabilityItem[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const getFirstDayOfMonth = () => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  };

  const getLastDayOfMonth = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(0);
    return d.toISOString().split('T')[0];
  };

  const [dateRange, setDateRange] = useState({
    start: getFirstDayOfMonth(),
    end: getLastDayOfMonth(),
  });

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch Fleet Operations
      let opQuery = supabase
        .from('fleet_operations')
        .select('*')
        .order('operation_date', { ascending: false });

      if (dateRange.start) opQuery = opQuery.gte('operation_date', dateRange.start);
      if (dateRange.end) opQuery = opQuery.lte('operation_date', dateRange.end);

      const { data: operations, error: opErr } = await opQuery;
      if (opErr) throw opErr;

      // 2. Fetch Vehicles & Drivers
      const [vehRes, partRes, invRes] = await Promise.all([
        supabase.from('fleet_vehicles').select('id, plate_number, vehicle_model'),
        supabase.from('partners').select('id, name, partner_type'),
        supabase.from('invoices').select('id, total_amount, paid_amount, payment_method, delegate_id, fleet_operation_id')
      ]);

      const vMap: Record<string, string> = {};
      vehRes.data?.forEach(v => {
        vMap[v.id] = `${v.plate_number}${v.vehicle_model ? ' (' + v.vehicle_model + ')' : ''}`;
      });

      const pMap: Record<string, string> = {};
      partRes.data?.forEach(p => { pMap[p.id] = p.name; });

      // Group invoices by trip or delegate
      const tripInvoices = invRes.data || [];

      const mapped: TripProfitabilityItem[] = (operations || []).map(op => {
        const sales = Number(op.total_sales || 0);
        const expenses = Number(op.total_expenses || 0);
        const invCost = Number(op.inventory_cost || 0);

        // Find linked invoices to extract cash vs credit
        const linkedInvs = tripInvoices.filter(i => 
          i.fleet_operation_id === op.id || (i.delegate_id === op.driver_id && !i.fleet_operation_id)
        );

        let cashSales = 0;
        let creditSales = 0;
        if (linkedInvs.length > 0) {
          linkedInvs.forEach(i => {
            const tot = Number(i.total_amount || 0);
            const paid = Number(i.paid_amount || 0);
            cashSales += paid;
            creditSales += Math.max(0, tot - paid);
          });
        } else {
          // Estimate standard van ratio (70% cash, 30% credit)
          cashSales = Math.round(sales * 0.7 * 100) / 100;
          creditSales = Math.round((sales - cashSales) * 100) / 100;
        }

        // Automatic Delegate Commission: 2.5% of sales
        const commissionRate = 2.5;
        const commissionAmount = Math.round((sales * (commissionRate / 100)) * 100) / 100;

        const grossProfit = sales - invCost;
        const grossMarginPct = sales > 0 ? (grossProfit / sales) * 100 : 0;

        const netProfit = sales - invCost - expenses - commissionAmount;
        const netMarginPct = sales > 0 ? (netProfit / sales) * 100 : 0;

        let rating: 'excellent' | 'good' | 'fair' | 'loss' = 'good';
        if (netProfit < 0) rating = 'loss';
        else if (netMarginPct >= 20) rating = 'excellent';
        else if (netMarginPct >= 10) rating = 'good';
        else rating = 'fair';

        return {
          id: op.id,
          operation_number: op.operation_number || `TRIP-${op.id.slice(0, 6)}`,
          operation_date: op.operation_date,
          status: op.status || 'مغلق',
          vehicle_id: op.vehicle_id || '',
          vehicle_name: vMap[op.vehicle_id] || 'سيارة غير محددة',
          driver_id: op.driver_id || '',
          driver_name: pMap[op.driver_id] || 'مندوب غير محدد',
          total_sales: sales,
          cash_sales: cashSales,
          credit_sales: creditSales,
          inventory_cost: invCost,
          total_expenses: expenses,
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          gross_profit: grossProfit,
          gross_margin_pct: grossMarginPct,
          net_profit: netProfit,
          net_margin_pct: netMarginPct,
          rating
        };
      });

      setTrips(mapped);

    } catch (error) {
      console.error('Error fetching trip profitability data:', error);
      showGlobalToast("حدث خطأ أثناء جلب بيانات ربحية الرحلات", 'warning');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Unique drivers list for filter
  const driversList = useMemo(() => {
    const map = new Map<string, string>();
    trips.forEach(t => {
      if (t.driver_id && t.driver_name) map.set(t.driver_id, t.driver_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [trips]);

  // Filtered trips
  const filteredTrips = useMemo(() => {
    return trips.filter(t => {
      const matchDriver = selectedDriverId === 'all' || t.driver_id === selectedDriverId;
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || 
        t.operation_number.toLowerCase().includes(q) || 
        t.driver_name.toLowerCase().includes(q) || 
        t.vehicle_name.toLowerCase().includes(q);
      return matchDriver && matchSearch;
    });
  }, [trips, selectedDriverId, searchQuery]);

  // Summary Metrics
  const summary = useMemo(() => {
    let sumSales = 0;
    let sumCash = 0;
    let sumCredit = 0;
    let sumExpenses = 0;
    let sumInvCost = 0;
    let sumCommission = 0;
    let sumNetProfit = 0;

    filteredTrips.forEach(t => {
      sumSales += t.total_sales;
      sumCash += t.cash_sales;
      sumCredit += t.credit_sales;
      sumExpenses += t.total_expenses;
      sumInvCost += t.inventory_cost;
      sumCommission += t.commission_amount;
      sumNetProfit += t.net_profit;
    });

    const avgNetProfit = filteredTrips.length > 0 ? (sumNetProfit / filteredTrips.length) : 0;
    const avgMarginPct = sumSales > 0 ? (sumNetProfit / sumSales) * 100 : 0;

    return {
      totalSales: sumSales,
      cashSales: sumCash,
      creditSales: sumCredit,
      totalExpenses: sumExpenses,
      totalInventoryCost: sumInvCost,
      totalCommission: sumCommission,
      totalNetProfit: sumNetProfit,
      avgNetProfit,
      avgMarginPct,
      tripsCount: filteredTrips.length
    };
  }, [filteredTrips]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const rows = filteredTrips.map((t, idx) => ({
      '#': idx + 1,
      'رقم الرحلة': t.operation_number,
      'التاريخ': t.operation_date,
      'السيارة': t.vehicle_name,
      'المندوب': t.driver_name,
      'إجمالي المبيعات (SAR)': Number(t.total_sales.toFixed(2)),
      'المبيعات النقدية': Number(t.cash_sales.toFixed(2)),
      'المبيعات الآجلة': Number(t.credit_sales.toFixed(2)),
      'تكلفة البضاعة المباعة': Number(t.inventory_cost.toFixed(2)),
      'مصروفات الرحلة': Number(t.total_expenses.toFixed(2)),
      'عمولة المندوب (2.5%)': Number(t.commission_amount.toFixed(2)),
      'صافي الربح (SAR)': Number(t.net_profit.toFixed(2)),
      'هامش الربح %': `${t.net_margin_pct.toFixed(1)}%`,
      'حالة الرحلة': t.status
    }));

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "ربحية رحلات التوزيع");
    XLSX.writeFile(wb, `Trip_Profitability_${dateRange.start}_to_${dateRange.end}.xlsx`);
    showGlobalToast("✅ تم تصدير تقرير ربحية الرحلات إلى Excel", 'success');
  };

  return {
    isLoading,
    dateRange,
    handleDateChange,
    selectedDriverId,
    setSelectedDriverId,
    searchQuery,
    setSearchQuery,
    driversList,
    filteredTrips,
    summary,
    handleRefresh: fetchData,
    exportToExcel
  };
}
