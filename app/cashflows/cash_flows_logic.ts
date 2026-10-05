"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

export function useCashFlowsLogic() {
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all'); // all, inflow, outflow
    const [methodFilter, setMethodFilter] = useState<'all' | 'cash' | 'bank'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const { data: cashFlows = [], isLoading, refetch } = useQuery({
        queryKey: ['cash_flows_list'],
        queryFn: async () => {
            let allData: any[] = [];
            
            // 1. جلب التدفقات المسجلة بجدول cash_flows إن وُجدت
            try {
                const { data: cfData, error: cfError } = await supabase
                    .from('cash_flows')
                    .select(`
                        *,
                        partner:partners(name),
                        account:accounts(name)
                    `)
                    .order('transaction_date', { ascending: false });
                if (!cfError && cfData) {
                    allData.push(...cfData);
                }
            } catch (e) {
                console.warn("Could not fetch cash_flows table:", e);
            }

            // 2. 🌊 جلب سندات القبض المعتمدة كتدفقات نقدية داخلة (Inflows)
            try {
                const { data: receipts, error: rvError } = await supabase
                    .from('receipt_vouchers')
                    .select(`
                        id,
                        receipt_number,
                        date,
                        amount,
                        payment_method,
                        notes,
                        delegate_id,
                        fleet_operation_id,
                        partner:partners!receipt_vouchers_partner_id_fkey(name),
                        account:accounts!receipt_vouchers_safe_bank_acc_id_fkey(name)
                    `)
                    .in('status', ['مرحل', 'معتمد', 'posted'])
                    .order('date', { ascending: false });

                if (!rvError && receipts) {
                    const mappedReceipts = receipts.map((r: any) => ({
                        id: `RV-${r.id}`,
                        transaction_date: r.date,
                        flow_type: 'inflow',
                        amount: Number(r.amount) || 0,
                        category: r.delegate_id ? 'توريد عهدة مندوب' : 'تحصيل عملاء',
                        sub_category: 'سند قبض',
                        payment_method: r.payment_method || 'نقدي',
                        reference_number: r.receipt_number || '',
                        description: r.notes || `سند قبض #${r.receipt_number}`,
                        partner: r.partner,
                        account: r.account,
                        delegate_id: r.delegate_id,
                        fleet_operation_id: r.fleet_operation_id,
                        source_type: 'receipt_voucher',
                        source_id: r.id
                    }));
                    allData.push(...mappedReceipts);
                }
            } catch (rvErr) {
                console.error("Error fetching receipts for cash flow:", rvErr);
            }

            // 3. 🌊 جلب سندات الصرف المعتمدة كتدفقات نقدية خارجة (Outflows)
            try {
                const { data: payments, error: pvError } = await supabase
                    .from('payment_vouchers')
                    .select(`
                        id,
                        voucher_number,
                        date,
                        amount,
                        payment_method,
                        description,
                        notes,
                        partner:partners(name),
                        account:accounts!payment_vouchers_credit_account_id_fkey(name)
                    `)
                    .or('is_posted.eq.true,status.in.(مرحل,معتمد,posted)')
                    .order('date', { ascending: false });

                if (!pvError && payments) {
                    const mappedPayments = payments.map((p: any) => ({
                        id: `PV-${p.id}`,
                        transaction_date: p.date,
                        flow_type: 'outflow',
                        amount: Number(p.amount) || 0,
                        category: 'سداد موردين / مصروفات',
                        sub_category: 'سند صرف',
                        payment_method: p.payment_method || 'نقدي',
                        reference_number: p.voucher_number || '',
                        description: p.description || p.notes || `سند صرف #${p.voucher_number}`,
                        partner: p.partner,
                        account: p.account,
                        source_type: 'payment_voucher',
                        source_id: p.id
                    }));
                    allData.push(...mappedPayments);
                }
            } catch (pvErr) {
                console.error("Error fetching payments for cash flow:", pvErr);
            }

            // 4. 🌊 جلب المصروفات المباشرة المسددة نقداً إن لم ترتبط بسند صرف
            try {
                const { data: directExpenses, error: expError } = await supabase
                    .from('expenses')
                    .select(`
                        id,
                        expense_number,
                        date,
                        total_price,
                        paid_amount,
                        payment_method,
                        notes,
                        recipient_name
                    `)
                    .eq('is_deleted', false)
                    .gt('paid_amount', 0)
                    .order('date', { ascending: false });

                if (!expError && directExpenses) {
                    const mappedExpenses = directExpenses.map((exp: any) => ({
                        id: `EXP-${exp.id}`,
                        transaction_date: exp.date,
                        flow_type: 'outflow',
                        amount: Number(exp.paid_amount || exp.total_price) || 0,
                        category: 'مصروفات تشغيلية',
                        sub_category: 'مصروف مباشر',
                        payment_method: exp.payment_method || 'نقدي',
                        reference_number: exp.expense_number || '',
                        description: exp.notes || `مصروف مباشر #${exp.expense_number || ''}`,
                        partner: exp.recipient_name ? { name: exp.recipient_name } : null,
                        account: { name: 'الخزينة الرئيسية' },
                        source_type: 'direct_expense',
                        source_id: exp.id
                    }));
                    allData.push(...mappedExpenses);
                }
            } catch (expErr) {
                console.warn("Error fetching direct expenses for cash flow:", expErr);
            }
            
            // 🛡️ درع الحماية المالي: منع تكرار السجلات
            const uniqueDataMap = new Map();
            allData.forEach((item) => {
                if (item.id && !uniqueDataMap.has(item.id)) {
                    uniqueDataMap.set(item.id, item);
                }
            });
            
            return Array.from(uniqueDataMap.values()).sort((a: any, b: any) => 
                new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
            );
        },
        staleTime: 1000 * 60 * 2, // دقيقتان
        refetchOnWindowFocus: false,
    });

    // Helper to identify flow direction
    const getFlowDirection = (row: any) => {
        const type = String(row.flow_type || '').toLowerCase().trim();
        const source = String(row.source_type || '').toLowerCase().trim();
        if (['inflow', 'in', 'وارد', 'مقبوضات', 'قبض'].includes(type) || source === 'receipt_voucher') return 'inflow';
        if (['outflow', 'out', 'منصرف', 'مدفوعات', 'صرف', 'direct_expense'].includes(type) || source === 'payment_voucher') return 'outflow';
        return Number(row.amount || 0) >= 0 ? 'inflow' : 'outflow';
    };

    // Filtered Cash Flows
    const filteredData = useMemo(() => {
        return cashFlows.filter((row: any) => {
            const searchString = `${row.description || ''} ${row.reference_number || ''} ${row.partner?.name || ''} ${row.category || ''} ${row.sub_category || ''}`.toLowerCase();
            const matchesSearch = !searchTerm || searchString.includes(searchTerm.toLowerCase().trim());

            const direction = getFlowDirection(row);
            const matchesType = filterType === 'all' || direction === filterType;

            // Payment method filter (Cash Safe vs Bank)
            const m = String(row.payment_method || '').toLowerCase();
            const isBank = m.includes('بنك') || m.includes('تحويل') || m.includes('شبكة') || m.includes('مدى') || m.includes('bank');
            let matchesMethod = true;
            if (methodFilter === 'cash') matchesMethod = !isBank;
            else if (methodFilter === 'bank') matchesMethod = isBank;

            // Date filtering
            let matchesDateFrom = true;
            let matchesDateTo = true;

            if (row.transaction_date) {
                const rowDate = new Date(row.transaction_date).setHours(0, 0, 0, 0);
                if (dateFrom) matchesDateFrom = rowDate >= new Date(dateFrom).setHours(0, 0, 0, 0);
                if (dateTo) matchesDateTo = rowDate <= new Date(dateTo).setHours(23, 59, 59, 999);
            }

            return matchesSearch && matchesType && matchesMethod && matchesDateFrom && matchesDateTo;
        });
    }, [cashFlows, searchTerm, filterType, methodFilter, dateFrom, dateTo]);

    // Summary Statistics and Reconciliation
    const stats = useMemo(() => {
        let totalIn = 0;
        let totalOut = 0;
        let cashSafeIn = 0;
        let cashSafeOut = 0;
        let bankIn = 0;
        let bankOut = 0;
        let delegateCustodyIn = 0;

        filteredData.forEach((row: any) => {
            const amt = Math.abs(Number(row.amount) || 0);
            const direction = getFlowDirection(row);
            const m = String(row.payment_method || '').toLowerCase();
            const isBank = m.includes('بنك') || m.includes('تحويل') || m.includes('شبكة') || m.includes('مدى') || m.includes('bank');

            if (direction === 'inflow') {
                totalIn += amt;
                if (isBank) bankIn += amt;
                else cashSafeIn += amt;
                if (row.delegate_id || row.category?.includes('مندوب')) {
                    delegateCustodyIn += amt;
                }
            } else {
                totalOut += amt;
                if (isBank) bankOut += amt;
                else cashSafeOut += amt;
            }
        });

        return {
            totalIn,
            totalOut,
            netCash: totalIn - totalOut,
            cashSafeIn,
            cashSafeOut,
            netCashSafe: cashSafeIn - cashSafeOut,
            bankIn,
            bankOut,
            netBank: bankIn - bankOut,
            delegateCustodyIn,
            totalTransactions: filteredData.length
        };
    }, [filteredData]);

    // Export to Excel
    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows = filteredData.map((row: any, idx: number) => {
            const dir = getFlowDirection(row);
            return {
                '#': idx + 1,
                'التاريخ': row.transaction_date || '---',
                'نوع الحركة': dir === 'inflow' ? 'تدفق وارد (+)' : 'تدفق منصرف (-)',
                'المبلغ (ر.س)': Math.abs(Number(row.amount || 0)),
                'طريقة الدفع': row.payment_method || 'نقدي',
                'التصنيف': row.category || '---',
                'الجهة / الشريك': row.partner?.name || '---',
                'الحساب المالي': row.account?.name || 'الخزينة الرئيسية',
                'الرقم المرجعي': row.reference_number || '---',
                'البيان': row.description || '---'
            };
        });

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "حركة_السيولة_والخزينة");
        XLSX.writeFile(wb, `Cash_Flow_Statement_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return {
        cashFlows,
        filteredData,
        stats,
        isLoading,
        refetch,
        searchTerm, setSearchTerm,
        filterType, setFilterType,
        methodFilter, setMethodFilter,
        dateFrom, setDateFrom,
        dateTo, setDateTo,
        exportToExcel,
        getFlowDirection
    };
}
