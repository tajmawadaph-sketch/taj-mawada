"use client";
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface BankAccountItem {
    id: string;
    code: string;
    name: string;
    type: 'cash' | 'bank';
    balance: number;
}

export interface FinancialLogItem {
    id: string;
    date: string;
    description: string;
    type: 'receipt' | 'payment' | 'invoice' | 'expense' | 'journal';
    direction: 'in' | 'out';
    amount: number;
}

export function useFinancialCenterLogic() {
    const [selectedView, setSelectedView] = useState<'all' | 'banks' | 'feed'>('all');

    const centerQuery = useQuery({
        queryKey: ['financial_center_cockpit_data'],
        queryFn: async () => {
            const [accRes, linesRes, headersRes, expRes, invRes] = await Promise.all([
                supabase.from('accounts').select('id, code, name, account_type').order('code'),
                supabase.from('journal_lines').select('id, header_id, account_id, debit, credit, notes'),
                supabase.from('journal_headers').select('id, entry_date, description, v_type').order('entry_date', { ascending: false }).limit(40),
                supabase.from('expenses').select('id, date, total_price, description, payment_method').order('created_at', { ascending: false }).limit(20),
                supabase.from('invoices').select('id, date, total_amount, paid_amount, client_name, payment_method').order('created_at', { ascending: false }).limit(20)
            ]);

            if (accRes.error) throw accRes.error;
            if (linesRes.error) throw linesRes.error;

            const accounts = accRes.data || [];
            const lines = linesRes.data || [];
            const headers = headersRes.data || [];
            const expenses = expRes.data || [];
            const invoices = invRes.data || [];

            // Account balances
            const accBalances = new Map<string, { debit: number; credit: number }>();
            accounts.forEach(a => accBalances.set(a.id, { debit: 0, credit: 0 }));

            lines.forEach((l: any) => {
                const b = accBalances.get(l.account_id);
                if (b) {
                    b.debit += Number(l.debit || 0);
                    b.credit += Number(l.credit || 0);
                }
            });

            return {
                accounts,
                accBalances,
                headers,
                expenses,
                invoices
            };
        },
        refetchInterval: 30000 // Realtime polling every 30s
    });

    const data = centerQuery.data;

    const {
        cashAndBankAccounts,
        totalLiquidCash,
        totalReceivables,
        totalPayables,
        totalInventory,
        workingCapital,
        currentRatio,
        quickRatio,
        financialFeed
    } = useMemo(() => {
        if (!data) {
            return {
                cashAndBankAccounts: [],
                totalLiquidCash: 0,
                totalReceivables: 0,
                totalPayables: 0,
                totalInventory: 0,
                workingCapital: 0,
                currentRatio: 1,
                quickRatio: 1,
                financialFeed: []
            };
        }

        const { accounts, accBalances, headers, expenses, invoices } = data;

        const cashAccounts: BankAccountItem[] = [];
        let liquidCash = 0;
        let receivables = 0;
        let payables = 0;
        let inventory = 0;
        let otherLiabilities = 0;

        accounts.forEach(acc => {
            const code = String(acc.code || '').trim();
            const name = String(acc.name || '');
            const bal = accBalances.get(acc.id) || { debit: 0, credit: 0 };
            const debitBal = bal.debit - bal.credit;
            const creditBal = bal.credit - bal.debit;

            // 1. Cash & Bank Accounts (Codes starting with 111 or names with بنك / صندوق / خزينة / مصرف)
            if (code.startsWith('111') || /صندوق|نقد|بنك|مصرف|راجحي|أهلي|إنماء|خزينة/i.test(name)) {
                const isBank = /بنك|مصرف|راجحي|أهلي|إنماء/i.test(name);
                cashAccounts.push({
                    id: acc.id,
                    code: acc.code,
                    name: acc.name,
                    type: isBank ? 'bank' : 'cash',
                    balance: debitBal
                });
                liquidCash += debitBal;
            }
            // 2. Receivables (Code 112 or عملاء / مدينون)
            else if (code.startsWith('112') || /عملاء|مدين/i.test(name)) {
                receivables += debitBal;
            }
            // 3. Inventory (Code 113 or بضاعة / مخزون)
            else if (code.startsWith('113') || /مخزون|بضاعة/i.test(name)) {
                inventory += debitBal;
            }
            // 4. Payables (Code 211 or موردون / دائنون)
            else if (code.startsWith('211') || /مورد|دائن/i.test(name)) {
                payables += creditBal;
            }
            // 5. Other short term liabilities (Code 21...)
            else if (code.startsWith('21')) {
                otherLiabilities += creditBal;
            }
        });

        // Compute Working Capital & Ratios
        const totalCurrentAssets = liquidCash + receivables + inventory;
        const totalCurrentLiabilities = payables + otherLiabilities;
        const netWorkingCapital = totalCurrentAssets - totalCurrentLiabilities;
        const curRatio = totalCurrentLiabilities > 0 ? (totalCurrentAssets / totalCurrentLiabilities) : (totalCurrentAssets > 0 ? 99 : 1);
        const qckRatio = totalCurrentLiabilities > 0 ? ((liquidCash + receivables) / totalCurrentLiabilities) : 1;

        // Build Financial Feed (combining headers, invoices, expenses)
        const feed: FinancialLogItem[] = [];

        invoices.forEach((inv: any) => {
            const amount = Number(inv.paid_amount || inv.total_amount || 0);
            if (amount > 0) {
                feed.push({
                    id: `inv-${inv.id}`,
                    date: inv.date || new Date().toISOString().split('T')[0],
                    description: `فاتورة مبيعات: ${inv.client_name || 'عميل نقدي'}`,
                    type: 'invoice',
                    direction: 'in',
                    amount: amount
                });
            }
        });

        expenses.forEach((exp: any) => {
            const amount = Number(exp.total_price || 0);
            if (amount > 0) {
                feed.push({
                    id: `exp-${exp.id}`,
                    date: exp.date || new Date().toISOString().split('T')[0],
                    description: `مصروفات: ${exp.description || 'مصروف عام'}`,
                    type: 'expense',
                    direction: 'out',
                    amount: amount
                });
            }
        });

        headers.forEach((h: any) => {
            feed.push({
                id: `jh-${h.id}`,
                date: h.entry_date || new Date().toISOString().split('T')[0],
                description: `قيد محاسبي: ${h.description || h.v_type || 'قيد نظامي'}`,
                type: 'journal',
                direction: 'in',
                amount: 0
            });
        });

        // Sort by date descending
        feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return {
            cashAndBankAccounts: cashAccounts.sort((a, b) => b.balance - a.balance),
            totalLiquidCash: liquidCash,
            totalReceivables: receivables,
            totalPayables: payables,
            totalInventory: inventory,
            workingCapital: netWorkingCapital,
            currentRatio: curRatio,
            quickRatio: qckRatio,
            financialFeed: feed.slice(0, 25)
        };
    }, [data]);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Bank and Cash accounts sheet
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(
            cashAndBankAccounts.map((b, idx) => ({
                '#': idx + 1,
                'كود الحساب': b.code || '-',
                'اسم الحساب': b.name,
                'النوع': b.type === 'bank' ? 'حساب بنكي' : 'صندوق نقدي',
                'الرصيد المتاح (SAR)': Number(b.balance.toFixed(2))
            }))
        ), "أرصدة البنوك والصناديق");

        // 2. Financial Indicators sheet
        const kpis = [
            { 'المؤشر المالي': 'إجمالي السيولة النقدية الحاضرة', 'القيمة': totalLiquidCash.toFixed(2) },
            { 'المؤشر المالي': 'رأس المال العامل (Working Capital)', 'القيمة': workingCapital.toFixed(2) },
            { 'المؤشر المالي': 'الذمم المدينة (مستحقات العملاء)', 'القيمة': totalReceivables.toFixed(2) },
            { 'المؤشر المالي': 'الذمم الدائنة (التزامات الموردين)', 'القيمة': totalPayables.toFixed(2) },
            { 'المؤشر المالي': 'قيمة بضاعة المخزون الدفتري', 'القيمة': totalInventory.toFixed(2) },
            { 'المؤشر المالي': 'نسبة التداول (Current Ratio)', 'القيمة': currentRatio.toFixed(2) },
            { 'المؤشر المالي': 'نسبة السيولة السريعة (Quick Ratio)', 'القيمة': quickRatio.toFixed(2) }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(kpis), "مؤشرات السيولة والمركز المالي");

        XLSX.writeFile(wb, `Financial_Center_${new Date().toISOString().split('T')[0]}.xlsx`);
        showGlobalToast("✅ تم تصدير تقرير المركز المالي والسيولة إلى Excel", 'success');
    };

    return {
        selectedView, setSelectedView,
        cashAndBankAccounts,
        totalLiquidCash,
        totalReceivables,
        totalPayables,
        totalInventory,
        workingCapital,
        currentRatio,
        quickRatio,
        financialFeed,
        isLoading: centerQuery.isLoading,
        refetch: centerQuery.refetch,
        exportToExcel
    };
}
