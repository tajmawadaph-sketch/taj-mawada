"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

export interface ItemCardTransaction {
  id: string;
  transaction_number?: string;
  transaction_date: string;
  type: string;
  typeLabel: string;
  typeBadgeColor: string;
  quantity: number;
  signedQuantity: number;
  runningBalance: number;
  unit_price: number;
  total_price: number;
  batch_number?: string;
  expiry_date?: string;
  notes?: string;
  warehouse_id?: string;
  warehouseName: string;
  destinationWarehouseName?: string;
  partnerName?: string;
  journal_id?: string;
  journal_number?: string;
  status: string;
}

export function useItemCardLogic() {
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // 1. Fetch All Items for dropdown / barcode search
  const itemsQuery = useQuery({
    queryKey: ['item_card_items_list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return data || [];
    }
  });

  // 2. Fetch Warehouses
  const warehousesQuery = useQuery({
    queryKey: ['item_card_warehouses'],
    queryFn: async () => {
      const { data } = await supabase.from('warehouses').select('id, name, type').order('name');
      return data || [];
    }
  });

  // 3. Fetch Selected Item Warehouse Inventory Balances
  const itemWarehouseBalancesQuery = useQuery({
    queryKey: ['item_card_wh_balances', selectedItemId],
    queryFn: async () => {
      if (!selectedItemId) return [];
      const { data } = await supabase
        .from('warehouse_inventory')
        .select('warehouse_id, quantity, warehouses(name, type)')
        .eq('item_id', selectedItemId);
      return data || [];
    },
    enabled: !!selectedItemId
  });

  // 4. Fetch Item Transactions with complete details
  const transactionsQuery = useQuery({
    queryKey: ['item_card_full_transactions', selectedItemId],
    queryFn: async () => {
      if (!selectedItemId) return [];

      const [txRes, whRes, partRes, jRes] = await Promise.all([
        supabase
          .from('inventory_transactions')
          .select('*')
          .eq('item_id', selectedItemId)
          .order('transaction_date', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase.from('warehouses').select('id, name'),
        supabase.from('partners').select('id, name, partner_type'),
        supabase.from('journal_headers').select('id, entry_date, status')
      ]);

      if (txRes.error) throw txRes.error;

      const whMap = new Map((whRes.data || []).map((w: any) => [w.id, w.name]));
      const partMap = new Map((partRes.data || []).map((p: any) => [p.id, p.name]));
      const jMap = new Map((jRes.data || []).map((j: any) => [j.id, j]));

      return (txRes.data || []).map((t: any) => ({
        ...t,
        warehouseName: whMap.get(t.warehouse_id) || 'المستودع الرئيسي',
        destinationWarehouseName: t.destination_warehouse_id ? whMap.get(t.destination_warehouse_id) : undefined,
        partnerName: t.partner_id ? partMap.get(t.partner_id) : undefined,
        journalInfo: t.journal_id ? jMap.get(t.journal_id) : undefined
      }));
    },
    enabled: !!selectedItemId
  });

  const rawTransactions = transactionsQuery.data || [];
  const selectedItem = (itemsQuery.data || []).find((i: any) => i.id === selectedItemId);

  // 5. Calculate Running Balances and Operational Metadata
  const processedData = useMemo(() => {
    let runningBalance = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalWaste = 0;

    const allMapped: ItemCardTransaction[] = rawTransactions.map(tx => {
      const qty = Number(tx.quantity) || 0;
      const type = (tx.type || '').toLowerCase();
      const unitPrice = Number(tx.unit_price) || 0;
      const totalPrice = qty * unitPrice;

      // Determine sign and label
      let signedQty = qty;
      let typeLabel = 'توريد مخزني 📥';
      let typeBadgeColor = '#059669';

      if (type === 'in' || type === 'purchase') {
        typeLabel = 'توريد / شراء 📥';
        typeBadgeColor = '#059669';
        totalIn += qty;
      } else if (type === 'adjustment_in') {
        typeLabel = 'تسوية زيادة جردية 🔵';
        typeBadgeColor = '#C29B62';
        totalIn += qty;
      } else if (type === 'empty_return') {
        typeLabel = 'استرجاع فوارغ ♻️';
        typeBadgeColor = '#0284c7';
        totalIn += qty;
      } else if (type === 'transfer_in') {
        typeLabel = 'تحويل وارد 🔄';
        typeBadgeColor = '#059669';
        totalIn += qty;
      } else if (type === 'waste') {
        signedQty = -qty;
        typeLabel = 'إتلاف وهدر مخزني 🗑️';
        typeBadgeColor = '#A8573C';
        totalOut += qty;
        totalWaste += qty;
      } else if (type === 'adjustment_out') {
        signedQty = -qty;
        typeLabel = 'تسوية عجز جردي 🔴';
        typeBadgeColor = '#dc2626';
        totalOut += qty;
      } else if (type === 'transfer_out' || type === 'transfer') {
        signedQty = -qty;
        typeLabel = 'تحويل صادر 🔄';
        typeBadgeColor = '#7c3aed';
        totalOut += qty;
      } else {
        // out / sales_deduction / صرف
        signedQty = -qty;
        typeLabel = 'صرف مبيعات / فواتير 📤';
        typeBadgeColor = '#1E130B';
        totalOut += qty;
      }

      runningBalance += signedQty;

      return {
        id: tx.id,
        transaction_number: tx.transaction_number || `TX-${tx.id.slice(-6)}`,
        transaction_date: tx.transaction_date || (tx.created_at ? tx.created_at.split('T')[0] : '-'),
        type: tx.type,
        typeLabel,
        typeBadgeColor,
        quantity: qty,
        signedQuantity: signedQty,
        runningBalance,
        unit_price: unitPrice,
        total_price: totalPrice,
        batch_number: tx.batch_number || selectedItem?.batch_number || '',
        expiry_date: tx.expiry_date || selectedItem?.expiry_date || '',
        notes: tx.notes || '',
        warehouse_id: tx.warehouse_id,
        warehouseName: tx.warehouseName,
        destinationWarehouseName: tx.destinationWarehouseName,
        partnerName: tx.partnerName,
        journal_id: tx.journal_id,
        status: tx.status || 'approved'
      };
    });

    // Date and warehouse filtering
    const filtered = allMapped.filter(tx => {
      if (dateFrom && tx.transaction_date < dateFrom) return false;
      if (dateTo && tx.transaction_date > dateTo) return false;
      if (selectedWarehouseFilter !== 'all' && tx.warehouse_id !== selectedWarehouseFilter) return false;
      return true;
    });

    return {
      all: allMapped,
      filtered,
      totalIn,
      totalOut,
      totalWaste,
      finalBalance: runningBalance
    };
  }, [rawTransactions, selectedItem, dateFrom, dateTo, selectedWarehouseFilter]);

  // Export to Excel
  const exportToExcel = () => {
    if (!processedData.filtered.length || !selectedItem) return;

    const exportData = processedData.filtered.map((tx, idx) => ({
      '#': idx + 1,
      'رقم الحركة': tx.transaction_number,
      'التاريخ': tx.transaction_date,
      'نوع الحركة': tx.typeLabel,
      'الوارد (+)': tx.signedQuantity > 0 ? tx.quantity : 0,
      'المنصرف (-)': tx.signedQuantity < 0 ? tx.quantity : 0,
      'الرصيد التراكمي': tx.runningBalance,
      'سعر الوحدة': tx.unit_price,
      'إجمالي القيمة': tx.total_price,
      'رقم التشغيلة (Batch)': tx.batch_number || '-',
      'تاريخ الصلاحية': tx.expiry_date || '-',
      'المستودع': tx.warehouseName,
      'الجهة المعنية': tx.partnerName || '-',
      'البيان': tx.notes || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل حركة الصنف");
    XLSX.writeFile(wb, `كارت_حركة_${selectedItem.name}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return {
    itemsList: itemsQuery.data || [],
    selectedItemId,
    setSelectedItemId,
    selectedItem,
    warehouses: warehousesQuery.data || [],
    selectedWarehouseFilter,
    setSelectedWarehouseFilter,
    warehouseBalances: itemWarehouseBalancesQuery.data || [],
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    transactions: processedData.filtered,
    totalIn: processedData.totalIn,
    totalOut: processedData.totalOut,
    totalWaste: processedData.totalWaste,
    finalBalance: processedData.finalBalance,
    isLoading: itemsQuery.isLoading || transactionsQuery.isLoading,
    exportToExcel
  };
}
