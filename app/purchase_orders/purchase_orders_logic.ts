import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { showGlobalToast } from '@/lib/toast-context';
import { useRealtimeListener, emitTableChange } from '@/lib/useRealtimeSync';
import { executeApproveTransaction, executeUnapproveTransaction, syncAllWarehouseBalances } from '@/lib/inventory_engine';

import { useAuth } from '@/components/authGuard';

export function usePurchaseOrdersLogic() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<any>(null);
  const [printingTransaction, setPrintingTransaction] = useState<any>(null);

  const { profile, can } = useAuth();

  const fetchTransactions = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from('inventory_transactions')
        .select('id, transaction_number, transaction_date, type, quantity, unit_price, tax_amount, include_tax, notes, status, item_id, partner_id')
        .eq('type', 'in')
        .order('transaction_date', { ascending: false });

      if (profile) {
          const role = String(profile.role || '').toLowerCase();
          const isGlobalAdmin = role === 'admin' || role === 'super_admin' || role === 'manager' || profile.is_admin === true;
          if (!isGlobalAdmin && profile.linked_partner_id) {
              query = query.eq('partner_id', profile.linked_partner_id);
          }
      }

      const [txRes, itemsRes, partnersRes] = await Promise.all([
        query,
        supabase.from('inventory_items').select('id, name, unit'),
        supabase.from('partners').select('id, name')
      ]);

      if (txRes.error) throw txRes.error;

      const itemsMap = new Map((itemsRes.data || []).map((it: any) => [it.id, it]));
      const partnersMap = new Map((partnersRes.data || []).map((p: any) => [p.id, p]));

      const enrichedData = (txRes.data || []).map((curr: any) => ({
        ...curr,
        inventory_items: itemsMap.get(curr.item_id) || { name: 'صنف غير محدد', unit: '' },
        partners: partnersMap.get(curr.partner_id) || { name: 'مورد غير محدد' }
      }));
      
      const grouped = enrichedData.reduce((acc: any, curr: any) => {
          let baseNumber = curr.transaction_number;
          if (/-\d+$/.test(baseNumber)) {
              baseNumber = baseNumber.replace(/-\d+$/, '');
          }

          if (!acc[baseNumber]) {
              acc[baseNumber] = {
                  id: curr.id, // Primary ID for rendering or passing to other functions if needed
                  ids: [], // Array of all IDs in this transaction for mass approval/deletion
                  transaction_number: baseNumber,
                  transaction_date: curr.transaction_date,
                  partner_id: curr.partner_id,
                  partners: curr.partners,
                  status: curr.status,
                  items: [],
                  notes: curr.notes,
                  total_amount: 0,
                  tax_amount: 0,
                  quantity: 0
              };
          }
          acc[baseNumber].ids.push(curr.id);
          acc[baseNumber].items.push(curr);
          acc[baseNumber].tax_amount += (curr.tax_amount || 0);
          acc[baseNumber].total_amount += ((curr.quantity * curr.unit_price) + (curr.tax_amount || 0));
          acc[baseNumber].quantity += curr.quantity; // Just for display fallback if needed
          
          return acc;
      }, {});

      setTransactions(Object.values(grouped).sort((a:any, b:any) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()));
    } catch (error: any) {
      console.error('Error fetching purchase orders:', error);
      showGlobalToast('حدث خطأ أثناء جلب أوامر الشراء', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
  }, [profile?.id]);

  // 🔄 مزامنة فورية - تحديث تلقائي عند تغيير الحركات (من أي شاشة)
  useRealtimeListener('inventory_transactions', () => fetchTransactions());

  const handleApproveTransaction = async (transaction: any) => {
    // ⚡ تحديث تفاؤلي فوري في الواجهة
    setTransactions(prev => prev.map(t => t.id === transaction.id ? { ...t, status: 'approved' } : t));

    try {
      setIsLoading(true);
      for (const id of transaction.ids) {
        await executeApproveTransaction(id, { skipSync: true });
      }

      await syncAllWarehouseBalances();
      emitTableChange('inventory_transactions');
      emitTableChange('journal_headers');
      emitTableChange('journal_lines');

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }

      showGlobalToast('تم اعتماد أمر الشراء واستلامه بالمستودع بنجاح ✅', 'success');
      await fetchTransactions();
    } catch (error: any) {
      console.error('Error approving PO:', error);
      showGlobalToast('حدث خطأ في الاعتماد: ' + error.message, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnapproveTransaction = async (transaction: any) => {
    // ⚡ تحديث تفاؤلي فوري
    setTransactions(prev => prev.map(t => t.id === transaction.id ? { ...t, status: 'pending' } : t));

    try {
      setIsLoading(true);
      for (const id of transaction.ids) {
        await executeUnapproveTransaction(id);
      }

      // Clean up entitlement vouchers if any from expenses
      await supabase.from('expenses').delete().eq('expense_number', `PO-${transaction.transaction_number}`);

      emitTableChange('inventory_transactions');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('pending_counts_refresh'));
        window.dispatchEvent(new CustomEvent('unread_counts_refresh'));
      }

      showGlobalToast('تم إلغاء الاستلام بنجاح', 'success');
      await fetchTransactions();
    } catch (error: any) {
      console.error('Error unapproving PO:', error);
      showGlobalToast('حدث خطأ في إلغاء الاعتماد: ' + error.message, 'error');
      await fetchTransactions();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateEntitlement = async (transaction: any) => {
    try {
      setIsLoading(true);

      // Check if entitlement already exists in expenses
      // transaction_number may already start with "PO-", so avoid duplication
      const rawNum = transaction.transaction_number?.replace(/^PO-/, '') || transaction.transaction_number;
      const expNo = `PO-${rawNum}`;
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('expense_number', expNo);
        
      if (existing && existing.length > 0) {
        return showGlobalToast('تم إنشاء سند استحقاق مسبقاً لهذا الأمر في المصروفات!', 'warning');
      }

      const subTotal = transaction.total_amount - (transaction.tax_amount || 0);
      const taxAmount = transaction.tax_amount || 0;
      const desc = `فاتورة مشتريات مجمعة لأمر الشراء #${rawNum}`;

      // Create Expense Record
      const expensePayload = {
        exp_date: new Date().toISOString().split('T')[0],
        description: desc,
        creditor_account: '219 - فواتير قيد الاستلام', // (دائن)
        payment_method: 'آجل',
        payment_account: '211 - الموردين', // (مدين)
        payee_id: transaction.partner_id || null,
        payee_name: transaction.partners?.name || null,
        quantity: 1,
        unit_price: subTotal,
        vat_amount: taxAmount,
        discount_amount: 0,
        paid_amount: 0,
        notes: 'تم التوليد آلياً من أمر الشراء',
        is_posted: false,
        expense_number: expNo,
        main_category: 'شراء بضاعة'
      };

      const { error: expErr } = await supabase.from('expenses').insert([expensePayload]);
      if (expErr) throw expErr;

      // 🚀 Invalidate the expenses cache immediately so it's fresh when navigating
      import('@tanstack/react-query').then(({ QueryClient }) => {
          const client = typeof window !== 'undefined' ? (window as any).__REACT_QUERY_CLIENT__ : null;
          if (client) {
              client.invalidateQueries({ queryKey: ['expenses'] });
          }
      });

      showGlobalToast('تم إنشاء سند الاستحقاق بنجاح', 'success');
    } catch (error: any) {
      console.error('Error creating entitlement in expenses:', error);
      showGlobalToast('حدث خطأ أثناء إنشاء السند: ' + error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };


  const filteredTransactions = transactions.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.transaction_number?.toLowerCase().includes(q) ||
      t.partners?.name?.toLowerCase().includes(q) ||
      t.inventory_items?.name?.toLowerCase().includes(q)
    );
  });

  return {
    transactions: filteredTransactions,
    isLoading,
    searchQuery, setSearchQuery,
    isActionModalOpen, setIsActionModalOpen,
    editingTransaction, setEditingTransaction,
    printingTransaction, setPrintingTransaction,
    fetchTransactions,
    handleApproveTransaction,
    handleUnapproveTransaction,
    handleCreateEntitlement
  };
}