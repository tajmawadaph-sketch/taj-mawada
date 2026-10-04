"use client";
import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface FinancialAccountRow {
    id: string;
    code: string;
    name: string;
    type: string;
    debit: number;
    credit: number;
    balance: number;
}

export function useFinancialStatementsLogic() {
    // Dates default: Current Year from Jan 1 to Dec 31
    const currentYear = new Date().getFullYear();
    const [startDate, setStartDate] = useState(`${currentYear}-01-01`);
    const [endDate, setEndDate] = useState(`${currentYear}-12-31`);
    const [activeTab, setActiveTab] = useState<'both' | 'income' | 'balance'>('both');

    const setPeriodPreset = (type: 'this_year' | 'this_quarter' | 'this_month' | 'all') => {
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth();
        if (type === 'this_year') {
            setStartDate(`${y}-01-01`);
            setEndDate(`${y}-12-31`);
        } else if (type === 'this_quarter') {
            const q = Math.floor(m / 3);
            const qStart = new Date(y, q * 3, 1).toISOString().split('T')[0];
            const qEnd = new Date(y, (q + 1) * 3, 0).toISOString().split('T')[0];
            setStartDate(qStart);
            setEndDate(qEnd);
        } else if (type === 'this_month') {
            const mStart = new Date(y, m, 1).toISOString().split('T')[0];
            const mEnd = new Date(y, m + 1, 0).toISOString().split('T')[0];
            setStartDate(mStart);
            setEndDate(mEnd);
        } else if (type === 'all') {
            setStartDate('2020-01-01');
            setEndDate(`${y}-12-31`);
        }
    };

    // Query all ledger data
    const statementsQuery = useQuery({
        queryKey: ['financial_statements_data', startDate, endDate],
        queryFn: async () => {
            // Fetch accounts, journal lines, and headers
            const [accRes, linesRes, headersRes] = await Promise.all([
                supabase.from('accounts').select('id, code, name, account_type, is_transactional, parent_id').order('code'),
                supabase.from('journal_lines').select('id, header_id, account_id, debit, credit'),
                supabase.from('journal_headers').select('id, entry_date, status')
            ]);

            if (accRes.error) throw accRes.error;
            if (linesRes.error) throw linesRes.error;
            if (headersRes.error) throw headersRes.error;

            const accounts = accRes.data || [];
            const lines = linesRes.data || [];
            const headers = headersRes.data || [];
            const headerMap = new Map(headers.map((h: any) => [h.id, h]));

            return { accounts, lines, headerMap };
        }
    });

    const rawData = statementsQuery.data;

    const {
        // Income statement
        revenues,
        expenses,
        totalRevenues,
        totalExpenses,
        netProfit,
        grossProfitMargin,
        // Balance sheet
        currentAssets,
        fixedAssets,
        totalAssets,
        currentLiabilities,
        longTermLiabilities,
        totalLiabilities,
        equityItems,
        totalEquity,
        totalLiabilitiesAndEquity,
        isBalanced,
        balanceDiff
    } = useMemo(() => {
        if (!rawData) {
            return {
                revenues: [], expenses: [], totalRevenues: 0, totalExpenses: 0, netProfit: 0, grossProfitMargin: 0,
                currentAssets: [], fixedAssets: [], totalAssets: 0, currentLiabilities: [], longTermLiabilities: [],
                totalLiabilities: 0, equityItems: [], totalEquity: 0, totalLiabilitiesAndEquity: 0, isBalanced: true, balanceDiff: 0
            };
        }

        const { accounts, lines, headerMap } = rawData;

        // Categorize accounts and aggregate balances
        const accBalances = new Map<string, { periodDebit: number; periodCredit: number; cumDebit: number; cumCredit: number }>();
        accounts.forEach(a => {
            accBalances.set(a.id, { periodDebit: 0, periodCredit: 0, cumDebit: 0, cumCredit: 0 });
        });

        lines.forEach((l: any) => {
            const entry = accBalances.get(l.account_id);
            if (!entry) return;

            const h = headerMap.get(l.header_id);
            const date = h?.entry_date || '';
            const d = Number(l.debit || 0);
            const c = Number(l.credit || 0);

            // Cumulative up to endDate for Balance Sheet
            if (!endDate || date <= endDate) {
                entry.cumDebit += d;
                entry.cumCredit += c;
            }

            // Period activity between startDate and endDate for Income Statement
            if ((!startDate || date >= startDate) && (!endDate || date <= endDate)) {
                entry.periodDebit += d;
                entry.periodCredit += c;
            }
        });

        // Split accounts by Saudi standard classifications
        const revenuesList: FinancialAccountRow[] = [];
        const expensesList: FinancialAccountRow[] = [];
        const currentAssetsList: FinancialAccountRow[] = [];
        const fixedAssetsList: FinancialAccountRow[] = [];
        const currentLiabilitiesList: FinancialAccountRow[] = [];
        const longTermLiabilitiesList: FinancialAccountRow[] = [];
        const equityList: FinancialAccountRow[] = [];

        accounts.forEach(acc => {
            const codeStr = String(acc.code || '').trim();
            const typeStr = String(acc.account_type || '').toLowerCase();
            const bal = accBalances.get(acc.id) || { periodDebit: 0, periodCredit: 0, cumDebit: 0, cumCredit: 0 };

            // 1. REVENUES (Code starts with 4 or type contains revenue/income)
            if (codeStr.startsWith('4') || ['revenues', 'revenue', 'income', 'إيرادات', 'الإيرادات'].includes(typeStr)) {
                const amount = bal.periodCredit - bal.periodDebit; // Credit balance
                if (Math.abs(amount) > 0.001 || (bal.periodDebit > 0 || bal.periodCredit > 0)) {
                    revenuesList.push({
                        id: acc.id,
                        code: acc.code,
                        name: acc.name,
                        type: 'revenue',
                        debit: bal.periodDebit,
                        credit: bal.periodCredit,
                        balance: amount
                    });
                }
            }

            // 2. EXPENSES (Code starts with 5 or type contains expense)
            else if (codeStr.startsWith('5') || ['expenses', 'expense', 'مصروفات', 'المصروفات'].includes(typeStr)) {
                const amount = bal.periodDebit - bal.periodCredit; // Debit balance
                if (Math.abs(amount) > 0.001 || (bal.periodDebit > 0 || bal.periodCredit > 0)) {
                    expensesList.push({
                        id: acc.id,
                        code: acc.code,
                        name: acc.name,
                        type: 'expense',
                        debit: bal.periodDebit,
                        credit: bal.periodCredit,
                        balance: amount
                    });
                }
            }

            // 3. ASSETS (Code starts with 1 or type contains assets)
            else if (codeStr.startsWith('1') || ['assets', 'asset', 'أصول', 'الأصول'].includes(typeStr)) {
                const amount = bal.cumDebit - bal.cumCredit; // Debit balance
                if (Math.abs(amount) > 0.001 || (bal.cumDebit > 0 || bal.cumCredit > 0)) {
                    // Check if fixed asset (code starts with 12 or name contains أصول ثابتة / معدات / سيارات)
                    const isFixed = codeStr.startsWith('12') || /ثابت|سيار|معد|أثاث|عقار/i.test(acc.name);
                    const row: FinancialAccountRow = {
                        id: acc.id,
                        code: acc.code,
                        name: acc.name,
                        type: isFixed ? 'fixed_asset' : 'current_asset',
                        debit: bal.cumDebit,
                        credit: bal.cumCredit,
                        balance: amount
                    };
                    if (isFixed) fixedAssetsList.push(row);
                    else currentAssetsList.push(row);
                }
            }

            // 4. LIABILITIES (Code starts with 2 or type contains liabilities)
            else if (codeStr.startsWith('2') || ['liabilities', 'liability', 'خصوم', 'التزامات', 'الخصوم'].includes(typeStr)) {
                const amount = bal.cumCredit - bal.cumDebit; // Credit balance
                if (Math.abs(amount) > 0.001 || (bal.cumDebit > 0 || bal.cumCredit > 0)) {
                    const isLongTerm = codeStr.startsWith('22') || /طويل|قرض طويل/i.test(acc.name);
                    const row: FinancialAccountRow = {
                        id: acc.id,
                        code: acc.code,
                        name: acc.name,
                        type: isLongTerm ? 'long_term_liability' : 'current_liability',
                        debit: bal.cumDebit,
                        credit: bal.cumCredit,
                        balance: amount
                    };
                    if (isLongTerm) longTermLiabilitiesList.push(row);
                    else currentLiabilitiesList.push(row);
                }
            }

            // 5. EQUITY (Code starts with 3 or type contains equity)
            else if (codeStr.startsWith('3') || ['equity', 'حقوق الملكية', 'حقوق ملكية'].includes(typeStr)) {
                const amount = bal.cumCredit - bal.cumDebit; // Credit balance
                if (Math.abs(amount) > 0.001 || (bal.cumDebit > 0 || bal.cumCredit > 0)) {
                    equityList.push({
                        id: acc.id,
                        code: acc.code,
                        name: acc.name,
                        type: 'equity',
                        debit: bal.cumDebit,
                        credit: bal.cumCredit,
                        balance: amount
                    });
                }
            }
        });

        // Totals
        const totalRev = revenuesList.reduce((sum, r) => sum + r.balance, 0);
        const totalExp = expensesList.reduce((sum, e) => sum + e.balance, 0);
        const netProf = totalRev - totalExp;
        const grossMargin = totalRev > 0 ? (netProf / totalRev) * 100 : 0;

        const totalCurrAssets = currentAssetsList.reduce((sum, a) => sum + a.balance, 0);
        const totalFixAssets = fixedAssetsList.reduce((sum, a) => sum + a.balance, 0);
        const totalAss = totalCurrAssets + totalFixAssets;

        const totalCurrLiab = currentLiabilitiesList.reduce((sum, l) => sum + l.balance, 0);
        const totalLongLiab = longTermLiabilitiesList.reduce((sum, l) => sum + l.balance, 0);
        const totalLiab = totalCurrLiab + totalLongLiab;

        const baseEquity = equityList.reduce((sum, eq) => sum + eq.balance, 0);
        // Total equity includes cumulative net profit of the period
        const totalEq = baseEquity + netProf;

        const totalLiabAndEq = totalLiab + totalEq;
        const diff = Math.round(Math.abs(totalAss - totalLiabAndEq) * 100) / 100;
        const isBal = diff < 0.05;

        return {
            revenues: revenuesList,
            expenses: expensesList,
            totalRevenues: totalRev,
            totalExpenses: totalExp,
            netProfit: netProf,
            grossProfitMargin: grossMargin,
            currentAssets: currentAssetsList,
            fixedAssets: fixedAssetsList,
            totalAssets: totalAss,
            currentLiabilities: currentLiabilitiesList,
            longTermLiabilities: longTermLiabilitiesList,
            totalLiabilities: totalLiab,
            equityItems: equityList,
            totalEquity: totalEq,
            totalLiabilitiesAndEquity: totalLiabAndEq,
            isBalanced: isBal,
            balanceDiff: diff
        };
    }, [rawData, startDate, endDate]);

    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Sheet: Income Statement
        const incomeRows = [
            { 'البند': '=== الإيرادات ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...revenues.map(r => ({ 'البند': r.name, 'كود الحساب': r.code, 'المبلغ (SAR)': Number(r.balance.toFixed(2)) })),
            { 'البند': 'إجمالي الإيرادات', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalRevenues.toFixed(2)) },
            { 'البند': '', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            { 'البند': '=== المصروفات ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...expenses.map(e => ({ 'البند': e.name, 'كود الحساب': e.code, 'المبلغ (SAR)': Number(e.balance.toFixed(2)) })),
            { 'البند': 'إجمالي المصروفات', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalExpenses.toFixed(2)) },
            { 'البند': '', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            { 'البند': 'صافي الدخل / الربح', 'كود الحساب': '-', 'المبلغ (SAR)': Number(netProfit.toFixed(2)) },
            { 'البند': 'هامش الربح %', 'كود الحساب': '-', 'المبلغ (SAR)': `${grossProfitMargin.toFixed(1)}%` }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeRows), "قائمة الدخل");

        // 2. Sheet: Balance Sheet
        const balanceRows = [
            { 'البند': '=== الأصول المتداولة ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...currentAssets.map(a => ({ 'البند': a.name, 'كود الحساب': a.code, 'المبلغ (SAR)': Number(a.balance.toFixed(2)) })),
            { 'البند': '=== الأصول الثابتة ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...fixedAssets.map(a => ({ 'البند': a.name, 'كود الحساب': a.code, 'المبلغ (SAR)': Number(a.balance.toFixed(2)) })),
            { 'البند': 'إجمالي الأصول', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalAssets.toFixed(2)) },
            { 'البند': '', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            { 'البند': '=== الالتزامات المتداولة ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...currentLiabilities.map(l => ({ 'البند': l.name, 'كود الحساب': l.code, 'المبلغ (SAR)': Number(l.balance.toFixed(2)) })),
            { 'البند': '=== الالتزامات طويلة الأجل ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...longTermLiabilities.map(l => ({ 'البند': l.name, 'كود الحساب': l.code, 'المبلغ (SAR)': Number(l.balance.toFixed(2)) })),
            { 'البند': 'إجمالي الالتزامات', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalLiabilities.toFixed(2)) },
            { 'البند': '', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            { 'البند': '=== حقوق الملكية ===', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            ...equityItems.map(eq => ({ 'البند': eq.name, 'كود الحساب': eq.code, 'المبلغ (SAR)': Number(eq.balance.toFixed(2)) })),
            { 'البند': 'صافي دخل الفترة الحالية', 'كود الحساب': '-', 'المبلغ (SAR)': Number(netProfit.toFixed(2)) },
            { 'البند': 'إجمالي حقوق الملكية', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalEquity.toFixed(2)) },
            { 'البند': '', 'كود الحساب': '', 'المبلغ (SAR)': '' },
            { 'البند': 'إجمالي الالتزامات وحقوق الملكية', 'كود الحساب': '-', 'المبلغ (SAR)': Number(totalLiabilitiesAndEquity.toFixed(2)) },
            { 'البند': 'حالة توازن الميزانية', 'كود الحساب': '-', 'المبلغ (SAR)': isBalanced ? 'متزنة تماماً' : `فارق: ${balanceDiff.toFixed(2)}` }
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balanceRows), "الميزانية العمومية");

        XLSX.writeFile(wb, `Financial_Statements_${startDate}_to_${endDate}.xlsx`);
        showGlobalToast("✅ تم تصدير القوائم المالية إلى Excel بنجاح", 'success');
    };

    return {
        startDate, setStartDate,
        endDate, setEndDate,
        activeTab, setActiveTab,
        setPeriodPreset,
        // Income statement
        revenues, expenses, totalRevenues, totalExpenses, netProfit, grossProfitMargin,
        // Balance sheet
        currentAssets, fixedAssets, totalAssets,
        currentLiabilities, longTermLiabilities, totalLiabilities,
        equityItems, totalEquity, totalLiabilitiesAndEquity,
        isBalanced, balanceDiff,
        isLoading: statementsQuery.isLoading,
        refetch: statementsQuery.refetch,
        exportToExcel
    };
}
