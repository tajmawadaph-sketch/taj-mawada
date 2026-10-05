"use client";
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import * as XLSX from 'xlsx';
import { showGlobalToast } from '@/lib/toast-context';

export interface TrialBalanceRecord {
    account_id: string;
    account_code: string;
    account_name: string;
    opening_debit: number;
    opening_credit: number;
    period_debit: number;
    period_credit: number;
    ending_debit: number;
    ending_credit: number;
    has_activity: boolean;
    level?: number;
}

export function useTrialBalanceLogic() {
    const [rawRecords, setRawRecords] = useState<TrialBalanceRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [hideZeroBalances, setHideZeroBalances] = useState(true);
    const [accountLevel, setAccountLevel] = useState<'all' | '1' | '2' | '3'>('all');
    
    // افتراضياً: بداية الشهر الحالي حتى نهايته
    const [startDate, setStartDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().split('T')[0]
    );

    const setQuickDateRange = (range: 'today' | 'this_month' | 'quarter' | 'year' | 'all') => {
        const now = new Date();
        if (range === 'all') {
            setStartDate('');
            setEndDate('');
            return;
        }
        if (range === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            setStartDate(todayStr);
            setEndDate(todayStr);
            return;
        }
        if (range === 'this_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            setStartDate(start);
            setEndDate(end);
            return;
        }
        if (range === 'quarter') {
            const qMonth = Math.floor(now.getMonth() / 3) * 3;
            const start = new Date(now.getFullYear(), qMonth, 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), qMonth + 3, 0).toISOString().split('T')[0];
            setStartDate(start);
            setEndDate(end);
            return;
        }
        if (range === 'year') {
            const start = `${now.getFullYear()}-01-01`;
            const end = `${now.getFullYear()}-12-31`;
            setStartDate(start);
            setEndDate(end);
            return;
        }
    };

    const fetchTrialBalance = async () => {
        setIsLoading(true);
        try {
            let trialData: TrialBalanceRecord[] | null = null;
            try {
                const { data, error } = await supabase.rpc('get_trial_balance', {
                    p_start_date: startDate,
                    p_end_date: endDate
                });
                if (!error && Array.isArray(data) && data.length > 0) {
                    trialData = data;
                }
            } catch (rpcErr) {
                console.warn("Trial balance RPC not available, using robust ledger aggregation:", rpcErr);
            }

            // 🛡️ Fallback المباشر: حساب ميزان المراجعة من الدفاتر مباشرة
            if (!trialData) {
                const [accountsRes, linesRes, headersRes] = await Promise.all([
                    supabase.from('accounts').select('id, code, name, is_transactional, parent_id').order('code'),
                    supabase.from('journal_lines').select('header_id, account_id, debit, credit'),
                    supabase.from('journal_headers').select('id, entry_date, status')
                ]);

                const accounts = accountsRes.data || [];
                const lines = linesRes.data || [];
                const headers = headersRes.data || [];
                const headerMap = new Map(headers.map((h: any) => [h.id, h]));

                const accMap = new Map<string, TrialBalanceRecord>();
                accounts.forEach(a => {
                    const codeStr = String(a.code || '');
                    let level = 4;
                    if (codeStr.length === 1) level = 1;
                    else if (codeStr.length === 2) level = 2;
                    else if (codeStr.length <= 4) level = 3;

                    accMap.set(a.id, {
                        account_id: a.id,
                        account_code: a.code || '---',
                        account_name: a.name || '---',
                        opening_debit: 0,
                        opening_credit: 0,
                        period_debit: 0,
                        period_credit: 0,
                        ending_debit: 0,
                        ending_credit: 0,
                        has_activity: false,
                        level
                    });
                });

                lines.forEach((l: any) => {
                    const row = accMap.get(l.account_id);
                    if (!row) return;
                    const h = headerMap.get(l.header_id);
                    const date = h?.entry_date || '';
                    if (endDate && date > endDate) return;

                    const d = Number(l.debit || 0);
                    const c = Number(l.credit || 0);
                    if (d !== 0 || c !== 0) row.has_activity = true;

                    if (startDate && date < startDate) {
                        row.opening_debit += d;
                        row.opening_credit += c;
                    } else if ((!startDate || date >= startDate) && (!endDate || date <= endDate)) {
                        row.period_debit += d;
                        row.period_credit += c;
                    }
                });

                trialData = Array.from(accMap.values())
                    .map(r => {
                        const totalDebit = r.opening_debit + r.period_debit;
                        const totalCredit = r.opening_credit + r.period_credit;
                        return {
                            ...r,
                            ending_debit: totalDebit,
                            ending_credit: totalCredit
                        };
                    });
            }

            setRawRecords(trialData || []);
            
        } catch (err: any) {
            console.error("Error fetching Trial Balance:", err.message);
            showGlobalToast("❌ حدث خطأ أثناء جلب ميزان المراجعة", 'warning');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTrialBalance();
    }, [startDate, endDate]);

    // تصفية السجلات حسب المستوى والبحث وتجاهل الأرصدة الصفرية
    const records = useMemo(() => {
        let list = [...rawRecords];

        // 1. تصفية المستوى المحاسبي
        if (accountLevel === '1') {
            list = list.filter(r => String(r.account_code).length === 1);
        } else if (accountLevel === '2') {
            list = list.filter(r => String(r.account_code).length <= 2);
        } else if (accountLevel === '3') {
            list = list.filter(r => String(r.account_code).length <= 4);
        }

        // 2. إخفاء الأرصدة الصفرية إن طُلب
        if (hideZeroBalances) {
            list = list.filter(r => 
                r.opening_debit !== 0 || r.opening_credit !== 0 ||
                r.period_debit !== 0 || r.period_credit !== 0 ||
                r.ending_debit !== 0 || r.ending_credit !== 0 ||
                r.has_activity
            );
        }

        // 3. البحث بالاسم أو الرقم
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(r => 
                r.account_code.toLowerCase().includes(q) ||
                r.account_name.toLowerCase().includes(q)
            );
        }

        return list;
    }, [rawRecords, accountLevel, hideZeroBalances, searchQuery]);

    // حساب إجماليات الميزان بدقة
    const totals = useMemo(() => {
        return records.reduce((acc, r) => {
            acc.op_debit += Number(r.opening_debit) || 0;
            acc.op_credit += Number(r.opening_credit) || 0;
            acc.per_debit += Number(r.period_debit) || 0;
            acc.per_credit += Number(r.period_credit) || 0;
            acc.end_debit += Number(r.ending_debit) || 0;
            acc.end_credit += Number(r.ending_credit) || 0;
            return acc;
        }, { op_debit: 0, op_credit: 0, per_debit: 0, per_credit: 0, end_debit: 0, end_credit: 0 });
    }, [records]);

    // مطابقة اتزان الميزان آلياً (تسامح حتى 0.05 هللة للكسور العشرية)
    const balanceDiff = useMemo(() => {
        const opDiff = Math.abs(totals.op_debit - totals.op_credit);
        const perDiff = Math.abs(totals.per_debit - totals.per_credit);
        const endDiff = Math.abs(totals.end_debit - totals.end_credit);
        return {
            opDiff,
            perDiff,
            endDiff,
            maxDiff: Math.max(opDiff, perDiff, endDiff),
            isBalanced: Math.max(opDiff, perDiff, endDiff) < 0.05
        };
    }, [totals]);

    // تصدير رسمي للإكسيل
    const exportToExcel = () => {
        const dataToExport = records.map(r => ({
            "رقم الحساب": r.account_code,
            "اسم الحساب": r.account_name,
            "رصيد افتتاحي (مدين)": Number(r.opening_debit) || 0,
            "رصيد افتتاحي (دائن)": Number(r.opening_credit) || 0,
            "حركة الفترة (مدين)": Number(r.period_debit) || 0,
            "حركة الفترة (دائن)": Number(r.period_credit) || 0,
            "الرصيد الختامي (مدين)": Number(r.ending_debit) || 0,
            "الرصيد الختامي (دائن)": Number(r.ending_credit) || 0,
        }));

        const ws = XLSX.utils.json_to_sheet(dataToExport);
        ws['!cols'] = [{ wch: 15 }, { wch: 35 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "ميزان المراجعة");
        XLSX.writeFile(wb, `ميزان_المراجعة_${startDate || 'بداية'}_إلى_${endDate || 'نهاية'}.xlsx`);
    };

    return {
        records,
        rawRecordsCount: rawRecords.length,
        isLoading,
        startDate, setStartDate,
        endDate, setEndDate,
        totals,
        balanceDiff,
        isBalanced: balanceDiff.isBalanced,
        searchQuery, setSearchQuery,
        hideZeroBalances, setHideZeroBalances,
        accountLevel, setAccountLevel,
        setQuickDateRange,
        fetchTrialBalance,
        exportToExcel
    };
}
