import { supabase } from '@/lib/supabase';
import { ACC } from '@/lib/account-ids';
import { emitTableChange } from '@/lib/useRealtimeSync';

export const MAIN_WAREHOUSE_ID = '11111111-1111-1111-1111-111111111111';

/**
 * 🔄 إعادة احتساب ومزامنة كافة أرصدة المستودعات وسيارات التوزيع
 * متوافقة 100% مع اسكيما قاعدة البيانات
 */
export async function syncAllWarehouseBalances() {
  try {
    // 1. جلب كافة الحركات المعتمدة
    const { data: transactions, error: txErr } = await supabase
      .from('inventory_transactions')
      .select('id, type, quantity, item_id, warehouse_id, destination_warehouse_id, status, fleet_operation_id, fleet_operations(vehicle_id)')
      .eq('status', 'approved');

    if (txErr) throw txErr;

    // 2. جلب الأصناف والمستودعات النشطة
    const { data: items, error: itmErr } = await supabase
      .from('inventory_items')
      .select('id, current_quantity');
    if (itmErr) throw itmErr;

    const { data: warehouses, error: whErr } = await supabase
      .from('warehouses')
      .select('id, name, type, vehicle_id')
      .eq('is_active', true);
    if (whErr) throw whErr;

    // 3. حساب الأرصدة في الذاكرة
    // whBalances: { [wh_id]: { [item_id]: number } }
    const whBalances: Record<string, Record<string, number>> = {};
    const itemTotals: Record<string, number> = {};

    (items || []).forEach(i => {
      itemTotals[i.id] = 0;
    });

    (warehouses || []).forEach(wh => {
      whBalances[wh.id] = {};
      (items || []).forEach(i => {
        whBalances[wh.id][i.id] = 0;
      });
    });

    (transactions || []).forEach(tx => {
      const qty = Number(tx.quantity) || 0;
      if (!tx.item_id || qty <= 0) return;

      const srcWh = tx.warehouse_id || MAIN_WAREHOUSE_ID;
      let destWh = tx.destination_warehouse_id;

      // ربط ذكي لمستودع السيارة إن وجد أمر تشغيل رحلة
      if (!destWh && (tx as any).fleet_operations?.vehicle_id) {
        const vWh = warehouses?.find(w => w.vehicle_id === (tx as any).fleet_operations.vehicle_id);
        if (vWh) destWh = vWh.id;
      }

      if (!whBalances[srcWh]) whBalances[srcWh] = {};
      if (whBalances[srcWh][tx.item_id] === undefined) whBalances[srcWh][tx.item_id] = 0;

      if (tx.type === 'in' || tx.type === 'transfer_in' || tx.type === 'empty_return') {
        whBalances[srcWh][tx.item_id] += qty;
        itemTotals[tx.item_id] = (itemTotals[tx.item_id] || 0) + qty;
      } else if (tx.type === 'waste') {
        whBalances[srcWh][tx.item_id] -= qty;
        itemTotals[tx.item_id] = (itemTotals[tx.item_id] || 0) - qty;
      } else if (tx.type === 'out' || tx.type === 'transfer_out' || tx.type === 'sales_deduction') {
        whBalances[srcWh][tx.item_id] -= qty;

        if (destWh) {
          // تحويل داخلي لسيارة أو مستودع آخر
          if (!whBalances[destWh]) whBalances[destWh] = {};
          if (whBalances[destWh][tx.item_id] === undefined) whBalances[destWh][tx.item_id] = 0;
          whBalances[destWh][tx.item_id] += qty;
          // في التحويل الداخلي لا تتغير الكمية الإجمالية للشركة
        } else {
          // صرف نهائي خارجي
          itemTotals[tx.item_id] = (itemTotals[tx.item_id] || 0) - qty;
        }
      }
    });

    // 4. تحديث جدول warehouse_inventory
    const { data: existingWhInv } = await supabase.from('warehouse_inventory').select('*');
    const existingMap = new Map<string, any>();
    (existingWhInv || []).forEach(row => {
      existingMap.set(`${row.warehouse_id}_${row.item_id}`, row);
    });

    for (const whId of Object.keys(whBalances)) {
      for (const itemId of Object.keys(whBalances[whId])) {
        const qty = Math.max(0, whBalances[whId][itemId] || 0);
        const key = `${whId}_${itemId}`;
        const existing = existingMap.get(key);

        if (existing) {
          if (Number(existing.quantity) !== qty) {
            await supabase
              .from('warehouse_inventory')
              .update({ quantity: qty, updated_at: new Date().toISOString() })
              .eq('id', existing.id);
          }
        } else if (qty > 0) {
          await supabase
            .from('warehouse_inventory')
            .insert([{ warehouse_id: whId, item_id: itemId, quantity: qty }]);
        }
      }
    }

    // 5. تحديث الكمية الإجمالية في جدول inventory_items
    for (const item of (items || [])) {
      const totalQty = Math.max(0, itemTotals[item.id] || 0);
      if (Number(item.current_quantity) !== totalQty) {
        await supabase
          .from('inventory_items')
          .update({ current_quantity: totalQty })
          .eq('id', item.id);
      }
    }

    return { success: true, count: transactions?.length || 0 };
  } catch (err: any) {
    console.error('Error in syncAllWarehouseBalances:', err);
    throw err;
  }
}

/**
 * 🟢 اعتماد حركة مخزنية واحدة وتحديث أرصدة المستودع المعني ومستودع الوجهة وتوليد القيود المحاسبية فوراً
 */
export async function executeApproveTransaction(transactionId: string, options?: { skipSync?: boolean }) {
  // 1. جلب بيانات الحركة الأساسية أولاً بأمان لتفادي أي تعارض في العلاقات (PGRST201 Foreign Key Ambiguity)
  const { data: txn, error: getErr } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (getErr || !txn) throw new Error(getErr?.message || 'الحركة غير موجودة');

  // جلب البيانات المرتبطة بأمان تام بدون المخاطرة بفشل الاستعلام الرئيسي
  let itemName = 'صنف';
  if (txn.item_id) {
    try {
      const { data: itm } = await supabase.from('inventory_items').select('name').eq('id', txn.item_id).maybeSingle();
      if (itm?.name) itemName = itm.name;
    } catch {}
  }

  let partnerAccountId: string | null = null;
  if (txn.partner_id) {
    try {
      const { data: p } = await supabase.from('partners').select('name, account_id').eq('id', txn.partner_id).maybeSingle();
      if (p?.account_id) partnerAccountId = p.account_id;
    } catch {}
  }

  let fleetOpNumber = '';
  let fleetDriverId = '';
  let fleetVehicleId = '';
  if (txn.fleet_operation_id) {
    try {
      const { data: fo } = await supabase.from('fleet_operations').select('operation_number, driver_id, vehicle_id').eq('id', txn.fleet_operation_id).maybeSingle();
      if (fo) {
        fleetOpNumber = fo.operation_number || '';
        fleetDriverId = fo.driver_id || '';
        fleetVehicleId = fo.vehicle_id || '';
      }
    } catch {}
  }

  const qty = Number(txn.quantity) || 0;
  const unitPrice = Number(txn.unit_price) || 0;
  const totalAmount = qty * unitPrice;
  const srcWh = txn.warehouse_id || MAIN_WAREHOUSE_ID;
  let destWh = txn.destination_warehouse_id;

  // إذا كانت الحركة مربوطة بأمر تشغيل رحلة ولم يُحدد مستودع وجهة، نحدد مستودع السيارة تلقائياً
  if (!destWh && fleetVehicleId) {
    try {
      const { data: vWh } = await supabase
        .from('warehouses')
        .select('id')
        .eq('vehicle_id', fleetVehicleId)
        .eq('is_active', true)
        .maybeSingle();
      if (vWh) destWh = vWh.id;
    } catch {}
  }

  // 2. توليد القيد المحاسبي المزدوج لحركة المخزون (إن لم يكن موجوداً)
  let journalId = txn.journal_id;
  if (!journalId && totalAmount > 0) {
    const date = txn.transaction_date || new Date().toISOString().split('T')[0];

    let headerDesc = '';
    let debitAcc = '';
    let creditAcc = '';
    let debitNotes = '';
    let creditNotes = '';
    let partnerIdForLine: string | null = null;

    if (txn.type === 'in' || txn.type === 'transfer_in') {
      // توريد مخزني / شراء: من حـ/ 126 مخزون البضائع (مدين) إلى حـ/ 219 فواتير قيد الاستلام أو المورد (دائن)
      headerDesc = `توريد مخزني #${txn.transaction_number || ''} - صنف: ${itemName} (كمية: ${qty})`;
      debitAcc = ACC.INVENTORY;
      creditAcc = partnerAccountId || ACC.PENDING_INVOICES;
      debitNotes = 'إضافة لمخزون البضائع (مدين)';
      creditNotes = 'استحقاق قيد الاستلام / مورد (دائن)';
      partnerIdForLine = txn.partner_id || null;
    } else if (txn.type === 'waste') {
      // إتلاف مخزني: من حـ/ 528 خسائر توالف (مدين) إلى حـ/ 126 مخزون البضائع (دائن)
      headerDesc = `إتلاف وهدر مخزني #${txn.transaction_number || ''} - صنف: ${itemName}`;
      debitAcc = ACC.WASTE_LOSS;
      creditAcc = ACC.INVENTORY;
      debitNotes = 'خسائر توالف وهدر مخزني (مدين)';
      creditNotes = 'تخفيض مخزون البضائع (دائن)';
    } else if (txn.fleet_operation_id) {
      // تحميل عهدة أسطول ومندوب
      headerDesc = `تحميل عهدة أسطول #${fleetOpNumber || ''} - صنف: ${itemName} (كمية: ${qty})`;
      debitAcc = ACC.INVENTORY_CUSTODY;
      creditAcc = ACC.INVENTORY;
      debitNotes = 'تحميل عهدة سيارة/مندوب (مدين)';
      creditNotes = 'صرف من المستودع للعهدة (دائن)';
      partnerIdForLine = fleetDriverId || txn.partner_id || null;
    } else {
      // صرف مخزني عادي
      headerDesc = `صرف مخزني #${txn.transaction_number || ''} - صنف: ${itemName} (كمية: ${qty})`;
      debitAcc = partnerAccountId || ACC.CUSTOMERS_AR;
      creditAcc = ACC.INVENTORY;
      debitNotes = 'استحقاق مدين (ذمة)';
      creditNotes = 'صرف من مخزون البضائع (دائن)';
      partnerIdForLine = txn.partner_id || null;
    }

    try {
      const { data: jHeader, error: jhErr } = await supabase
        .from('journal_headers')
        .insert([{
          entry_date: date,
          description: headerDesc,
          status: 'posted',
          v_type: 'inventory',
          reference_id: transactionId
        }])
        .select('id')
        .single();

      if (!jhErr && jHeader) {
        journalId = jHeader.id;
        await supabase.from('journal_lines').insert([
          {
            header_id: journalId,
            account_id: debitAcc,
            partner_id: (txn.type === 'in' ? null : partnerIdForLine),
            debit: totalAmount,
            credit: 0,
            notes: debitNotes
          },
          {
            header_id: journalId,
            account_id: creditAcc,
            partner_id: (txn.type === 'in' ? partnerIdForLine : null),
            debit: 0,
            credit: totalAmount,
            notes: creditNotes
          }
        ]);
      }
    } catch (jErr) {
      console.warn('Could not create journal entry for inventory txn:', jErr);
    }
  }

  // 3. تحديث الحالة ومستودع الوجهة ورقم القيد
  await supabase
    .from('inventory_transactions')
    .update({
      status: 'approved',
      journal_id: journalId || null,
      warehouse_id: srcWh,
      destination_warehouse_id: destWh || null
    })
    .eq('id', transactionId);

  // تحديث سعر التكلفة للصنف تلقائياً عند اعتماد حركة توريد أو شراء
  if ((txn.type === 'in' || txn.type === 'purchase') && unitPrice > 0 && txn.item_id) {
    try {
      await supabase
        .from('inventory_items')
        .update({ cost_price: unitPrice })
        .eq('id', txn.item_id);
      emitTableChange('inventory_items');
    } catch (costErr) {
      console.warn('Could not auto-sync cost_price:', costErr);
    }
  }

  // 4. استدعاء دالة قاعدة البيانات كإجراء إضافي
  try {
    await supabase.rpc('approve_inventory_transaction', { p_id: transactionId });
  } catch (rpcErr) {
    console.warn('RPC approve warning (handled):', rpcErr);
  }

  if (!options?.skipSync) {
    // 5. 🚀 إعادة مزامنة وتحديث أرصدة كافة المستودعات وسيارات التوزيع فوراً
    await syncAllWarehouseBalances();

    // 6. بث التحديث اللحظي لجميع الشاشات
    emitTableChange('inventory_transactions');
    emitTableChange('journal_headers');
    emitTableChange('journal_lines');
  }

  return { success: true };
}

/**
 * ⏪ فك اعتماد حركة مخزنية وعكس تأثيرها على المستودعات والقيود
 */
export async function executeUnapproveTransaction(transactionId: string) {
  const { data: txn, error: getErr } = await supabase
    .from('inventory_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (getErr || !txn) throw new Error(getErr?.message || 'الحركة غير موجودة');

  // 1. حذف القيد المحاسبي المرتبط إن وجد
  if (txn.journal_id) {
    try {
      await supabase.from('journal_lines').delete().eq('header_id', txn.journal_id);
      await supabase.from('journal_headers').delete().eq('id', txn.journal_id);
    } catch (jErr) {
      console.warn('Could not delete journal entry:', jErr);
    }
  }

  // 2. استدعاء دالة فك الاعتماد في قاعدة البيانات
  try {
    await supabase.rpc('unapprove_inventory_transaction', { p_id: transactionId });
  } catch (rpcErr) {
    console.warn('RPC unapprove warning (handled):', rpcErr);
  }

  // 3. تحديث حالة الحركة إلى مسودة مع حذف مرجع القيد
  await supabase
    .from('inventory_transactions')
    .update({ status: 'pending', journal_id: null })
    .eq('id', transactionId);

  // 4. 🚀 إعادة مزامنة وتحديث أرصدة كافة المستودعات وسيارات التوزيع فوراً
  await syncAllWarehouseBalances();

  // 5. بث التحديث اللحظي
  emitTableChange('inventory_transactions');
  emitTableChange('journal_headers');
  emitTableChange('journal_lines');

  return { success: true };
}

// ============================================================================
// ⏳ محرك تخصيص التشغيلات والصلاحيات بنظام FEFO (First-Expire, First-Out)
// يتوافق مع المعايير الدوائية الصارمة لهيئة الغذاء والدواء السعودية (SFDA)
// ============================================================================

export interface ItemBatchInfo {
  batch_number: string;
  expiry_date: string | null;
  production_date?: string | null;
  available_qty: number;
  days_left: number | null;
  isExpired: boolean;
  isNearExpiry: boolean;
  alert_before_days: number;
  status: 'expired' | 'critical' | 'warning' | 'safe' | 'no_date';
}

export interface FEFOAllocationItem {
  batch_number: string;
  expiry_date: string | null;
  production_date?: string | null;
  quantity: number;
  days_left: number | null;
  isNearExpiry: boolean;
  isExpired: boolean;
}

export interface FEFOAllocationResult {
  allocations: FEFOAllocationItem[];
  fulfilledQty: number;
  remainingQty: number;
  primaryBatch: FEFOAllocationItem | null;
  hasNearExpiry: boolean;
  hasExpired: boolean;
  minDaysLeft: number | null;
}

/**
 * 🧮 حساب وتصنيف تشغيلات الصنف بنظام FEFO في الذاكرة
 */
export function calculateItemBatchesFEFO(
  transactions: any[],
  itemMeta?: { expiry_date?: string | null; batch_number?: string | null; production_date?: string | null; alert_before_days?: number },
  targetWarehouseId?: string,
  fallbackQty = 0
): ItemBatchInfo[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alertDays = Number(itemMeta?.alert_before_days || 60);

  // batchMap: { [batchNumber]: { batch_number, expiry_date, production_date, in_qty, out_qty } }
  const batchMap: Record<string, {
    batch_number: string;
    expiry_date: string | null;
    production_date?: string | null;
    in_qty: number;
    out_qty: number;
  }> = {};

  (transactions || []).forEach(tx => {
    const qty = Number(tx.quantity) || 0;
    if (qty <= 0) return;

    const rawBatch = (tx.batch_number || '').trim();
    const batchKey = rawBatch || (itemMeta?.batch_number ? String(itemMeta.batch_number).trim() : 'DEFAULT');
    const expiry = tx.expiry_date || itemMeta?.expiry_date || null;
    const prod = tx.production_date || itemMeta?.production_date || null;

    if (!batchMap[batchKey]) {
      batchMap[batchKey] = {
        batch_number: batchKey,
        expiry_date: expiry,
        production_date: prod,
        in_qty: 0,
        out_qty: 0
      };
    } else {
      if (!batchMap[batchKey].expiry_date && expiry) {
        batchMap[batchKey].expiry_date = expiry;
      }
      if (!batchMap[batchKey].production_date && prod) {
        batchMap[batchKey].production_date = prod;
      }
    }

    const srcWh = tx.warehouse_id || MAIN_WAREHOUSE_ID;
    const destWh = tx.destination_warehouse_id;

    const isMatchSrc = !targetWarehouseId || targetWarehouseId === 'all' || srcWh === targetWarehouseId;
    const isMatchDest = targetWarehouseId && targetWarehouseId !== 'all' && destWh === targetWarehouseId;

    if (['in', 'transfer_in', 'empty_return'].includes(tx.type)) {
      if (isMatchSrc) {
        batchMap[batchKey].in_qty += qty;
      }
    } else if (['out', 'transfer_out'].includes(tx.type)) {
      if (isMatchSrc) {
        batchMap[batchKey].out_qty += qty;
      }
      if (isMatchDest) {
        // انتقال إلى المستودع المستهدف
        batchMap[batchKey].in_qty += qty;
      }
    } else if (['sales_deduction', 'waste'].includes(tx.type)) {
      if (isMatchSrc) {
        batchMap[batchKey].out_qty += qty;
      }
    }
  });

  const result: ItemBatchInfo[] = [];

  for (const bKey of Object.keys(batchMap)) {
    const b = batchMap[bKey];
    const netQty = Math.max(0, b.in_qty - b.out_qty);
    if (netQty <= 0) continue;

    let daysLeft: number | null = null;
    let isExpired = false;
    let isNearExpiry = false;
    let status: ItemBatchInfo['status'] = 'no_date';

    if (b.expiry_date) {
      const expDate = new Date(b.expiry_date);
      expDate.setHours(0, 0, 0, 0);
      const diff = expDate.getTime() - today.getTime();
      daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        isExpired = true;
        status = 'expired';
      } else if (daysLeft <= alertDays) {
        isNearExpiry = true;
        status = 'critical';
      } else if (daysLeft <= 90) {
        status = 'warning';
      } else {
        status = 'safe';
      }
    }

    result.push({
      batch_number: b.batch_number,
      expiry_date: b.expiry_date,
      production_date: b.production_date,
      available_qty: netQty,
      days_left: daysLeft,
      isExpired,
      isNearExpiry,
      alert_before_days: alertDays,
      status
    });
  }

  // إذا لم نجد أي تشغيلات مسجلة بالحركات ولكن يوجد رصيد فعلي للصنف، ننشئ تشغيلة افتراضية
  if (result.length === 0 && fallbackQty > 0) {
    const fallbackExp = itemMeta?.expiry_date || null;
    let daysLeft: number | null = null;
    let isExpired = false;
    let isNearExpiry = false;
    let status: ItemBatchInfo['status'] = 'no_date';

    if (fallbackExp) {
      const expDate = new Date(fallbackExp);
      expDate.setHours(0, 0, 0, 0);
      const diff = expDate.getTime() - today.getTime();
      daysLeft = Math.ceil(diff / (1000 * 60 * 60 * 24));

      if (daysLeft <= 0) {
        isExpired = true;
        status = 'expired';
      } else if (daysLeft <= alertDays) {
        isNearExpiry = true;
        status = 'critical';
      } else if (daysLeft <= 90) {
        status = 'warning';
      } else {
        status = 'safe';
      }
    }

    result.push({
      batch_number: itemMeta?.batch_number || 'DEFAULT',
      expiry_date: fallbackExp,
      production_date: itemMeta?.production_date || null,
      available_qty: fallbackQty,
      days_left: daysLeft,
      isExpired,
      isNearExpiry,
      alert_before_days: alertDays,
      status
    });
  }

  // 🎯 ترتيب FEFO الصارم: الأقرب انتهاءً أولاً (First-Expire, First-Out)
  result.sort((a, b) => {
    // 1. الأصناف التي لها تاريخ صلاحية تأتي أولاً مرتبة تصاعدياً
    if (a.expiry_date && b.expiry_date) {
      return new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime();
    }
    if (a.expiry_date && !b.expiry_date) return -1;
    if (!a.expiry_date && b.expiry_date) return 1;
    // 2. إذا لم يكن لأي منهما تاريخ، ترتيب حسب رقم التشغيلة
    return a.batch_number.localeCompare(b.batch_number);
  });

  return result;
}

/**
 * 📦 جلب تشغيلات صنف معين بنظام FEFO مع دعم الأوفلاين
 */
export async function getItemBatchesFEFO(
  itemId: string,
  warehouseId?: string,
  fallbackQty = 0,
  fallbackMeta?: { expiry_date?: string | null; batch_number?: string | null; alert_before_days?: number }
): Promise<ItemBatchInfo[]> {
  try {
    const { data: txns, error } = await supabase
      .from('inventory_transactions')
      .select('type, quantity, batch_number, expiry_date, production_date, warehouse_id, destination_warehouse_id, status')
      .eq('item_id', itemId)
      .eq('status', 'approved');

    if (error) throw error;

    return calculateItemBatchesFEFO(txns || [], fallbackMeta, warehouseId, fallbackQty);
  } catch (err) {
    console.warn(`[FEFO Engine] تعذر جلب حركات التشغيلات للصنف ${itemId} سحابياً، سيتم استخدام البيانات المحلية:`, err);
    return calculateItemBatchesFEFO([], fallbackMeta, warehouseId, fallbackQty);
  }
}

/**
 * 🎯 تخصيص الكمية المطلوبة للبيع آلياً من التشغيلات بنظام FEFO
 * يسحب آلياً من التشغيلة الأقرب انتهاءً، مع منع سحب المنتهي الصلاحية للمستهلكين
 */
export function allocateItemQtyFEFO(
  batches: ItemBatchInfo[],
  requestedQty: number,
  allowExpired = false
): FEFOAllocationResult {
  if (requestedQty <= 0) {
    return {
      allocations: [],
      fulfilledQty: 0,
      remainingQty: 0,
      primaryBatch: null,
      hasNearExpiry: false,
      hasExpired: false,
      minDaysLeft: null
    };
  }

  // استبعاد التشغيلات المنتهية للبيع إلا إذا سُمح بذلك صراحة
  const validBatches = allowExpired ? batches : batches.filter(b => !b.isExpired);
  const hasExpired = batches.some(b => b.isExpired);

  let remaining = requestedQty;
  let fulfilled = 0;
  const allocations: FEFOAllocationItem[] = [];
  let minDaysLeft: number | null = null;
  let hasNearExpiry = false;

  for (const batch of validBatches) {
    if (batch.available_qty <= 0) continue;

    const take = Math.min(batch.available_qty, remaining);
    if (take <= 0) continue;

    if (batch.days_left !== null) {
      if (minDaysLeft === null || batch.days_left < minDaysLeft) {
        minDaysLeft = batch.days_left;
      }
    }
    if (batch.isNearExpiry) {
      hasNearExpiry = true;
    }

    allocations.push({
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      production_date: batch.production_date,
      quantity: take,
      days_left: batch.days_left,
      isNearExpiry: batch.isNearExpiry,
      isExpired: batch.isExpired
    });

    remaining -= take;
    fulfilled += take;

    if (remaining <= 0) break;
  }

  const primaryBatch = allocations.length > 0 ? allocations[0] : null;

  return {
    allocations,
    fulfilledQty: fulfilled,
    remainingQty: remaining,
    primaryBatch,
    hasNearExpiry,
    hasExpired,
    minDaysLeft
  };
}
