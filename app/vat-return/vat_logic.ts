"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface VATTransactionItem {
  id: string;
  date: string;
  ref_number: string;
  party_name: string;
  description: string;
  type: 'output' | 'input'; // output = sales, input = purchase/expense
  taxable_amount: number;
  tax_rate: number;
  vat_amount: number;
  total_amount: number;
}

export function useVATReturnLogic() {
  const [isLoading, setIsLoading] = useState(false);
  
  // Default: Current Quarter
  const getCurrentQuarterDates = () => {
    const now = new Date();
    const y = now.getFullYear();
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(y, q * 3, 1).toISOString().split('T')[0];
    const end = new Date(y, (q + 1) * 3, 0).toISOString().split('T')[0];
    return { start, end };
  };

  const [dateRange, setDateRange] = useState(getCurrentQuarterDates());
  const [activeTab, setActiveTab] = useState<'form' | 'chart' | 'transactions'>('form');

  const setQuarterPreset = (quarter: 1 | 2 | 3 | 4) => {
    const y = new Date().getFullYear();
    const start = new Date(y, (quarter - 1) * 3, 1).toISOString().split('T')[0];
    const end = new Date(y, quarter * 3, 0).toISOString().split('T')[0];
    setDateRange({ start, end });
  };

  const setMonthPreset = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const start = new Date(y, m, 1).toISOString().split('T')[0];
    const end = new Date(y, m + 1, 0).toISOString().split('T')[0];
    setDateRange({ start, end });
  };

  const handleDateChange = (field: 'start' | 'end', value: string) => {
    setDateRange(prev => ({ ...prev, [field]: value }));
  };

  // State data
  const [transactions, setTransactions] = useState<VATTransactionItem[]>([]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const trans: VATTransactionItem[] = [];

      // 1. Fetch Invoices (Sales / Output VAT)
      let invQuery = supabase
        .from('invoices')
        .select('id, date, invoice_number, client_name, taxable_amount, tax_amount, total_amount, status')
        .in('status', ['مرحل', 'معتمد', 'مغلق', 'مدفوع']);

      if (dateRange.start) invQuery = invQuery.gte('date', dateRange.start);
      if (dateRange.end) invQuery = invQuery.lte('date', dateRange.end);

      const { data: invoices, error: invErr } = await invQuery;
      if (invErr) console.warn("Invoices fetch error:", invErr);

      (invoices || []).forEach((inv: any) => {
        const taxable = Number(inv.taxable_amount || (Number(inv.total_amount || 0) - Number(inv.tax_amount || 0)) || 0);
        const vat = Number(inv.tax_amount || 0);
        const total = Number(inv.total_amount || (taxable + vat));

        if (taxable > 0 || vat > 0) {
          trans.push({
            id: `inv-${inv.id}`,
            date: inv.date || '',
            ref_number: inv.invoice_number || `INV-${inv.id}`,
            party_name: inv.client_name || 'عميل نقدي',
            description: 'فاتورة مبيعات ضريبية',
            type: 'output',
            taxable_amount: taxable,
            tax_rate: 15,
            vat_amount: vat > 0 ? vat : (taxable * 0.15),
            total_amount: total
          });
        }
      });

      // 2. Fetch Expenses (Purchases & Operational Input VAT)
      let expQuery = supabase
        .from('expenses')
        .select('id, date, expense_type, description, price, vat_amount, total_price');

      if (dateRange.start) expQuery = expQuery.gte('date', dateRange.start);
      if (dateRange.end) expQuery = expQuery.lte('date', dateRange.end);

      const { data: expenses, error: expErr } = await expQuery;
      if (expErr) console.warn("Expenses fetch error:", expErr);

      (expenses || []).forEach((exp: any) => {
        const total = Number(exp.total_price || 0);
        const vat = Number(exp.vat_amount || 0);
        const taxable = Number(exp.price || (total - vat) || 0);

        if (taxable > 0 || vat > 0) {
          trans.push({
            id: `exp-${exp.id}`,
            date: exp.date || '',
            ref_number: `EXP-${exp.id}`,
            party_name: exp.expense_type || 'مصروف عام',
            description: exp.description || 'مصروفات تشغيلية خاضعة للضريبة',
            type: 'input',
            taxable_amount: taxable,
            tax_rate: vat > 0 ? 15 : 0,
            vat_amount: vat,
            total_amount: total > 0 ? total : (taxable + vat)
          });
        }
      });

      // 3. Check VAT journal lines for manual entries/adjustments
      try {
        const { data: vatAccs } = await supabase
          .from('accounts')
          .select('id, name, code')
          .or('code.ilike.2105%,name.ilike.%ضريب%,name.ilike.%Tax%,name.ilike.%VAT%');

        if (vatAccs && vatAccs.length > 0) {
          const accIds = vatAccs.map(a => a.id);
          const { data: jLines } = await supabase
            .from('journal_lines')
            .select('id, header_id, account_id, debit, credit, notes')
            .in('account_id', accIds);

          const headerIds = Array.from(new Set((jLines || []).map(l => l.header_id)));
          if (headerIds.length > 0) {
            const { data: jHeaders } = await supabase
              .from('journal_headers')
              .select('id, entry_date, description, v_type, reference_id')
              .in('id', headerIds);
            
            const headerMap = new Map((jHeaders || []).map(h => [h.id, h]));

            (jLines || []).forEach((line: any) => {
              const h = headerMap.get(line.header_id);
              const d = h?.entry_date;
              if (d && dateRange.start && d < dateRange.start) return;
              if (d && dateRange.end && d > dateRange.end) return;

              // If entry is not linked to existing invoices or expenses
              if (h?.v_type !== 'invoice' && h?.v_type !== 'expense') {
                const isDebit = Number(line.debit || 0) > 0;
                const vatVal = isDebit ? Number(line.debit) : Number(line.credit);
                if (vatVal > 0) {
                  trans.push({
                    id: `jl-${line.id}`,
                    date: d || '',
                    ref_number: `JV-${h?.id || line.id}`,
                    party_name: 'قيد تسوية ضريبية',
                    description: line.notes || h?.description || 'تسوية قيد محاسبي',
                    type: isDebit ? 'input' : 'output',
                    taxable_amount: vatVal / 0.15,
                    tax_rate: 15,
                    vat_amount: vatVal,
                    total_amount: (vatVal / 0.15) + vatVal
                  });
                }
              }
            });
          }
        }
      } catch (e) {
        console.warn("Manual VAT lines check error:", e);
      }

      // Sort by date descending
      trans.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(trans);

    } catch (error) {
      console.error('Error fetching VAT return data:', error);
      showGlobalToast("حدث خطأ أثناء جلب بيانات الإقرار الضريبي", 'warning');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Official ZATCA Form 15% Calculation
  const zatcaSummary = useMemo(() => {
    let standardRatedSales = 0;
    let standardRatedSalesVAT = 0;
    let zeroRatedSales = 0;
    let exemptSales = 0;

    let standardRatedPurchases = 0;
    let standardRatedPurchasesVAT = 0;
    let zeroRatedPurchases = 0;
    let exemptPurchases = 0;

    transactions.forEach(t => {
      if (t.type === 'output') {
        if (t.vat_amount > 0) {
          standardRatedSales += t.taxable_amount;
          standardRatedSalesVAT += t.vat_amount;
        } else {
          exemptSales += t.taxable_amount;
        }
      } else if (t.type === 'input') {
        if (t.vat_amount > 0) {
          standardRatedPurchases += t.taxable_amount;
          standardRatedPurchasesVAT += t.vat_amount;
        } else {
          exemptPurchases += t.taxable_amount;
        }
      }
    });

    const totalSales = standardRatedSales + zeroRatedSales + exemptSales;
    const totalOutputVAT = standardRatedSalesVAT;

    const totalPurchases = standardRatedPurchases + zeroRatedPurchases + exemptPurchases;
    const totalInputVAT = standardRatedPurchasesVAT;

    const netVAT = totalOutputVAT - totalInputVAT; // Positive = Payable to ZATCA, Negative = Refundable

    return {
      // 1. Sales (Outputs)
      box1_stdSales: standardRatedSales,
      box1_stdSalesVAT: standardRatedSalesVAT,
      box2_citizensSales: 0,
      box2_citizensSalesVAT: 0,
      box3_zeroSales: zeroRatedSales,
      box4_exportSales: 0,
      box5_exemptSales: exemptSales,
      box6_totalSales: totalSales,
      box6_totalOutputVAT: totalOutputVAT,

      // 2. Purchases (Inputs)
      box7_stdPurchases: standardRatedPurchases,
      box7_stdPurchasesVAT: standardRatedPurchasesVAT,
      box8_importsStandard: 0,
      box8_importsStandardVAT: 0,
      box9_zeroPurchases: zeroRatedPurchases,
      box10_exemptPurchases: exemptPurchases,
      box11_totalPurchases: totalPurchases,
      box11_totalInputVAT: totalInputVAT,

      // 3. Net Tax
      box12_netTax: netVAT,
      box13_adjustments: 0,
      box14_carriedForward: 0,
      box15_finalTaxDue: netVAT
    };
  }, [transactions]);

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // 1. Official ZATCA Return Schedule
    const zatcaSheetData = [
      { 'رقم الخانة': 'أولاً', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المبلغ الخاضع للضريبة (SAR)', 'مبلغ التعديل (SAR)': '', 'مبلغ الضريبة (SAR)': '' },
      { 'رقم الخانة': '1', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المبيعات الخاضعة للنسبة الأساسية (15%)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box1_stdSales.toFixed(2), 'مبلغ الضريبة (SAR)': zatcaSummary.box1_stdSalesVAT.toFixed(2) },
      { 'رقم الخانة': '2', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المبيعات للمواطنين (خدمات صحية خاصة)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '0.00', 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '3', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المبيعات المحلية الخاضعة لنسبة الصفر', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box3_zeroSales.toFixed(2), 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '4', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'الصادرات', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '0.00', 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '5', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المبيعات المعفاة من الضريبة', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box5_exemptSales.toFixed(2), 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '6', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'إجمالي المبيعات وضريبة المخرجات', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box6_totalSales.toFixed(2), 'مبلغ الضريبة (SAR)': zatcaSummary.box6_totalOutputVAT.toFixed(2) },
      { 'رقم الخانة': '', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': '', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': '' },
      { 'رقم الخانة': 'ثانياً', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المشتريات والمصروفات الخاضعة للضريبة (المدخلات)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': '' },
      { 'رقم الخانة': '7', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المشتريات الخاضعة للنسبة الأساسية (15%)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box7_stdPurchases.toFixed(2), 'مبلغ الضريبة (SAR)': zatcaSummary.box7_stdPurchasesVAT.toFixed(2) },
      { 'رقم الخانة': '8', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'الاستيرادات الخاضعة للضريبة بالنسبة الأساسية', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '0.00', 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '9', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المشتريات الخاضعة لنسبة الصفر', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box9_zeroPurchases.toFixed(2), 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '10', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'المشتريات المعفاة من الضريبة', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box10_exemptPurchases.toFixed(2), 'مبلغ الضريبة (SAR)': '0.00' },
      { 'رقم الخانة': '11', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'إجمالي المشتريات وضريبة المدخلات القابلة للخصم', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': zatcaSummary.box11_totalPurchases.toFixed(2), 'مبلغ الضريبة (SAR)': zatcaSummary.box11_totalInputVAT.toFixed(2) },
      { 'رقم الخانة': '', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': '', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': '' },
      { 'رقم الخانة': 'ثالثاً', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'احتساب صافي الضريبة', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': '' },
      { 'رقم الخانة': '12', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'إجمالي الضريبة المستحقة للفترة (مخرجات - مدخلات)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': zatcaSummary.box12_netTax.toFixed(2) },
      { 'رقم الخانة': '15', 'بيان ضريبة القيمة المضافة على المبيعات (المخرجات)': 'صافي الضريبة المستحقة للسداد / (المستردة)', 'مبلغ التعديل (SAR)': '', 'المبلغ الخاضع للضريبة (SAR)': '', 'مبلغ الضريبة (SAR)': zatcaSummary.box15_finalTaxDue.toFixed(2) }
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(zatcaSheetData), "إقرار ZATCA الرسمي");

    // 2. Transactions Log Sheet
    const transSheetData = transactions.map((t, idx) => ({
      '#': idx + 1,
      'التاريخ': t.date,
      'النوع': t.type === 'output' ? 'مبيعات (مخرجات)' : 'مشتريات/مصروفات (مدخلات)',
      'رقم المرجع': t.ref_number,
      'اسم الطرف / العميل': t.party_name,
      'البيان': t.description,
      'المبلغ الخاضع (SAR)': Number(t.taxable_amount.toFixed(2)),
      'النسبة %': `${t.tax_rate}%`,
      'مبلغ الضريبة 15% (SAR)': Number(t.vat_amount.toFixed(2)),
      'الإجمالي شامل الضريبة (SAR)': Number(t.total_amount.toFixed(2))
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(transSheetData), "سجل العمليات الضريبية");

    XLSX.writeFile(wb, `ZATCA_VAT_Return_${dateRange.start}_to_${dateRange.end}.xlsx`);
    showGlobalToast("✅ تم تصدير إقرار ضريبة القيمة المضافة إلى Excel بنجاح", 'success');
  };

  return {
    isLoading,
    dateRange,
    handleDateChange,
    setQuarterPreset,
    setMonthPreset,
    activeTab,
    setActiveTab,
    transactions,
    zatcaSummary,
    handleRefresh: fetchData,
    exportToExcel
  };
}
