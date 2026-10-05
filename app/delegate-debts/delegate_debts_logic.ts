import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/authGuard';
import * as XLSX from 'xlsx';

export interface DelegateInvoice {
  id: string;
  invoice_number: string;
  date: string;
  client_name: string;
  total_amount: number;
  paid_amount: number;
  remaining_amount: number;
  due_date: string;
  status: string;
  days_overdue: number;
  aging_bucket: 'current' | '30_to_60' | 'over_60';
}

export interface DelegateDebtSummary {
  delegate_id: string;
  delegate_name: string;
  total_debt: number;
  total_original: number;
  total_paid: number;
  collection_rate: number;
  invoice_count: number;
  invoices: DelegateInvoice[];
}

export function useDelegateDebtsLogic() {
  const [isLoading, setIsLoading] = useState(false);
  const [delegatesData, setDelegatesData] = useState<DelegateDebtSummary[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAgingFilter, setSelectedAgingFilter] = useState<'all' | 'current' | '30_to_60' | 'over_60'>('all');

  const { profile } = useAuth();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      let q = supabase
        .from('invoices')
        .select('id, invoice_number, date, client_name, total_amount, paid_amount, due_date, status, delegate_id')
        .not('status', 'eq', 'مدفوعة')
        .not('delegate_id', 'is', null);

      if (profile) {
        const role = String(profile.role || '').toLowerCase();
        const isGlobalAdmin = role === 'admin' || role === 'super_admin' || role === 'manager' || profile.is_admin === true;
        if (!isGlobalAdmin && profile.linked_partner_id) {
          q = q.eq('delegate_id', profile.linked_partner_id);
        }
      }

      const { data: invoices, error: invError } = await q;

      if (invError) throw invError;

      // 2. Fetch partners (delegates) to map names
      const delIds = Array.from(new Set((invoices || []).map(i => i.delegate_id).filter(Boolean)));
      let partnersQuery = supabase.from('partners').select('id, name, phone');
      if (delIds.length > 0) {
        partnersQuery = partnersQuery.or(`id.in.(${delIds.join(',')}),job_role.eq.مندوب,partner_type.eq.delegate,partner_type.eq.مندوب`);
      } else {
        partnersQuery = partnersQuery.or('job_role.eq.مندوب,partner_type.eq.delegate,partner_type.eq.مندوب');
      }
      const { data: partners, error: partError } = await partnersQuery;

      if (partError) throw partError;

      const partnerMap = new Map<string, string>();
      partners.forEach(p => partnerMap.set(p.id, p.name));

      // 3. Group by delegate
      const grouped = new Map<string, DelegateDebtSummary>();
      const now = new Date().getTime();

      for (const inv of invoices || []) {
        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const remaining = total - paid;

        // Skip if mathematically paid
        if (remaining <= 0.01) continue;

        const delId = inv.delegate_id;
        if (!grouped.has(delId)) {
          grouped.set(delId, {
            delegate_id: delId,
            delegate_name: partnerMap.get(delId) || 'مندوب غير معروف',
            total_debt: 0,
            total_original: 0,
            total_paid: 0,
            collection_rate: 0,
            invoice_count: 0,
            invoices: []
          });
        }

        const summary = grouped.get(delId)!;
        summary.total_debt += remaining;
        summary.total_original += total;
        summary.total_paid += paid;
        summary.invoice_count += 1;

        // Calculate days overdue
        const invDate = inv.date ? new Date(inv.date).getTime() : now;
        const daysOld = Math.max(0, Math.floor((now - invDate) / (1000 * 3600 * 24)));
        let aging: 'current' | '30_to_60' | 'over_60' = 'current';
        if (daysOld > 60) aging = 'over_60';
        else if (daysOld > 30) aging = '30_to_60';

        summary.invoices.push({
          id: inv.id,
          invoice_number: inv.invoice_number,
          date: inv.date,
          client_name: inv.client_name || 'عميل نقدي',
          total_amount: total,
          paid_amount: paid,
          remaining_amount: remaining,
          due_date: inv.due_date,
          status: inv.status,
          days_overdue: daysOld,
          aging_bucket: aging
        });
      }

      // Sort invoices within delegates by date and calculate collection rate
      for (const summary of grouped.values()) {
        summary.invoices.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        summary.collection_rate = summary.total_original > 0
          ? Math.round((summary.total_paid / summary.total_original) * 1000) / 10
          : 0;
      }

      // Convert to array and sort by total debt descending
      const resultArray = Array.from(grouped.values()).sort((a, b) => b.total_debt - a.total_debt);

      setDelegatesData(resultArray);
    } catch (error) {
      console.error('Error fetching delegate debts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered Delegates based on search & aging
  const filteredDelegates = useMemo(() => {
    return delegatesData
      .map(del => {
        // Filter invoices by search and aging
        const matchesDelName = del.delegate_name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchingInvoices = del.invoices.filter(inv => {
          const matchSearch = matchesDelName ||
            inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            inv.client_name.toLowerCase().includes(searchTerm.toLowerCase());

          const matchAging = selectedAgingFilter === 'all' || inv.aging_bucket === selectedAgingFilter;
          return matchSearch && matchAging;
        });

        if (matchingInvoices.length === 0) return null;

        const filteredDebt = matchingInvoices.reduce((s, i) => s + i.remaining_amount, 0);
        const filteredOriginal = matchingInvoices.reduce((s, i) => s + i.total_amount, 0);
        const filteredPaid = matchingInvoices.reduce((s, i) => s + i.paid_amount, 0);
        const filteredRate = filteredOriginal > 0 ? (filteredPaid / filteredOriginal) * 100 : 0;

        return {
          ...del,
          total_debt: filteredDebt,
          total_original: filteredOriginal,
          total_paid: filteredPaid,
          collection_rate: Math.round(filteredRate * 10) / 10,
          invoice_count: matchingInvoices.length,
          invoices: matchingInvoices
        };
      })
      .filter((d): d is DelegateDebtSummary => d !== null);
  }, [delegatesData, searchTerm, selectedAgingFilter]);

  // Overall Market Debt KPIs
  const kpis = useMemo(() => {
    let grandTotalDebt = 0;
    let grandTotalOriginal = 0;
    let grandTotalPaid = 0;
    let totalInvoices = 0;

    filteredDelegates.forEach(d => {
      grandTotalDebt += d.total_debt;
      grandTotalOriginal += d.total_original;
      grandTotalPaid += d.total_paid;
      totalInvoices += d.invoice_count;
    });

    const collectionRatePct = grandTotalOriginal > 0
      ? Math.round((grandTotalPaid / grandTotalOriginal) * 1000) / 10
      : 0;

    return {
      grandTotalDebt,
      grandTotalOriginal,
      grandTotalPaid,
      collectionRatePct,
      totalInvoices,
      delegatesCount: filteredDelegates.length
    };
  }, [filteredDelegates]);

  // Export to Excel
  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    const rows: any[] = [];
    filteredDelegates.forEach(del => {
      del.invoices.forEach(inv => {
        rows.push({
          'المندوب المسؤول': del.delegate_name,
          'رقم الفاتورة': inv.invoice_number,
          'تاريخ الفاتورة': inv.date,
          'تاريخ الاستحقاق': inv.due_date || '---',
          'اسم العميل': inv.client_name,
          'إجمالي الفاتورة (SAR)': Number(inv.total_amount.toFixed(2)),
          'المسدد سابقاً': Number(inv.paid_amount.toFixed(2)),
          'المتبقي للتحصيل': Number(inv.remaining_amount.toFixed(2)),
          'عمر الدين (أيام)': inv.days_overdue,
          'تصنيف التأخير': inv.aging_bucket === 'over_60' ? 'متأخر > 60 يوم' : (inv.aging_bucket === '30_to_60' ? 'متأخر 30-60 يوم' : 'أقل من 30 يوم'),
          'الحالة': inv.status
        });
      });
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "ديون_المناديب_غير_المحصلة");
    XLSX.writeFile(wb, `Delegate_Debts_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return {
    isLoading,
    delegatesData,
    filteredDelegates,
    kpis,
    searchTerm,
    setSearchTerm,
    selectedAgingFilter,
    setSelectedAgingFilter,
    exportToExcel,
    handleRefresh: fetchData
  };
}
