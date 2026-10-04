"use client";
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { syncAllWarehouseBalances, executeApproveTransaction, MAIN_WAREHOUSE_ID } from '@/lib/inventory_engine';
import { playPosBeep, triggerHaptic } from '@/components/BarcodeScannerWidget';
import { emitTableChange } from '@/lib/useRealtimeSync';
import * as XLSX from 'xlsx';

export interface StocktakingItem {
  item_id: string;
  code: string;
  barcode: string;
  name: string;
  unit: string;
  book_qty: number;         // الرصيد الدفتري
  physical_qty: number;     // الرصيد الفعلي المجرود
  variance_qty: number;     // physical_qty - book_qty
  cost_price: number;       // متوسط التكلفة للوحدة
  variance_value: number;   // variance_qty * cost_price
  status: 'matched' | 'deficit' | 'surplus';
  batch_number?: string;
  expiry_date?: string;
  scanned_count: number;    // عدد مرات المسح بالباركود
  last_scanned_at?: number;
  notes?: string;
}

export interface StocktakingSession {
  id: string;
  session_number: string;
  date: string;
  warehouse_id: string;
  warehouse_name: string;
  count_type: 'full' | 'partial';
  status: 'in_progress' | 'approved';
  total_items: number;
  matched_items: number;
  deficit_items: number;
  surplus_items: number;
  total_deficit_value: number;
  total_surplus_value: number;
  net_variance_value: number;
  auditor_name: string;
  notes?: string;
  items: StocktakingItem[];
}

const STOCKTAKING_STORAGE_KEY = 'taj_stocktaking_history_v1';

export function getStocktakingHistory(): StocktakingSession[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STOCKTAKING_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveStocktakingSessionToHistory(session: StocktakingSession) {
  if (typeof window === 'undefined') return;
  try {
    const history = getStocktakingHistory();
    const updated = [session, ...history.filter(s => s.id !== session.id)].slice(0, 50);
    localStorage.setItem(STOCKTAKING_STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    console.warn('Failed to save stocktaking history:', err);
  }
}

export function useStocktakingLogic(initialWarehouseId?: string) {
  const { showToast, showConfirm } = useToast();

  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(initialWarehouseId || MAIN_WAREHOUSE_ID);
  const [countType, setCountType] = useState<'full' | 'partial'>('full');
  const [auditorName, setAuditorName] = useState('أمين المستودع الرئيسي');
  const [sessionNotes, setSessionNotes] = useState('');
  const [sessionNumber, setSessionNumber] = useState('');

  const [items, setItems] = useState<StocktakingItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'variance_only' | 'deficit' | 'surplus' | 'matched'>('all');
  const [recentScannedId, setRecentScannedId] = useState<string | null>(null);

  // Raw catalog items cache
  const rawCatalogRef = useRef<any[]>([]);

  // توليد رقم المحضر
  const generateSessionNumber = useCallback(() => {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `AUD-${ymd}-${rand}`;
  }, []);

  // جلب المستودعات
  const fetchWarehouses = useCallback(async () => {
    try {
      const { data } = await supabase.from('warehouses').select('id, name, type, is_active').order('name');
      if (data) {
        setWarehouses(data);
        if (!selectedWarehouseId && data.length > 0) {
          setSelectedWarehouseId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching warehouses:', err);
    }
  }, [selectedWarehouseId]);

  // تهيئة وبدء جلسة جرد جديدة للمستودع المختار
  const startNewSession = useCallback(async (
    whId = selectedWarehouseId, 
    type: 'full' | 'partial' = countType,
    initOption: 'match_book' | 'zero_start' = 'match_book'
  ) => {
    setIsLoading(true);
    setSessionNumber(generateSessionNumber());

    try {
      // 1. جلب الأصناف
      const { data: catItems } = await supabase.from('inventory_items').select('*').order('name');
      rawCatalogRef.current = catItems || [];

      // 2. جلب أرصدة المستودع المختار
      const { data: whInv } = await supabase
        .from('warehouse_inventory')
        .select('*')
        .eq('warehouse_id', whId);

      const whInvMap = new Map<string, number>();
      (whInv || []).forEach(row => {
        whInvMap.set(row.item_id, Number(row.quantity) || 0);
      });

      // 3. بناء بنود الجرد
      const stockItems: StocktakingItem[] = (catItems || []).map(cat => {
        let bookQty = whInvMap.get(cat.id) !== undefined ? (whInvMap.get(cat.id) || 0) : 0;
        
        // Fallback للمستودع الرئيسي إذا كان جدول warehouse_inventory غير ممتلئ
        if (whId === MAIN_WAREHOUSE_ID && !whInvMap.has(cat.id)) {
          bookQty = Number(cat.current_quantity || 0);
        }

        const cost = Number(cat.cost_price || cat.default_price || 0);
        // خيار البدء: إما تعيين الرصيد الفعلي مساوياً للدفتر للتحقق بالاستثناء، أو البدء من الصفر
        const physicalQty = initOption === 'match_book' ? bookQty : 0;
        const varianceQty = physicalQty - bookQty;
        const varianceVal = varianceQty * cost;

        let status: StocktakingItem['status'] = 'matched';
        if (varianceQty < 0) status = 'deficit';
        else if (varianceQty > 0) status = 'surplus';

        return {
          item_id: cat.id,
          code: cat.code || '',
          barcode: cat.barcode || '',
          name: cat.name || '',
          unit: cat.unit || 'حبة',
          book_qty: bookQty,
          physical_qty: physicalQty,
          variance_qty: varianceQty,
          cost_price: cost,
          variance_value: varianceVal,
          status,
          batch_number: cat.batch_number || '',
          expiry_date: cat.expiry_date || '',
          scanned_count: 0
        };
      });

      setItems(stockItems);
      showToast(`تم بدء محضر الجرد (${type === 'full' ? 'جرد شامل' : 'جرد جزئي'}) للمستودع بنجاح 📋`, 'info');
    } catch (err: any) {
      console.error('Error starting stocktaking session:', err);
      showToast(`فشل بدء جلسة الجرد: ${err.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [selectedWarehouseId, countType, generateSessionNumber, showToast]);

  useEffect(() => {
    fetchWarehouses();
  }, [fetchWarehouses]);

  useEffect(() => {
    if (selectedWarehouseId) {
      startNewSession(selectedWarehouseId, countType, 'match_book');
    }
  }, [selectedWarehouseId]);

  // مسح باركود صنف وزيادة الرصيد الفعلي آلياً
  const handleScanBarcode = useCallback((scannedCode: string) => {
    const query = scannedCode.trim().toLowerCase();
    if (!query) return;

    setItems(prevItems => {
      // ابحث بالباركود الدقيق أولاً، ثم الكود، ثم الاسم المطابق
      const idx = prevItems.findIndex(it => 
        (it.barcode && it.barcode.toLowerCase() === query) ||
        (it.code && it.code.toLowerCase() === query)
      );

      if (idx === -1) {
        showToast(`⚠️ الصنف صاحب الباركود [${scannedCode}] غير مسجل بدليل الأصناف!`, 'warning');
        return prevItems;
      }

      playPosBeep();
      triggerHaptic(80);

      const target = prevItems[idx];
      const newPhysical = target.physical_qty + 1;
      const newVariance = newPhysical - target.book_qty;
      const newVarVal = newVariance * target.cost_price;
      
      let newStatus: StocktakingItem['status'] = 'matched';
      if (newVariance < 0) newStatus = 'deficit';
      else if (newVariance > 0) newStatus = 'surplus';

      const updatedTarget: StocktakingItem = {
        ...target,
        physical_qty: newPhysical,
        variance_qty: newVariance,
        variance_value: newVarVal,
        status: newStatus,
        scanned_count: target.scanned_count + 1,
        last_scanned_at: Date.now()
      };

      setRecentScannedId(target.item_id);
      setTimeout(() => setRecentScannedId(null), 2500);

      // وضع الصنف الممسوح في مقدمة القائمة لسهولة الرؤية
      const clone = [...prevItems];
      clone.splice(idx, 1);
      return [updatedTarget, ...clone];
    });

    setBarcodeInput('');
  }, [showToast]);

  // تعديل يدوي مباشر للرصيد الفعلي
  const handleUpdatePhysicalQty = useCallback((itemId: string, newQty: number) => {
    const validQty = Math.max(0, Number(newQty) || 0);

    setItems(prev => prev.map(it => {
      if (it.item_id !== itemId) return it;

      const newVar = validQty - it.book_qty;
      const newVarVal = newVar * it.cost_price;
      let newStatus: StocktakingItem['status'] = 'matched';
      if (newVar < 0) newStatus = 'deficit';
      else if (newVar > 0) newStatus = 'surplus';

      return {
        ...it,
        physical_qty: validQty,
        variance_qty: newVar,
        variance_value: newVarVal,
        status: newStatus
      };
    }));
  }, []);

  // إجراءات جماعية سريعة
  const handleSetAllToBook = useCallback(() => {
    setItems(prev => prev.map(it => ({
      ...it,
      physical_qty: it.book_qty,
      variance_qty: 0,
      variance_value: 0,
      status: 'matched'
    })));
    showToast('تمت مطابقة الرصيد الفعلي لكافة الأصناف مع الرصيد الدفتري 🟢', 'info');
  }, [showToast]);

  const handleSetAllToZero = useCallback(() => {
    setItems(prev => prev.map(it => {
      const v = -it.book_qty;
      return {
        ...it,
        physical_qty: 0,
        variance_qty: v,
        variance_value: v * it.cost_price,
        status: v < 0 ? 'deficit' : 'matched'
      };
    }));
    showToast('تم تصفير الأرصدة الفعلية للبدء في العد الصارم 🔄', 'info');
  }, [showToast]);

  // مؤشرات الأداء الحية (KPIs)
  const metrics = useMemo(() => {
    let matchedCount = 0;
    let deficitCount = 0;
    let surplusCount = 0;
    let totalDeficitValue = 0;
    let totalSurplusValue = 0;

    items.forEach(it => {
      if (it.variance_qty === 0) {
        matchedCount++;
      } else if (it.variance_qty < 0) {
        deficitCount++;
        totalDeficitValue += Math.abs(it.variance_value);
      } else {
        surplusCount++;
        totalSurplusValue += it.variance_value;
      }
    });

    const netVarianceValue = totalSurplusValue - totalDeficitValue;

    return {
      totalItems: items.length,
      matchedCount,
      deficitCount,
      surplusCount,
      totalDeficitValue,
      totalSurplusValue,
      netVarianceValue,
      varianceItemsCount: deficitCount + surplusCount
    };
  }, [items]);

  // تصفية العرض والبحث
  const filteredItems = useMemo(() => {
    return items.filter(it => {
      // 1. فلتر الحالة
      if (statusFilter === 'variance_only' && it.status === 'matched') return false;
      if (statusFilter === 'deficit' && it.status !== 'deficit') return false;
      if (statusFilter === 'surplus' && it.status !== 'surplus') return false;
      if (statusFilter === 'matched' && it.status !== 'matched') return false;

      // 2. فلتر البحث
      if (searchFilter.trim()) {
        const q = searchFilter.trim().toLowerCase();
        const matchName = it.name.toLowerCase().includes(q);
        const matchCode = it.code.toLowerCase().includes(q);
        const matchBarcode = it.barcode.toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchBarcode) return false;
      }

      return true;
    });
  }, [items, statusFilter, searchFilter]);

  // 🚀 اعتماد محضر الجرد وتوليد حركات وتسويات مخزنية فورية مع القيود المحاسبية
  const handleApproveStocktaking = async () => {
    const varianceItems = items.filter(it => it.variance_qty !== 0);

    if (varianceItems.length === 0) {
      showToast('🎉 تهانينا! لا توجد أي فروقات جردية (المخزون الفعلي مطابق للدفتري بنسبة 100%)', 'success');
      return;
    }

    const currentWh = warehouses.find(w => w.id === selectedWarehouseId);
    const whName = currentWh?.name || 'المستودع الرئيسي';

    const confirmed = await showConfirm({
      title: 'اعتماد محضر الجرد وتوليد التسويات المخزنية والقيود',
      message: `هل أنت متأكد من اعتماد محضر الجرد رقم (${sessionNumber}) لمستودع "${whName}"؟\n` +
               `• عدد الأصناف التي بها فروقات: ${varianceItems.length} صنف\n` +
               `• إجمالي عجز جردي (خسائر): ${metrics.totalDeficitValue.toLocaleString('ar-SA')} ر.س\n` +
               `• إجمالي فائض جردي (إيرادات): ${metrics.totalSurplusValue.toLocaleString('ar-SA')} ر.س\n` +
               `• صافي الأثر المالي: ${metrics.netVarianceValue.toLocaleString('ar-SA')} ر.س\n\n` +
               `سيتم توليد حركات تسوية معتمدة وترحيل القيود المزدوجة ومزامنة الأرصدة فورياً.`,
      confirmText: 'نعم، اعتمد الجرد ورحّل القيود',
      cancelText: 'إلغاء ومراجعة',
      type: 'danger'
    });

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      let processedTxCount = 0;

      for (const item of varianceItems) {
        const isSurplus = item.variance_qty > 0;
        const qtyDiff = Math.abs(item.variance_qty);
        const txType = isSurplus ? 'adjustment_in' : 'adjustment_out';
        const txDesc = isSurplus 
          ? `تسوية زيادة جردية - محضر #${sessionNumber}` 
          : `تسوية عجز جردي - محضر #${sessionNumber}`;

        const { data: newTx, error: txErr } = await supabase.from('inventory_transactions').insert([{
          type: txType,
          item_id: item.item_id,
          quantity: qtyDiff,
          unit_price: item.cost_price || 0,
          warehouse_id: selectedWarehouseId,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          notes: txDesc,
          transaction_date: todayStr,
          status: 'pending'
        }]).select('id').single();

        if (txErr) {
          console.error(`Error inserting adjustment for ${item.name}:`, txErr);
          continue;
        }

        if (newTx?.id) {
          await executeApproveTransaction(newTx.id, { skipSync: true });
          processedTxCount++;
        }
      }

      // إعادة مزامنة أرصدة كافة المستودعات وبث التحديث اللحظي
      await syncAllWarehouseBalances();
      emitTableChange('inventory_transactions');
      emitTableChange('warehouse_inventory');
      emitTableChange('journal_headers');
      emitTableChange('journal_lines');

      // حفظ جلسة الجرد في السجل التاريخي
      const sessionRecord: StocktakingSession = {
        id: `SESSION-${Date.now()}`,
        session_number: sessionNumber,
        date: todayStr,
        warehouse_id: selectedWarehouseId,
        warehouse_name: whName,
        count_type: countType,
        status: 'approved',
        total_items: items.length,
        matched_items: metrics.matchedCount,
        deficit_items: metrics.deficitCount,
        surplus_items: metrics.surplusCount,
        total_deficit_value: metrics.totalDeficitValue,
        total_surplus_value: metrics.totalSurplusValue,
        net_variance_value: metrics.netVarianceValue,
        auditor_name: auditorName,
        notes: sessionNotes,
        items: items
      };
      saveStocktakingSessionToHistory(sessionRecord);

      showToast(`تم اعتماد محضر الجرد وتوليد (${processedTxCount}) قيد تسوية مخزنية ومزامنة الأرصدة بنجاح! 📋✨`, 'success');

      // إعادة تحميل الجلسة بعد التسوية (ستصبح متطابقة تماماً)
      await startNewSession(selectedWarehouseId, countType, 'match_book');
    } catch (err: any) {
      console.error('Error approving stocktaking:', err);
      showToast(`فشل اعتماد الجرد: ${err.message || 'خطأ غير متوقع'}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // تصدير محضر الجرد إلى Excel
  const exportToExcel = () => {
    if (!items.length) {
      showToast('لا توجد بيانات جرد لتصديرها', 'warning');
      return;
    }

    const exportRows = items.map((it, idx) => ({
      '#': idx + 1,
      'كود الصنف': it.code,
      'اسم الصنف': it.name,
      'الباركود': it.barcode || '-',
      'الوحدة': it.unit,
      'الرصيد الدفتري': it.book_qty,
      'الرصيد الفعلي (المجرود)': it.physical_qty,
      'فارق الكمية': it.variance_qty,
      'متوسط التكلفة': it.cost_price,
      'الفارق المالي (ر.س)': it.variance_value,
      'حالة المطابقة': it.status === 'matched' ? 'مطابق' : (it.status === 'deficit' ? 'عجز جردي' : 'فائض جردي'),
      'رقم التشغيلة': it.batch_number || '-',
      'تاريخ الانتهاء': it.expiry_date || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'محضر الجرد والتسوية');
    XLSX.writeFile(wb, `محضر_جرد_${sessionNumber}_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('تم تصدير محضر الجرد إلى إكسل بنجاح 📊', 'success');
  };

  return {
    warehouses,
    selectedWarehouseId,
    setSelectedWarehouseId,
    countType,
    setCountType,
    sessionNumber,
    auditorName,
    setAuditorName,
    sessionNotes,
    setSessionNotes,
    items: filteredItems,
    allItemsCount: items.length,
    isLoading,
    isSubmitting,
    barcodeInput,
    setBarcodeInput,
    searchFilter,
    setSearchFilter,
    statusFilter,
    setStatusFilter,
    metrics,
    recentScannedId,
    handleScanBarcode,
    handleUpdatePhysicalQty,
    handleSetAllToBook,
    handleSetAllToZero,
    handleApproveStocktaking,
    startNewSession,
    exportToExcel
  };
}
