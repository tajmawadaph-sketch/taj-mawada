"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

export interface ValuationItem {
  id: string;
  code: string;
  barcode: string;
  name: string;
  unit: string;
  current_quantity: number;
  available_qty: number;
  cost_price: number;
  wac_cost: number;
  suggested_price: number;
  total_cost_value: number;
  total_retail_value: number;
  expected_profit: number;
  margin_percentage: number;
  batch_number?: string;
  expiry_date?: string;
}

export function useInventoryValuationLogic() {
  const [globalSearch, setGlobalSearch] = useState('');
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'value' | 'qty' | 'profit' | 'margin'>('value');

  // 1. Fetch Warehouses
  const warehousesQuery = useQuery({
    queryKey: ['valuation_warehouses'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id, name, type, is_active').order('name');
      return data || [];
    }
  });

  // 2. Fetch Warehouse Inventory Balances
  const warehouseInventoryQuery = useQuery({
    queryKey: ['valuation_warehouse_inventory'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouse_inventory').select('item_id, warehouse_id, quantity');
      return data || [];
    }
  });

  // 3. Fetch Items and Inbound Transactions to calculate WAC (Weighted Average Cost)
  const valuationDataQuery = useQuery({
    queryKey: ['valuation_master_data'],
    queryFn: async () => {
      const [itemsRes, txsRes] = await Promise.all([
        supabase.from('inventory_items').select('*').order('name'),
        supabase.from('inventory_transactions')
          .select('item_id, unit_price, quantity, type')
          .in('type', ['in', 'purchase', 'adjustment_in', 'transfer_in'])
          .gt('quantity', 0)
      ]);

      if (itemsRes.error) throw itemsRes.error;

      // Calculate WAC per item: sum(qty * price) / sum(qty)
      const wacMap: Record<string, { totalAmount: number; totalQty: number }> = {};
      (txsRes.data || []).forEach(tx => {
        const qty = Number(tx.quantity) || 0;
        const price = Number(tx.unit_price) || 0;
        if (qty > 0 && price > 0) {
          if (!wacMap[tx.item_id]) {
            wacMap[tx.item_id] = { totalAmount: 0, totalQty: 0 };
          }
          wacMap[tx.item_id].totalAmount += qty * price;
          wacMap[tx.item_id].totalQty += qty;
        }
      });

      const calculatedWAC: Record<string, number> = {};
      Object.keys(wacMap).forEach(itemId => {
        const row = wacMap[itemId];
        if (row.totalQty > 0) {
          calculatedWAC[itemId] = Number((row.totalAmount / row.totalQty).toFixed(2));
        }
      });

      return {
        items: itemsRes.data || [],
        calculatedWAC
      };
    }
  });

  const rawItems = valuationDataQuery.data?.items || [];
  const calculatedWAC = valuationDataQuery.data?.calculatedWAC || {};
  const warehouseInv = warehouseInventoryQuery.data || [];
  const warehouses = warehousesQuery.data || [];

  // 4. Process Valuation Items
  const processedItems: ValuationItem[] = useMemo(() => {
    if (!rawItems.length) return [];

    return rawItems.map(item => {
      // Determine Quantity based on warehouse filter
      let qty = Number(item.current_quantity || 0);
      if (selectedWarehouseId !== 'all') {
        const whRow = warehouseInv.find(wi => wi.item_id === item.id && wi.warehouse_id === selectedWarehouseId);
        qty = Number(whRow?.quantity || 0);
      }

      // Determine Weighted Average Cost (WAC)
      const costBase = Number(item.cost_price || item.cost || item.default_price || 0);
      const wacCost = calculatedWAC[item.id] || costBase || 0;

      // Suggested Selling Price
      const suggestedPrice = Number(item.suggested_price || item.default_price || item.price || 0);

      // Calculations
      const totalCostValue = qty * wacCost;
      const totalRetailValue = qty * suggestedPrice;
      const expectedProfit = totalRetailValue - totalCostValue;
      const marginPercentage = totalRetailValue > 0 ? Number(((expectedProfit / totalRetailValue) * 100).toFixed(1)) : 0;

      return {
        id: item.id,
        code: item.code || '',
        barcode: item.barcode || '',
        name: item.name || '',
        unit: item.unit || 'حبة',
        current_quantity: Number(item.current_quantity || 0),
        available_qty: qty,
        cost_price: costBase,
        wac_cost: wacCost,
        suggested_price: suggestedPrice,
        total_cost_value: totalCostValue,
        total_retail_value: totalRetailValue,
        expected_profit: expectedProfit,
        margin_percentage: marginPercentage,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date
      };
    });
  }, [rawItems, calculatedWAC, warehouseInv, selectedWarehouseId]);

  // 5. Filtering and Sorting
  const filteredItems = useMemo(() => {
    let result = processedItems.filter(item => {
      if (!globalSearch.trim()) return true;
      const q = globalSearch.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        item.barcode.toLowerCase().includes(q)
      );
    });

    return result.sort((a, b) => {
      if (sortBy === 'value') return b.total_cost_value - a.total_cost_value;
      if (sortBy === 'qty') return b.available_qty - a.available_qty;
      if (sortBy === 'profit') return b.expected_profit - a.expected_profit;
      if (sortBy === 'margin') return b.margin_percentage - a.margin_percentage;
      return 0;
    });
  }, [processedItems, globalSearch, sortBy]);

  // 6. Aggregate KPIs
  const metrics = useMemo(() => {
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let totalUnits = 0;
    let inStockCount = 0;

    filteredItems.forEach(it => {
      if (it.available_qty > 0) inStockCount++;
      totalUnits += it.available_qty;
      totalCostValue += it.total_cost_value;
      totalRetailValue += it.total_retail_value;
    });

    const totalExpectedProfit = totalRetailValue - totalCostValue;
    const overallMarginPct = totalRetailValue > 0 ? Number(((totalExpectedProfit / totalRetailValue) * 100).toFixed(1)) : 0;

    return {
      totalCostValue,
      totalRetailValue,
      totalExpectedProfit,
      overallMarginPct,
      totalUnits,
      inStockCount,
      totalItemsCount: filteredItems.length
    };
  }, [filteredItems]);

  // 7. Export to Excel
  const exportToExcel = () => {
    const currentWhName = selectedWarehouseId === 'all' 
      ? 'كافة المستودعات' 
      : warehouses.find(w => w.id === selectedWarehouseId)?.name || 'المستودع';

    const exportData = filteredItems.map((item, idx) => ({
      '#': idx + 1,
      'كود الصنف': item.code,
      'اسم الصنف': item.name,
      'الباركود': item.barcode || '-',
      'الوحدة': item.unit,
      'الرصيد المتاح': item.available_qty,
      'متوسط التكلفة المرجح (WAC)': item.wac_cost,
      'سعر البيع المقترح': item.suggested_price,
      'إجمالي قيمة التكلفة (ر.س)': item.total_cost_value,
      'إجمالي القيمة البيعية (ر.س)': item.total_retail_value,
      'مجمل الربح المتوقع (ر.س)': item.expected_profit,
      'هامش الربح (%)': `${item.margin_percentage}%`
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "تقييم المخزون المالي");
    XLSX.writeFile(wb, `تقييم_المخزون_${currentWhName}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return {
    filteredItems,
    warehouses,
    selectedWarehouseId,
    setSelectedWarehouseId,
    globalSearch,
    setGlobalSearch,
    sortBy,
    setSortBy,
    metrics,
    isLoading: valuationDataQuery.isLoading || warehouseInventoryQuery.isLoading,
    exportToExcel
  };
}
