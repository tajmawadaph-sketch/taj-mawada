"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { ACC } from '@/lib/account-ids';

export function useKpisLogic() {
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const setQuickDateRange = (range: 'today' | 'this_month' | 'quarter' | 'year' | 'all') => {
        const now = new Date();
        if (range === 'all') {
            setDateFrom('');
            setDateTo('');
            return;
        }
        if (range === 'today') {
            const todayStr = now.toISOString().split('T')[0];
            setDateFrom(todayStr);
            setDateTo(todayStr);
            return;
        }
        if (range === 'this_month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
            setDateFrom(start);
            setDateTo(end);
            return;
        }
        if (range === 'quarter') {
            const qMonth = Math.floor(now.getMonth() / 3) * 3;
            const start = new Date(now.getFullYear(), qMonth, 1).toISOString().split('T')[0];
            const end = new Date(now.getFullYear(), qMonth + 3, 0).toISOString().split('T')[0];
            setDateFrom(start);
            setDateTo(end);
            return;
        }
        if (range === 'year') {
            const start = `${now.getFullYear()}-01-01`;
            const end = `${now.getFullYear()}-12-31`;
            setDateFrom(start);
            setDateTo(end);
            return;
        }
    };

    const invoicesQuery = useQuery({
        queryKey: ['kpis_invoices', dateFrom, dateTo],
        queryFn: async () => {
            let q = supabase.from('invoices').select('total_amount, date, status')
                .neq('status', 'مسودة')
                .neq('status', 'ملغاة')
                .neq('status', 'draft')
                .neq('status', 'cancelled');
            if (dateFrom) q = q.gte('date', dateFrom);
            if (dateTo) q = q.lte('date', dateTo);
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }
    });

    const receiptsQuery = useQuery({
        queryKey: ['kpis_receipts', dateFrom, dateTo],
        queryFn: async () => {
            let q = supabase.from('receipt_vouchers')
                .select('amount, date, status')
                .in('status', ['مرحل', 'معتمد', 'posted', 'approved']);
            if (dateFrom) q = q.gte('date', dateFrom);
            if (dateTo) q = q.lte('date', dateTo);
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }
    });

    const clientsQuery = useQuery({
        queryKey: ['kpis_clients'],
        queryFn: async () => {
            // جلب الحسابات التابعة للعملاء ديناميكياً
            const { data: arAccounts } = await supabase.from('accounts')
                .select('id')
                .or(`id.eq.${ACC.CUSTOMERS_AR},code.like.123%`);
            
            const arIds = (arAccounts && arAccounts.length > 0)
                ? arAccounts.map(a => a.id)
                : [ACC.CUSTOMERS_AR];

            const { data, error } = await supabase.from('journal_lines')
                .select('debit, credit')
                .in('account_id', arIds);
            if (error) throw error;
            return data || [];
        }
    });

    const rawInvoices = invoicesQuery.data || [];
    const rawReceipts = receiptsQuery.data || [];
    const rawClientsLines = clientsQuery.data || [];

    const {
        totalSales,
        invoicesCount,
        totalCollections,
        receiptsCount,
        totalOutstandingDebts,
        collectionRate,
        debtToSalesRatio
    } = useMemo(() => {
        // Calculate Sales
        const totalSales = rawInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0);
        const invoicesCount = rawInvoices.length;
        
        // Calculate Collections
        const totalCollections = rawReceipts.reduce((sum, rec) => sum + Number(rec.amount || 0), 0);
        const receiptsCount = rawReceipts.length;

        // Calculate Outstanding Debts (AR Debit - AR Credit)
        const totalOutstandingDebts = rawClientsLines.reduce((sum, line) => sum + (Number(line.debit || 0) - Number(line.credit || 0)), 0);

        // Collection Rate against Sales
        const collectionRateNum = totalSales > 0 ? (totalCollections / totalSales) * 100 : 0;
        const debtToSalesRatioNum = totalSales > 0 ? (totalOutstandingDebts / totalSales) * 100 : 0;

        return {
            totalSales,
            invoicesCount,
            totalCollections,
            receiptsCount,
            totalOutstandingDebts,
            collectionRate: Math.min(collectionRateNum, 100).toFixed(1),
            debtToSalesRatio: debtToSalesRatioNum.toFixed(1)
        };
    }, [rawInvoices, rawReceipts, rawClientsLines]);

    return {
        dateFrom,
        setDateFrom,
        dateTo,
        setDateTo,
        setQuickDateRange,
        totalSales,
        invoicesCount,
        totalCollections,
        receiptsCount,
        totalOutstandingDebts,
        collectionRate,
        debtToSalesRatio,
        isLoading: invoicesQuery.isLoading || receiptsQuery.isLoading || clientsQuery.isLoading
    };
}
