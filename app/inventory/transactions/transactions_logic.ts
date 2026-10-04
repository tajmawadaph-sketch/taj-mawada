import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { showGlobalToast, useToast } from '@/lib/toast-context';
import { useRealtimeListener, emitTableChange } from '@/lib/useRealtimeSync';
import { executeApproveTransaction, executeUnapproveTransaction, syncAllWarehouseBalances } from '@/lib/inventory_engine';
import { saveLocalExpiryMetadata } from '@/app/expiry-alerts/expiry_alerts_logic';

export function useInventoryTransactionsLogic() {
  const { showToast, showConfirm } = useToast();
  const [rawRecords, setRawRecords] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [globalSearch, setGlobalSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchTransactions = async () => {
    setIsLoading(true);
    try {
      let txQuery = supabase
        .from('inventory_transactions')
        .select(`
          id,
          transaction_number,
          transaction_date,
          type,
          quantity,
          unit_price,
          notes,
          status,
          journal_id,
          item_id,
          partner_id,
          fleet_operation_id,
          batch_number,
          expiry_date,
          production_date
        `)
        .order('transaction_date', { ascending: false });

      if (filterType !== 'all') {
        txQuery = txQuery.eq('type', filterType);
      }
      if (dateFrom) {
        txQuery = txQuery.gte('transaction_date', dateFrom);
      }
      if (dateTo) {
        txQuery = txQuery.lte('transaction_date', dateTo);
      }

      let [txRes, itemsRes, partnersRes, opsRes, vehRes] = await Promise.all([
        txQuery,
        supabase.from('inventory_items').select('id, name, unit, default_price, last_purchase_price, expiry_date, production_date, batch_number, current_quantity'),
        supabase.from('partners').select('id, name, account_id, partner_type'),
        supabase.from('fleet_operations').select('id, operation_number, vehicle_id, driver_id'),
        supabase.from('fleet_vehicles').select('id, plate_number')
      ]);

      if (txRes.error && txRes.error.code === '42703') {
        // Resilient fallback if columns not yet added to Supabase
        let fbQuery = supabase
          .from('inventory_transactions')
          .select(`
            id,
            transaction_number,
            transaction_date,
            type,
            quantity,
            unit_price,
            notes,
            status,
            journal_id,
            item_id,
            partner_id,
            fleet_operation_id
          `)
          .order('transaction_date', { ascending: false });
        if (filterType !== 'all') fbQuery = fbQuery.eq('type', filterType);
        if (dateFrom) fbQuery = fbQuery.gte('transaction_date', dateFrom);
        if (dateTo) fbQuery = fbQuery.lte('transaction_date', dateTo);
        txRes = await fbQuery;
      }

      if (txRes.error) throw txRes.error;

      const loadedItems = itemsRes.data || [];
      setItems(loadedItems);

      const itemsMap = new Map(loadedItems.map((it: any) => [it.id, it]));
      const partnersMap = new Map((partnersRes.data || []).map((p: any) => [p.id, p]));
      const opsMap = new Map((opsRes.data || []).map((o: any) => [o.id, o]));
      const vehMap = new Map((vehRes.data || []).map((v: any) => [v.id, v]));

      const formattedData = (txRes.data || []).map((row: any) => {
        const it = itemsMap.get(row.item_id);
        const part = partnersMap.get(row.partner_id);
        const op = opsMap.get(row.fleet_operation_id);
        const veh = op ? vehMap.get(op.vehicle_id) : null;
        const driver = op ? partnersMap.get(op.driver_id) : null;

        return {
          id: row.id,
          transaction_number: row.transaction_number || '-',
          transaction_date: row.transaction_date,
          type: row.type,
          quantity: row.quantity,
          unit_price: row.unit_price,
          notes: row.notes,
          status: row.status || 'pending',
          journal_id: row.journal_id,
          item_id: row.item_id,
          partner_id: row.partner_id,
          item_name: it?.name || 'غير معروف',
          unit: it?.unit || '',
          partner: part?.name || '',
          partner_type: part?.partner_type || '',
          partner_account_id: part?.account_id,
          fleet_operation: op ? `${op.operation_number} - ${veh?.plate_number || 'بدون سيارة'}` : '',
          vehicle_id: op?.vehicle_id,
          vehicle_plate: veh?.plate_number || 'بدون سيارة',
          driver_id: op?.driver_id,
          driver_name: driver?.name || 'بدون مندوب',
          driver_account_id: driver?.account_id,
          fleet_operation_number: op?.operation_number,
          batch_number: row.batch_number || it?.batch_number || '',
          expiry_date: row.expiry_date || it?.expiry_date || '',
          production_date: row.production_date || it?.production_date || ''
        };
      });

      setRawRecords(formattedData);
    } catch (err: any) {
      console.error("خطأ في جلب حركات المستودع:", err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveTransaction = async (transaction: any) => {
    const isSupply = transaction.type === 'in' || transaction.type === 'transfer_in'; 
    const totalAmount = transaction.quantity * transaction.unit_price;

    if ((!transaction.unit_price || totalAmount <= 0) && transaction.type !== 'empty_return') {
      showGlobalToast("⚠️ يرجى التأكد من إدخال سعر الوحدة قبل اعتماد الحركة لتوليد القيد المالي.", 'warning');
      return;
    }

    // ⚡ تحديث تفاؤلي فوري في الواجهة ليظهر التغيير بـ 0 ثانية تأخير
    setRawRecords(prev => prev.map(r => r.id === transaction.id ? { ...r, status: 'approved' } : r));

    try {
      setIsLoading(true);

      await executeApproveTransaction(transaction.id);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }

      showGlobalToast("✅ تم الاعتماد وتوليد القيود المحاسبية وتحديث المستودع بنجاح.", 'success');
      await fetchTransactions();
    } catch (error: any) {
      console.error("خطأ في الاعتماد:", error);
      showGlobalToast(`❌ حدث خطأ أثناء الاعتماد: ${error.message || ''}`, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    const pendingList = rawRecords.filter(r => r.status === 'pending' || r.status === 'مسودة' || !r.status);
    if (pendingList.length === 0) {
      showGlobalToast("لا توجد حركات معلقة للاعتماد.", 'warning');
      return;
    }
    const confirmed = await showConfirm({
      title: "اعتماد الحركات المعلقة",
      message: `هل أنت متأكد من اعتماد جميع الحركات المخزنية المعلقة (${pendingList.length}) دفعة واحدة وتحديث أرصدة المستودعات وترحيل القيود؟`,
      confirmText: "نعم، اعتماد الكل",
      cancelText: "إلغاء",
      type: "warning"
    });
    if (!confirmed) return;

    // ⚡ تحديث تفاؤلي فوري في الـ State ليختفي الإشعار وتتغير الحالة على الفور بدون ريفرش
    const pendingIds = new Set(pendingList.map(t => t.id));
    setRawRecords(prev => prev.map(row => 
      pendingIds.has(row.id) ? { ...row, status: 'approved' } : row
    ));

    try {
      setIsLoading(true);
      let success = 0;
      for (const t of pendingList) {
        try {
          await executeApproveTransaction(t.id, { skipSync: true });
          success++;
        } catch (subErr) {
          console.error(`Failed to approve ${t.id}:`, subErr);
        }
      }

      // مزامنة الأرصدة وبث التحديثات مرة واحدة لجميع الشاشات
      await syncAllWarehouseBalances();
      emitTableChange('inventory_transactions');
      emitTableChange('journal_headers');
      emitTableChange('journal_lines');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }

      if (success === pendingList.length) {
        showGlobalToast(`✅ تم اعتماد جميع الحركات المخزنية (${success}) وتحديث القيود بنجاح!`, 'success');
      } else {
        showGlobalToast(`⚠️ تم اعتماد ${success} من أصل ${pendingList.length} حركة مخزنية.`, 'warning');
      }

      await fetchTransactions();
    } catch (err: any) {
      console.error(err);
      showGlobalToast(`❌ حدث خطأ أثناء الاعتماد الجماعي: ${err.message}`, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnapproveTransaction = async (transaction: any) => {
    const confirmed = await showConfirm({
      title: "فك اعتماد الحركة المخزنية",
      message: "⚠️ تحذير: سيتم فك اعتماد الحركة وإرجاع كمية المستودع (ومسح القيود إن وجدت). هل أنت متأكد؟",
      confirmText: "نعم، فك الاعتماد",
      cancelText: "إلغاء",
      type: "danger"
    });
    if (!confirmed) return;

    // ⚡ تحديث تفاؤلي فوري
    setRawRecords(prev => prev.map(r => r.id === transaction.id ? { ...r, status: 'pending' } : r));

    try {
      setIsLoading(true);

      await executeUnapproveTransaction(transaction.id);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }

      showGlobalToast("✅ تم فك الاعتماد ومسح القيد المحاسبي وعكس أرصدة المستودع بنجاح.", 'success');
      await fetchTransactions();
    } catch (error: any) {
      console.error("خطأ في فك الاعتماد:", error);
      showGlobalToast(`❌ حدث خطأ أثناء فك الاعتماد: ${error.message || ''}`, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const confirmed = await showConfirm({
      title: "حذف الحركة المخزنية",
      message: "هل أنت متأكد من حذف هذه الحركة نهائياً من سجلات النظام؟",
      confirmText: "نعم، حذف نهائي",
      cancelText: "إلغاء",
      type: "danger"
    });
    if (!confirmed) return;

    // ⚡ تحديث تفاؤلي فوري
    setRawRecords(prev => prev.filter(r => r.id !== id));

    try {
      setIsLoading(true);
      await supabase.from('inventory_transactions').delete().eq('id', id);
      await syncAllWarehouseBalances();
      emitTableChange('inventory_transactions');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }
      showGlobalToast("🗑️ تم حذف الحركة وتحديث الأرصدة بنجاح.", 'success');
      await fetchTransactions();
    } catch (err: any) {
      console.error("خطأ في الحذف:", err);
      showGlobalToast(`❌ حدث خطأ أثناء الحذف: ${err.message || ''}`, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [filterType, dateFrom, dateTo]);

  // 🔄 مزامنة فورية - تحديث تلقائي عند أي تغيير في قاعدة البيانات
  useRealtimeListener('inventory_transactions', () => fetchTransactions());

  const data = useMemo(() => {
    if (!globalSearch) return rawRecords;
    const lowerSearch = globalSearch.toLowerCase();
    
    return rawRecords.filter(row => 
      (row.transaction_number && row.transaction_number.toString().toLowerCase().includes(lowerSearch)) ||
      (row.item_name && row.item_name.toLowerCase().includes(lowerSearch)) ||
      (row.partner && row.partner.toLowerCase().includes(lowerSearch))
    );
  }, [rawRecords, globalSearch]);

  const stats = useMemo(() => {
    let wasteCost = 0;
    let wasteQty = 0;
    let emptyReturnQty = 0;
    let pendingCount = 0;

    rawRecords.forEach(r => {
      const isPending = r.status === 'pending' || r.status === 'مسودة' || !r.status;
      if (isPending) pendingCount++;

      if (r.type === 'waste' || r.type === 'damage') {
        const qty = Number(r.quantity) || 0;
        const price = Number(r.unit_price) || 0;
        wasteQty += qty;
        wasteCost += (qty * price);
      } else if (r.type === 'empty_return') {
        emptyReturnQty += (Number(r.quantity) || 0);
      }
    });

    return {
      wasteCost,
      wasteQty,
      emptyReturnQty,
      pendingCount
    };
  }, [rawRecords]);

  const handleConfirmReceipt = async (transaction: any, receiptData: { batch_number?: string, expiry_date?: string, production_date?: string }) => {
    try {
      const payload: any = {
        batch_number: receiptData.batch_number || null,
        expiry_date: receiptData.expiry_date || null,
        production_date: receiptData.production_date || null
      };
      const { error } = await supabase.from('inventory_transactions').update(payload).eq('id', transaction.id);
      if (error && error.code === '42703') {
        console.warn('Batch/expiry columns not yet migrated in inventory_transactions');
      }
    } catch (err) {
      console.warn('Transaction receipt fields update:', err);
    }

    if (transaction.item_id && (receiptData.expiry_date || receiptData.batch_number || receiptData.production_date)) {
      try {
        await supabase.from('inventory_items').update({
          expiry_date: receiptData.expiry_date || null,
          production_date: receiptData.production_date || null,
          batch_number: receiptData.batch_number || null,
        }).eq('id', transaction.item_id);
      } catch (itemErr) {
        console.warn('Item expiry update error:', itemErr);
      }

      saveLocalExpiryMetadata(transaction.item_id, {
        expiry_date: receiptData.expiry_date || undefined,
        batch_number: receiptData.batch_number || undefined,
        alert_before_days: 30
      });
    }

    await handleApproveTransaction({
      ...transaction,
      ...receiptData
    });
  };

  return {
    data,
    rawRecords,
    items,
    stats,
    isLoading,
    globalSearch, setGlobalSearch,
    filterType, setFilterType,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    fetchTransactions,
    handleApproveTransaction,
    handleConfirmReceipt,
    handleUnapproveTransaction,
    handleBulkApprove,
    handleDeleteTransaction
  };
}
