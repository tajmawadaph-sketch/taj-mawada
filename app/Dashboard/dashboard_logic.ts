import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/helpers';

// 🚀 دالة البلدوزر السريعة لسحب البيانات الضخمة
const fetchAllForDashboard = async (
  tableName: string, 
  columns: string, 
  filters?: { col: string, val: any, op?: 'eq' | 'neq' }[]
) => {
  let allData: any[] = [];
  let currentOffset = 0;
  const limit = 1000;
  while (true) {
    let query = supabase.from(tableName).select(columns).range(currentOffset, currentOffset + limit - 1);
    if (filters) {
      filters.forEach(f => {
        if (f.op === 'neq') query = query.neq(f.col, f.val);
        else query = query.eq(f.col, f.val);
      });
    }
    const { data, error } = await query;
    if (error) break;
    if (data && data.length > 0) {
      allData = [...allData, ...data];
      if (data.length < limit) break;
      currentOffset += limit;
    } else break;
  }
  return allData;
};

export const useDashboardLogic = () => {
  const query = useQuery({
    queryKey: ['dashboard_stats_comprehensive'],
    queryFn: async () => {
      // 1. 📡 سحب كل البيانات الأساسية
      const [
        expenses, invoices, payments, receipts,
        journalLines, accounts, fleetOps,
        warehouses, warehouseInventory, inventoryItems,
        fleetVehicles
      ] = await Promise.all([
        fetchAllForDashboard('expenses', 'id, total_price, unit_price, quantity, vat_amount, discount_amount, paid_amount, is_posted, main_category'),
        fetchAllForDashboard('invoices', 'total_amount, status, created_at, customer_id, invoice_type'),
        fetchAllForDashboard('payment_vouchers', 'amount, is_posted, status'),
        fetchAllForDashboard('receipt_vouchers', 'amount, status'),
        fetchAllForDashboard('journal_lines', 'debit, credit, account_id'),
        fetchAllForDashboard('accounts', 'id, account_type, code, name'),
        fetchAllForDashboard('fleet_operations', 'status, id, vehicle_id, driver_id'),
        fetchAllForDashboard('warehouses', 'id, name'),
        fetchAllForDashboard('warehouse_inventory', 'warehouse_id, item_id, quantity'),
        fetchAllForDashboard('inventory_items', 'id, default_price, expiry_date, alert_before_days'),
        fetchAllForDashboard('fleet_vehicles', 'id, status, plate_number')
      ]);

      // --- 🏗️ تحليل حالات رحلات التوزيع والأسطول ---
      const activeTripsCount = fleetOps.filter(f => f.status === 'نشط' || f.status === 'قيد التنفيذ').length;
      const completedTripsCount = fleetOps.filter(f => f.status === 'مكتمل').length;
      const cancelledTripsCount = fleetOps.filter(f => f.status === 'ملغى').length;
      
      const projectsStatusData = [
        { name: 'رحلات نشطة', value: activeTripsCount },
        { name: 'رحلات مكتملة', value: completedTripsCount },
        { name: 'رحلات ملغاة', value: cancelledTripsCount }
      ].filter(p => p.value > 0);

      // --- 🏛️ حساب المركز المالي ورصيد النقدية والعملاء من القيود ---
      let totalAssets = 0;
      let totalLiabilities = 0;
      let cashAndBankBalance = 0;
      let totalReceivables = 0;
      let cogsAmount = 0;

      const accountTypesMap: Record<string, string> = {};
      const cashAccountIds = new Set(
        accounts
          .filter(a => 
            (a.code && (a.code.startsWith('122') || a.code.startsWith('129') || a.code.startsWith('121') || a.code.startsWith('1111') || a.code.startsWith('1112'))) ||
            (a.name && (a.name.includes('نقد') || a.name.includes('خزين') || a.name.includes('صندوق') || a.name.includes('بنك') || a.name.includes('الراجحي') || a.name.includes('الرياض')))
          )
          .map(a => a.id)
      );

      const arAccountIds = new Set(
        accounts
          .filter(a => 
            (a.code && (a.code.startsWith('123') || a.code.startsWith('1121'))) ||
            (a.name && (a.name.includes('العملاء') || a.name.includes('مدينون') || a.name.includes('ذمم')))
          )
          .map(a => a.id)
      );

      const cogsAccountIds = new Set(
        accounts
          .filter(a => 
            (a.code && a.code.startsWith('51')) ||
            (a.name && (a.name.includes('تكلفة المبيعات') || a.name.includes('تكلفة البضاعة') || a.name.includes('تكلفة الدواء')))
          )
          .map(a => a.id)
      );

      accounts.forEach(acc => { accountTypesMap[acc.id] = acc.account_type || ''; });

      journalLines.forEach(line => {
        const type = accountTypesMap[line.account_id] || '';
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        
        if (type.includes('أصول') || type.includes('Asset') || type.includes('مدين')) {
          totalAssets += (debit - credit);
        } else if (type.includes('خصوم') || type.includes('التزام') || type.includes('Liability') || type.includes('دائن')) {
          totalLiabilities += (credit - debit);
        }

        if (cashAccountIds.has(line.account_id)) {
          cashAndBankBalance += (debit - credit);
        }

        if (arAccountIds.has(line.account_id)) {
          totalReceivables += (debit - credit);
        }

        if (cogsAccountIds.has(line.account_id)) {
          cogsAmount += (debit - credit);
        }
      });

      // --- 💰 حساب المبالغ بدقة وحساب المصروفات والمبيعات ---
      const getExpenseAmount = (item: any) => {
        return Number(item.total_price) || 
          ((Number(item.quantity || 1) * Number(item.unit_price || 0)) + Number(item.vat_amount || 0) - Number(item.discount_amount || 0)) || 
          Number(item.paid_amount || 0);
      };

      const validStatuses = ['معتمد', 'posted', 'مرحل', 'مدفوع', 'مغلق', 'approved'];
      const totalExpenses = expenses.reduce((sum, item) => sum + getExpenseAmount(item), 0);
      const totalInvoices = invoices.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
      const approvedExpenses = expenses.filter(e => e.is_posted === true).reduce((sum, item) => sum + getExpenseAmount(item), 0);
      const approvedInvoices = invoices.filter(i => validStatuses.includes(i.status)).reduce((sum, item) => sum + Number(item.total_amount || 0), 0);

      // تقدير تكلفة المبيعات إن لم تكن مسجلة بقيود مباشرة
      if (cogsAmount <= 0 && approvedInvoices > 0) {
        cogsAmount = approvedInvoices * 0.72; // معدل تكلفة صيدليات بيطرية افتراضي 72%
      }

      const grossProfit = Math.max(0, approvedInvoices - cogsAmount);
      const netProfit = approvedInvoices - (cogsAmount + approvedExpenses);
      const netProfitMargin = approvedInvoices > 0 ? (netProfit / approvedInvoices) * 100 : 0;
      const grossMargin = approvedInvoices > 0 ? (grossProfit / approvedInvoices) * 100 : 0;

      // تكاليف تشغيل الأسطول من المصروفات
      const fleetExpenses = expenses
        .filter(e => {
          const cat = String(e.main_category || '').toLowerCase();
          return cat.includes('أسطول') || cat.includes('سيار') || cat.includes('مركب') || cat.includes('وقود') || cat.includes('سائق') || cat.includes('شحن');
        })
        .reduce((sum, e) => sum + getExpenseAmount(e), 0);

      // --- 📦 تقييم المخزون وأرصدة المستودعات ---
      const itemPrices: Record<string, number> = {};
      inventoryItems.forEach(item => { itemPrices[item.id] = Number(item.default_price || 0); });

      const warehouseBalances: Record<string, { name: string, qty: number, value: number }> = {};
      warehouses.forEach(wh => { warehouseBalances[wh.id] = { name: wh.name, qty: 0, value: 0 }; });

      let totalInventoryValue = 0;
      warehouseInventory.forEach(inv => {
        if (warehouseBalances[inv.warehouse_id]) {
          const qty = Number(inv.quantity || 0);
          const price = itemPrices[inv.item_id] || 0;
          const value = qty * price;
          warehouseBalances[inv.warehouse_id].qty += qty;
          warehouseBalances[inv.warehouse_id].value += value;
          totalInventoryValue += value;
        }
      });

      const warehouseChartData = Object.values(warehouseBalances)
        .sort((a, b) => b.qty - a.qty);

      // --- 🧮 إحصائيات الترحيل الشاملة والمهام المعلقة ---
      const unpostedExpenses = expenses.filter(e => e.is_posted !== true).length;
      const unpostedInvoices = invoices.filter(i => !validStatuses.includes(i.status)).length;
      const unpostedPayments = payments.filter(p => p.is_posted !== true).length;
      const unpostedReceipts = receipts.filter(r => !validStatuses.includes(r.status)).length;

      const pendingActions = [
        { type: 'expenses', count: unpostedExpenses, label: 'مصروفات غير مرحلة' },
        { type: 'invoices', count: unpostedInvoices, label: 'فواتير غير معتمدة' },
        { type: 'payments', count: unpostedPayments, label: 'سندات صرف معلقة' },
        { type: 'receipts', count: unpostedReceipts, label: 'سندات قبض بانتظار الاعتماد' }
      ].filter(a => a.count > 0);

      // --- ⏳ مراقبة الصلاحيات والإنذارات ---
      let expiredItemsCount = 0;
      let criticalExpiryCount = 0;
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        inventoryItems.forEach((it: any) => {
          if (it.expiry_date) {
            const exp = new Date(it.expiry_date);
            exp.setHours(0, 0, 0, 0);
            const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const alertDays = Number(it.alert_before_days || 30);
            if (diff <= 0) expiredItemsCount++;
            else if (diff <= alertDays) criticalExpiryCount++;
          }
        });
      } catch (e) {
        console.warn('Dashboard expiry check fallback:', e);
      }

      // --- 🍩 تجميع المصروفات للرسم البياني ---
      const categoryMap: Record<string, number> = {};
      expenses.forEach(exp => {
        const cat = exp.main_category || 'مصروفات تشغيلية عامة';
        categoryMap[cat] = (categoryMap[cat] || 0) + getExpenseAmount(exp);
      });

      const expensesByCategory = Object.entries(categoryMap)
        .map(([name, value]) => ({ name, value }))
        .filter(item => item.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);

      return {
        // 📊 مؤشرات الربحية الأساسية (صيدلية وأسطول)
        totalRevenues: approvedInvoices,
        cogsAmount,
        grossProfit,
        grossMargin: grossMargin.toFixed(1),
        totalExpenses: approvedExpenses,
        netProfit,
        netProfitMargin: netProfitMargin.toFixed(1),
        
        // السيولة ورأس المال والديون
        cashAndBankBalance,
        totalReceivables,
        totalInventoryValue,
        
        // الأسطول والعمليات
        totalWarehouses: warehouses.length,
        totalVehicles: fleetVehicles.length,
        totalFleetTrips: fleetOps.length,
        activeTripsCount,
        completedTripsCount,
        fleetExpenses,
        
        // رسوم بيانية
        cashFlowData: [
          { name: 'المبيعات', income: approvedInvoices, expense: 0 },
          { name: 'تكلفة البضاعة', income: 0, expense: cogsAmount },
          { name: 'المصروفات', income: 0, expense: approvedExpenses }
        ],
        expensesByCategory,
        projectsStatusData,
        warehouseChartData,

        // المهام والصلاحية
        pendingActions,
        expiredItemsCount,
        criticalExpiryCount,

        totals: {
          totalExpenses,
          totalInvoices,
          approvedExpenses,
          approvedInvoices,
          netProfit,
          totalInventoryValue,
          totalAssets,
          totalLiabilities
        }
      };
    },
    staleTime: 1000 * 60 * 5,
  });

  return {
    stats: query.data,
    isLoading: query.isLoading,
    error: query.error,
    formatCurrency
  };
};
