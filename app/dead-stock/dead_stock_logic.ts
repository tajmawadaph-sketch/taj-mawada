"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';
import { executeApproveTransaction, MAIN_WAREHOUSE_ID } from '@/lib/inventory_engine';
import { getPromotionsList } from '@/lib/cache/resources';
import { saveTableLocally } from '@/lib/offline/syncStore';
import { invalidateTags } from '@/lib/cache/dataCache';
import * as XLSX from 'xlsx';

export interface DeadStockItem {
  id: string;
  name: string;
  code?: string;
  barcode?: string;
  unit?: string;
  qty: number;
  cost: number;
  suggested_price?: number;
  frozenCapital: number;
  lastMovementDate: string;
  daysSinceLastMovement: number;
  batch_number?: string;
  expiry_date?: string;
  warehouse_id?: string;
}

export function useDeadStockLogic() {
  const queryClient = useQueryClient();
  const { showToast, showConfirm } = useToast();

  const [globalSearch, setGlobalSearch] = useState('');
  const [stagnantDays, setStagnantDays] = useState<number>(90); // Default to 90 days

  // Quick Action Modal States
  const [isDisposalModalOpen, setIsDisposalModalOpen] = useState(false);
  const [selectedItemForDisposal, setSelectedItemForDisposal] = useState<DeadStockItem | null>(null);
  const [disposalQty, setDisposalQty] = useState<number>(0);
  const [disposalReason, setDisposalReason] = useState('إتلاف مخزني لبضاعة راكدة وتالفة');
  const [isDisposalLoading, setIsDisposalLoading] = useState(false);

  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [selectedItemForPromo, setSelectedItemForPromo] = useState<DeadStockItem | null>(null);
  const [promoDiscountPercent, setPromoDiscountPercent] = useState<number>(30);
  const [promoMinQty, setPromoMinQty] = useState<number>(1);
  const [isPromoLoading, setIsPromoLoading] = useState(false);

  const itemsQuery = useQuery({
    queryKey: ['dead_stock_items'],
    queryFn: async () => {
      const { data: items, error } = await supabase
        .from('inventory_items')
        .select('*')
        .gt('current_quantity', 0);
      if (error) throw error;
      return items || [];
    }
  });

  const transactionsQuery = useQuery({
    queryKey: ['dead_stock_transactions'],
    queryFn: async () => {
      const { data: txs, error } = await supabase
        .from('inventory_transactions')
        .select('item_id, transaction_date')
        .in('type', ['out', 'صرف', 'transfer', 'sales_deduction'])
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return txs || [];
    }
  });

  const rawItems = itemsQuery.data || [];
  const rawTxs = transactionsQuery.data || [];

  const processedItems: DeadStockItem[] = useMemo(() => {
    const lastTxMap = new Map<string, string>();
    rawTxs.forEach(tx => {
      if (tx.item_id && tx.transaction_date) {
        if (!lastTxMap.has(tx.item_id)) {
          lastTxMap.set(tx.item_id, tx.transaction_date);
        } else {
          const currentLast = lastTxMap.get(tx.item_id)!;
          if (new Date(tx.transaction_date) > new Date(currentLast)) {
            lastTxMap.set(tx.item_id, tx.transaction_date);
          }
        }
      }
    });

    const today = new Date();

    return rawItems.map(item => {
      const lastMovementDateStr = lastTxMap.get(item.id) || item.created_at || new Date().toISOString();
      const lastMovementDate = new Date(lastMovementDateStr);
      
      const diffTime = Math.abs(today.getTime() - lastMovementDate.getTime());
      const daysSinceLastMovement = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const cost = Number(item.cost_price || item.cost || item.default_price || 0);
      const qty = Number(item.current_quantity || 0);
      const frozenCapital = qty * cost;

      return {
        id: item.id,
        name: item.name,
        code: item.code,
        barcode: item.barcode,
        unit: item.unit || 'حبة',
        qty,
        cost,
        suggested_price: Number(item.suggested_price || item.default_price || 0),
        frozenCapital,
        lastMovementDate: lastMovementDateStr.split('T')[0],
        daysSinceLastMovement,
        batch_number: item.batch_number,
        expiry_date: item.expiry_date,
        warehouse_id: item.warehouse_id || MAIN_WAREHOUSE_ID
      };
    });
  }, [rawItems, rawTxs]);

  const filteredItems = useMemo(() => {
    let res = processedItems.filter(item => item.daysSinceLastMovement >= stagnantDays);
    
    if (globalSearch) {
      const s = globalSearch.toLowerCase();
      res = res.filter(i => 
        (i.name && i.name.toLowerCase().includes(s)) || 
        (i.code && i.code.toLowerCase().includes(s)) ||
        (i.barcode && i.barcode.toLowerCase().includes(s))
      );
    }
    return res.sort((a, b) => b.frozenCapital - a.frozenCapital);
  }, [processedItems, globalSearch, stagnantDays]);

  const totalDeadItems = filteredItems.length;
  const totalFrozenCapital = filteredItems.reduce((sum, item) => sum + item.frozenCapital, 0);

  // Quick Action: Disposal Modal
  const openDisposalModal = (item: DeadStockItem) => {
    setSelectedItemForDisposal(item);
    setDisposalQty(item.qty > 0 ? item.qty : 1);
    setDisposalReason('إتلاف مخزني بسبب ركود وتلف البضاعة');
    setIsDisposalModalOpen(true);
  };

  const handleExecuteDisposal = async () => {
    if (!selectedItemForDisposal) return;
    if (disposalQty <= 0) {
      showToast('يرجى تحديد كمية صحيحة أكبر من صفر', 'warning');
      return;
    }

    setIsDisposalLoading(true);
    try {
      const txNumber = `DEAD-${Date.now().toString().slice(-6)}`;
      const { data: newTx, error: txErr } = await supabase.from('inventory_transactions').insert([{
        type: 'waste',
        item_id: selectedItemForDisposal.id,
        quantity: disposalQty,
        unit_price: selectedItemForDisposal.cost || 0,
        warehouse_id: selectedItemForDisposal.warehouse_id || MAIN_WAREHOUSE_ID,
        batch_number: selectedItemForDisposal.batch_number || null,
        expiry_date: selectedItemForDisposal.expiry_date || null,
        notes: `${disposalReason} (${txNumber})`,
        transaction_date: new Date().toISOString().split('T')[0],
        status: 'pending'
      }]).select('id').single();

      if (txErr) throw txErr;

      if (newTx?.id) {
        await executeApproveTransaction(newTx.id);
      }

      showToast(`تم إتلاف (${disposalQty} ${selectedItemForDisposal.unit}) من المخزون الراكد بنجاح 🗑️`, 'success');
      setIsDisposalModalOpen(false);
      setSelectedItemForDisposal(null);

      queryClient.invalidateQueries({ queryKey: ['dead_stock_items'] });
      queryClient.invalidateQueries({ queryKey: ['dead_stock_transactions'] });
    } catch (err: any) {
      console.error('Error executing dead stock disposal:', err);
      showToast(`فشل الإتلاف: ${err.message}`, 'error');
    } finally {
      setIsDisposalLoading(false);
    }
  };

  // Quick Action: Promotion Modal
  const openPromoModal = (item: DeadStockItem) => {
    setSelectedItemForPromo(item);
    setPromoDiscountPercent(30);
    setPromoMinQty(1);
    setIsPromoModalOpen(true);
  };

  const handleExecutePromo = async () => {
    if (!selectedItemForPromo) return;
    if (promoDiscountPercent <= 0 || promoDiscountPercent > 100) {
      showToast('نسبة الخصم يجب أن تكون بين 1% و 100%', 'warning');
      return;
    }

    setIsPromoLoading(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const promoPayload = {
        name: `تصفية راكد: ${selectedItemForPromo.name} (خصم ${promoDiscountPercent}%)`,
        description: `عرض ترويجي خاص لتصريف البضاعة الراكدة وتنشيط رأس المال`,
        type: 'QUANTITY',
        status: 'active',
        priority: 2,
        start_date: todayStr,
        end_date: selectedItemForPromo.expiry_date || undefined,
        conditions: {
          item_id: selectedItemForPromo.id,
          min_qty: promoMinQty
        },
        rewards: {
          discount_percentage: promoDiscountPercent,
          badge: `تصفية ${promoDiscountPercent}%`
        }
      };

      const { error: promoErr } = await supabase.from('promotions').insert([promoPayload]);
      if (promoErr) throw promoErr;

      // Sync offline and invalidate tags
      try {
        const { data: activePromos } = await supabase.from('promotions').select('*').eq('status', 'active');
        if (activePromos) {
          invalidateTags(['promotions']);
          await saveTableLocally('promotions', activePromos);
        }
        await getPromotionsList(true);
      } catch (cacheErr) {
        console.warn('Cache refresh warning:', cacheErr);
      }

      showToast(`تم تفعيل عرض تصفية (${promoDiscountPercent}%) في الكاشير بنجاح 🎁`, 'success');
      setIsPromoModalOpen(false);
      setSelectedItemForPromo(null);
    } catch (err: any) {
      console.error('Error creating promo for dead stock:', err);
      showToast(`فشل إنشاء العرض: ${err.message}`, 'error');
    } finally {
      setIsPromoLoading(false);
    }
  };

  const exportToExcel = () => {
    const exportData = filteredItems.map(i => ({
      'كود الصنف': i.code,
      'اسم الصنف': i.name,
      'الكمية الراكدة': i.qty,
      'متوسط التكلفة': i.cost,
      'إجمالي رأس المال المجمد': i.frozenCapital,
      'تاريخ آخر حركة منصرف': i.lastMovementDate,
      'أيام الركود': i.daysSinceLastMovement
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "المخزون الراكد");
    XLSX.writeFile(wb, `Dead_Stock_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير ملف الإكسل بنجاح 📊', 'success');
  };

  return {
    filteredItems,
    globalSearch,
    setGlobalSearch,
    stagnantDays,
    setStagnantDays,
    totalDeadItems,
    totalFrozenCapital,
    isLoading: itemsQuery.isLoading || transactionsQuery.isLoading,

    // Disposal Modal
    isDisposalModalOpen, setIsDisposalModalOpen,
    selectedItemForDisposal,
    disposalQty, setDisposalQty,
    disposalReason, setDisposalReason,
    openDisposalModal,
    handleExecuteDisposal,
    isDisposalLoading,

    // Promo Modal
    isPromoModalOpen, setIsPromoModalOpen,
    selectedItemForPromo,
    promoDiscountPercent, setPromoDiscountPercent,
    promoMinQty, setPromoMinQty,
    openPromoModal,
    handleExecutePromo,
    isPromoLoading,

    exportToExcel
  };
}
