"use client";
import { useState, useMemo, useDeferredValue, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';
import { fetchPaginatedData } from '@/lib/supabase-pagination';
import { useRealtimeInvalidate } from '@/lib/useRealtimeSync';
import { useAuth } from '@/components/authGuard';
import { notifyVoucherCreated } from '@/lib/notificationService';
import { ACC } from '@/lib/account-ids';
import * as XLSX from 'xlsx';

export function useReceiptVouchersLogic() {
    const queryClient = useQueryClient();
    const { showToast } = useToast();

    // 🔄 تحديث فوري ذكي
    useRealtimeInvalidate(['receipt_vouchers', 'invoices'], ['receipt_vouchers', 'invoices']);

    // 🎯 دالة لتحديث الكاش لحظياً (Optimistic UI)
    const updateRowsInCache = (targetIds: any[], updatedFields: any) => {
        queryClient.setQueryData(['receipt_vouchers'], (oldData: any[]) => {
            if (!oldData) return [];
            const stringIds = targetIds.map(String);
            return oldData.map(row => stringIds.includes(String(row.id)) ? { ...row, ...updatedFields } : row);
        });
    };

    const [globalSearch, setGlobalSearch] = useState('');
    const deferredSearch = useDeferredValue(globalSearch);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentRecord, setCurrentRecord] = useState<any>({});
    const [focusedIndex, setFocusedIndex] = useState(-1);

    // Filter states
    const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'draft'>('all');
    const [categoryFilter, setCategoryFilter] = useState<'all' | 'customers' | 'delegates'>('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Print modal states
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [selectedRecordForPrint, setSelectedRecordForPrint] = useState<any>(null);

    // 🚀 State الخاصة بالتصحيح المجمع لحسابات السندات
    const [isBulkFixModalOpen, setIsBulkFixModalOpen] = useState(false);
    const [bulkFixAccounts, setBulkFixAccounts] = useState({ safe_bank_acc_name: '', safe_bank_acc_id: null, partner_acc_name: '', partner_acc_id: null });

    const [permissions] = useState({ canAdd: true, canEdit: true, canDelete: true, canPost: true, canUnpost: true });

    const canUserEdit = (record: any) => {
        if (!record || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(record.status || '').trim().toLowerCase()) || record.is_posted) return false; 
        return permissions.canEdit;
    };

    // =========================================================================
    // 📥 جلب البيانات (Data Fetching)
    // =========================================================================
    const { profile } = useAuth();
    
    const { data: allData = [], isLoading } = useQuery({
        queryKey: ['receipt_vouchers'],
        staleTime: 0,
        queryFn: async () => {
            const buildQuery = () => {
                let q = supabase
                    .from('receipt_vouchers')
                    .select(`*, partners!receipt_vouchers_partner_id_fkey(name), invoices(invoice_number)`)
                    .order('date', { ascending: false })
                    .order('created_at', { ascending: false });
                
                if (profile) {
                    const role = String(profile.role || '').toLowerCase();
                    const isGlobalAdmin = role === 'admin' || role === 'super_admin' || role === 'manager' || profile.is_admin === true;
                    if (!isGlobalAdmin && profile.linked_partner_id) {
                        q = q.or(`delegate_id.eq.${profile.linked_partner_id},partner_id.eq.${profile.linked_partner_id}`);
                    }
                }
                return q;
            };

            const rec = await fetchPaginatedData(buildQuery, 'id');
            return rec || [];
        },
        enabled: !!profile
    });

    const { data: delegates = [] } = useQuery({
        queryKey: ['delegates'],
        queryFn: async () => {
            const { data, error } = await supabase.from('partners').select('*').eq('partner_type', 'مندوب');
            if (error) throw error;
            return data || [];
        }
    });

    const { data: fleetOperations = [] } = useQuery({
        queryKey: ['fleet_operations_open'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('fleet_operations')
                .select('id, operation_number, operation_date, status, vehicle_id, description, vehicle:fleet_vehicles(plate_number), driver:partners(name)')
                .neq('status', 'مغلق')
                .neq('status', 'closed')
                .order('operation_date', { ascending: false });
            if (error) throw error;
            return data?.map((op: any) => ({
                id: op.id,
                operation_number: op.operation_number,
                status: op.status,
                vehicle_id: op.vehicle_id,
                name: `🚚 ${op.operation_number} | ${op.driver?.name ? `مندوب: ${op.driver.name}` : 'بدون مندوب'} | ${op.vehicle?.plate_number ? `سيارة: ${op.vehicle.plate_number}` : ''} ${op.description ? `(${op.description})` : ''}`
            })) || [];
        }
    });

    // =========================================================================
    // ⚙️ المعالجة والفلاتر (Filtering)
    // =========================================================================
    const allFiltered = useMemo(() => {
        return allData.filter(rec => {
            const searchStr = (deferredSearch || '').toLowerCase().trim();
            const matchesSearch = !searchStr || (
                rec.receipt_number?.toLowerCase().includes(searchStr) || 
                rec.partners?.name?.toLowerCase().includes(searchStr) ||
                rec.notes?.toLowerCase().includes(searchStr) ||
                rec.reference_number?.toLowerCase().includes(searchStr) ||
                rec.amount?.toString().includes(searchStr)
            );

            // Status filter
            const isPosted = ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(rec.status || '').trim().toLowerCase()) || rec.is_posted;
            let matchesStatus = true;
            if (statusFilter === 'posted') matchesStatus = isPosted;
            else if (statusFilter === 'draft') matchesStatus = !isPosted;

            // Category filter
            let matchesCategory = true;
            if (categoryFilter === 'delegates') matchesCategory = !!rec.delegate_id || !!rec.fleet_operation_id;
            else if (categoryFilter === 'customers') matchesCategory = !rec.delegate_id && !rec.fleet_operation_id;

            // Date filters
            let matchesDate = true;
            if (dateFrom && rec.date) matchesDate = matchesDate && new Date(rec.date) >= new Date(dateFrom);
            if (dateTo && rec.date) matchesDate = matchesDate && new Date(rec.date) <= new Date(dateTo);

            return matchesSearch && matchesStatus && matchesCategory && matchesDate;
        });
    }, [allData, deferredSearch, statusFilter, categoryFilter, dateFrom, dateTo]);

    useEffect(() => { setCurrentPage(1); }, [deferredSearch, rowsPerPage, statusFilter, categoryFilter, dateFrom, dateTo]);

    const receipts = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return allFiltered.slice(start, start + rowsPerPage);
    }, [allFiltered, currentPage, rowsPerPage]);

    const kpis = useMemo(() => {
        const postedVouchers = allFiltered.filter(i => ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) || i.is_posted);
        const pendingVouchers = allFiltered.filter(i => !['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) && !i.is_posted);
        const delegateVouchers = allFiltered.filter(i => !!i.delegate_id || !!i.fleet_operation_id);

        return {
            total: allFiltered.length,
            posted: postedVouchers.length,
            pending: pendingVouchers.length,
            delegateCount: delegateVouchers.length,
            totalAmount: allFiltered.reduce((sum, r) => sum + Number(r.amount || 0), 0),
            postedAmount: postedVouchers.reduce((sum, r) => sum + Number(r.amount || 0), 0),
            delegateAmount: delegateVouchers.reduce((sum, r) => sum + Number(r.amount || 0), 0)
        };
    }, [allFiltered]);

    // =========================================================================
    // 🚀 طابور العمليات (RPC Operations & Mutations)
    // =========================================================================

    const saveMutation = useMutation({
        mutationFn: async (record: any) => {
            const cleanId = (id: any) => (id && typeof id === 'string' && id.trim() !== '') ? id : null;
            const amount = Number(record.amount || 0);
            
            if (amount <= 0) throw new Error("يجب أن يكون المبلغ أكبر من صفر");

            // Smart fallback for default accounts
            const defaultSafe = (record.payment_method?.includes('بنك') || record.payment_method?.includes('تحويل') || record.payment_method?.includes('شبكة') || record.payment_method?.includes('مدى'))
                ? ACC.BANK_ALRAJHI
                : ACC.CASH_BOX;

            const defaultPartnerAcc = record.delegate_id ? ACC.EMPLOYEE_CUSTODY : ACC.CUSTOMERS_AR;

            const voucherData = {
                receipt_number: record.receipt_number || `RV-${Date.now().toString().slice(-6)}`, 
                date: record.date || new Date().toISOString().split('T')[0],
                payment_method: record.payment_method || 'نقدي (كاش)',
                amount: amount, 
                invoice_id: cleanId(record.invoice_id),
                partner_id: cleanId(record.partner_id),
                fleet_operation_id: cleanId(record.fleet_operation_id),
                job_order_id: cleanId(record.job_order_id),
                delegate_id: cleanId(record.delegate_id),
                safe_bank_acc_id: cleanId(record.safe_bank_acc_id) || defaultSafe,
                partner_acc_id: cleanId(record.partner_acc_id) || defaultPartnerAcc,
                reference_number: record.reference_number || null,
                attachment_url: record.attachment_url || null,
                notes: record.notes || null,
                status: record.status || 'مسودة'
            };

            if (record.id) {
                const { error } = await supabase.from('receipt_vouchers').update(voucherData).eq('id', record.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('receipt_vouchers').insert([voucherData]);
                if (error) throw error;

                // 🔔 بث إشعار سند القبض في النظام وعبر الجوال
                notifyVoucherCreated({
                    voucherType: 'receipt',
                    voucherNumber: voucherData.receipt_number,
                    amount: Number(voucherData.amount) || 0,
                    partnerName: record.partner_name || record.partners?.name || ''
                }).catch(() => {});
            }

        },
        onSuccess: () => {
            setIsEditModalOpen(false);
            showToast("تم حفظ سند القبض بنجاح 💾", "success");
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
            queryClient.invalidateQueries({ queryKey: ['cash_flows_list'] });
        },
        onError: (err: any) => showToast(`خطأ أثناء الحفظ: ${err.message}`, "error")
    });

    // 🛡️ ترحيل مباشر لسندات القبض آلياً إلى دفتر اليومية
    const directPostReceipts = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('post_receipts_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        const { data: rvs } = await supabase.from('receipt_vouchers').select('*').in('id', ids);
        for (const rv of (rvs || [])) {
            if (rv.status === 'معتمد' || rv.is_posted) continue;

            const entryDate = rv.date || new Date().toISOString().split('T')[0];
            const amt = Number(rv.amount || 0);
            if (amt <= 0) continue;

            const { data: jh, error: jhErr } = await supabase.from('journal_headers').insert([{
                entry_date: entryDate,
                description: `سند قبض رقم ${rv.receipt_number || rv.id} - ${rv.notes || 'تحصيل نقدي'}`,
                reference_id: rv.id,
                v_type: 'receipt',
                status: 'posted',
                fleet_operation_id: rv.fleet_operation_id || null
            }]).select().single();

            if (jhErr || !jh) continue;

            // Resolve accounts
            const safeAccId = rv.safe_bank_acc_id || (
                (rv.payment_method?.includes('بنك') || rv.payment_method?.includes('تحويل') || rv.payment_method?.includes('شبكة') || rv.payment_method?.includes('مدى'))
                    ? ACC.BANK_ALRAJHI
                    : ACC.CASH_BOX
            );

            const partnerAccId = rv.partner_acc_id || (
                rv.delegate_id ? ACC.EMPLOYEE_CUSTODY : ACC.CUSTOMERS_AR
            );

            const lines: any[] = [
                {
                    header_id: jh.id,
                    account_id: safeAccId,
                    partner_id: rv.partner_id || null,
                    debit: amt,
                    credit: 0,
                    notes: `توريد خزانة/بنك لسند قبض #${rv.receipt_number || ''}`,
                    fleet_operation_id: rv.fleet_operation_id || null,
                    delegate_id: rv.delegate_id || null
                },
                {
                    header_id: jh.id,
                    account_id: partnerAccId,
                    partner_id: rv.partner_id || null,
                    debit: 0,
                    credit: amt,
                    notes: rv.delegate_id ? `توريد عهدة مندوب سند قبض #${rv.receipt_number || ''}` : `سداد عميل سند قبض #${rv.receipt_number || ''}`,
                    fleet_operation_id: rv.fleet_operation_id || null,
                    delegate_id: rv.delegate_id || null
                }
            ];

            await supabase.from('journal_lines').insert(lines);
            await supabase.from('receipt_vouchers').update({ status: 'معتمد', is_posted: true }).eq('id', rv.id);
        }
    };

    const directUnpostReceipts = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('unpost_receipts_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        const { data: headers } = await supabase.from('journal_headers').select('id').in('reference_id', ids);
        if (headers && headers.length > 0) {
            const headerIds = headers.map(h => h.id);
            await supabase.from('journal_lines').delete().in('header_id', headerIds);
            await supabase.from('journal_headers').delete().in('id', headerIds);
        }
        await supabase.from('receipt_vouchers').update({ status: 'مسودة', is_posted: false }).in('id', ids);
    };

    const directDeleteReceipts = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('delete_receipts_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        await directUnpostReceipts(ids);
        await supabase.from('receipt_vouchers').delete().in('id', ids);
    };

    const postMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            const previousData = queryClient.getQueryData(['receipt_vouchers']);
            updateRowsInCache(selectedIds, { status: 'معتمد' });

            try {
                await directPostReceipts(selectedIds);
            } catch (error) {
                queryClient.setQueryData(['receipt_vouchers'], previousData);
                throw error;
            }
        },
        onSuccess: () => {
            setSelectedIds([]);
            showToast("تم الاعتماد والترحيل إلى شجرة الحسابات بنجاح ✅", "success");
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] });
            queryClient.invalidateQueries({ queryKey: ['cash_flows_list'] });
        },
        onError: (err: any) => showToast(`خطأ أثناء الترحيل: ${err.message}`, "error")
    });

    const unpostMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            const previousData = queryClient.getQueryData(['receipt_vouchers']);
            updateRowsInCache(selectedIds, { status: 'مسودة' });

            try {
                await directUnpostReceipts(selectedIds);
            } catch (error) {
                queryClient.setQueryData(['receipt_vouchers'], previousData);
                throw error;
            }
        },
        onSuccess: () => {
            setSelectedIds([]);
            showToast("تم فك الترحيل بنجاح 🔴", "warning");
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] });
            queryClient.invalidateQueries({ queryKey: ['cash_flows_list'] });
        },
        onError: (err: any) => showToast(`خطأ أثناء الإلغاء: ${err.message}`, "error")
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            const previousData = queryClient.getQueryData(['receipt_vouchers']);
            queryClient.setQueryData(['receipt_vouchers'], (old: any[]) => old?.filter(v => !selectedIds.includes(String(v.id))));

            try {
                await directDeleteReceipts(selectedIds);
            } catch (error) {
                queryClient.setQueryData(['receipt_vouchers'], previousData);
                throw error;
            }
        },
        onSuccess: () => {
            setSelectedIds([]);
            showToast("تم الحذف بنجاح 🗑️", "success");
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
        },
        onError: (err: any) => showToast(`خطأ في الحذف: ${err.message}`, "error")
    });

    // 💎 ميزة التصحيح المجمع للسندات (Bulk Fix)
    const bulkFixMutation = useMutation({
        mutationFn: async () => {
            if (selectedIds.length === 0 || (!bulkFixAccounts.safe_bank_acc_id && !bulkFixAccounts.partner_acc_id)) {
                throw new Error("يرجى تحديد حساب واحد على الأقل للتحديث");
            }
            
            const updatePayload: any = {};
            if (bulkFixAccounts.safe_bank_acc_id) updatePayload.safe_bank_acc_id = bulkFixAccounts.safe_bank_acc_id;
            if (bulkFixAccounts.partner_acc_id) updatePayload.partner_acc_id = bulkFixAccounts.partner_acc_id;

            const CHUNK_SIZE = 50; 
            for (let i = 0; i < selectedIds.length; i += CHUNK_SIZE) {
                const chunk = selectedIds.slice(i, i + CHUNK_SIZE);
                const { error } = await supabase.from('receipt_vouchers').update(updatePayload).in('id', chunk).eq('status', 'مسودة'); 
                if (error) throw new Error(error.message);
            }
        },
        onSuccess: () => {
            setIsBulkFixModalOpen(false); 
            setBulkFixAccounts({ safe_bank_acc_name: '', safe_bank_acc_id: null, partner_acc_name: '', partner_acc_id: null });
            setSelectedIds([]); 
            showToast(`✅ تم تصحيح الحسابات وتوجيه السندات بنجاح!`, 'success');
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] });
        },
        onError: (err: any) => showToast(`خطأ أثناء التصحيح: ${err.message}`, 'error')
    });

    // Export to Excel
    const exportToExcel = () => {
        const wb = XLSX.utils.book_new();
        const rows = allFiltered.map((rv, idx) => ({
            '#': idx + 1,
            'رقم السند': rv.receipt_number || '---',
            'التاريخ': rv.date || '---',
            'العميل / الجهة': rv.partners?.name || (rv.invoices?.invoice_number ? `فاتورة #${rv.invoices.invoice_number}` : (rv.notes || 'عميل نقدي')),
            'المبلغ (ر.س)': Number(rv.amount || 0),
            'طريقة الدفع': rv.payment_method || 'نقدي',
            'الحالة': ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(rv.status || '').trim().toLowerCase()) || rv.is_posted ? 'معتمد' : 'مسودة',
            'المرجع': rv.reference_number || '---',
            'المندوب': rv.delegate_id ? 'نعم (عهدة مندوب)' : '---',
            'البيان': rv.notes || '---'
        }));

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "سندات_القبض");
        XLSX.writeFile(wb, `Receipt_Vouchers_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // التنقل بالكيبورد
    const handleTableKeyDown = (e: React.KeyboardEvent) => {
        if (isEditModalOpen || isBulkFixModalOpen || isPrintModalOpen) return; 
        switch (e.key) {
            case 'ArrowDown': e.preventDefault(); setFocusedIndex(prev => (prev < receipts.length - 1 ? prev + 1 : prev)); break;
            case 'ArrowUp': e.preventDefault(); setFocusedIndex(prev => (prev > 0 ? prev - 1 : prev)); break;
            case ' ': e.preventDefault(); if (focusedIndex !== -1) { const id = receipts[focusedIndex].id; setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]); } break;
            case 'Enter': e.preventDefault(); if (focusedIndex !== -1) { const record = receipts[focusedIndex]; if (canUserEdit(record)) { setCurrentRecord(record); setIsEditModalOpen(true); } } break;
        }
    };

    const isTotalSaving = saveMutation.isPending || postMutation.isPending || unpostMutation.isPending || deleteMutation.isPending || bulkFixMutation.isPending;

    return {
        receipts, allFiltered, isLoading, globalSearch, setGlobalSearch,
        selectedIds, setSelectedIds, currentPage, setCurrentPage,
        rowsPerPage, setRowsPerPage, kpis, isEditModalOpen, setIsEditModalOpen,
        currentRecord, setCurrentRecord, 
        
        // Filters
        statusFilter, setStatusFilter,
        categoryFilter, setCategoryFilter,
        dateFrom, setDateFrom,
        dateTo, setDateTo,

        // Print modal
        isPrintModalOpen, setIsPrintModalOpen,
        selectedRecordForPrint, setSelectedRecordForPrint,
        handlePrintVoucher: (record: any) => {
            setSelectedRecordForPrint(record);
            setIsPrintModalOpen(true);
        },

        // Export
        exportToExcel,
        
        // 🚀 أدوات ميزة التصحيح المجمع
        delegates, fleetOperations,
        isBulkFixModalOpen, setIsBulkFixModalOpen,
        bulkFixAccounts, setBulkFixAccounts,
        handleBulkFixSave: () => bulkFixMutation.mutate(),
        
        handleAddNew: () => { 
            if (!permissions.canAdd) return showToast("ليست لديك صلاحية الإضافة", "error");
            setCurrentRecord({ date: new Date().toISOString().split('T')[0], payment_method: 'نقدي (كاش)', status: 'مسودة', amount: 0 }); 
            setIsEditModalOpen(true); 
        }, 
        handleEdit: (rec: any) => { 
            if (canUserEdit(rec)) { setCurrentRecord(rec); setIsEditModalOpen(true); }
            else showToast("لا يمكن تعديل سند معتمد. قم بفك الترحيل أولاً.", "warning");
        }, 
        
        handleSave: (record: any) => {
            if (record && (record.status === 'مرحل' || record.status === 'معتمد' || record.is_posted)) {
                return showToast("⚠️ لا يمكن تعديل سجل مرحل. يرجى فك الترحيل أولاً.", "error");
            }
            saveMutation.mutate(record);
        }, 
        handlePostSelected: () => { 
            if (permissions.canPost) {
                postMutation.mutate(); 
            } else {
                showToast("ليس لديك صلاحية الترحيل", "error");
            }
        }, 
        handleUnpostSelected: () => { 
            if (permissions.canUnpost) {
                unpostMutation.mutate(); 
            } else {
                showToast("ليس لديك صلاحية فك الترحيل", "error");
            }
        },
        handleDeleteSelected: () => { 
            const posted = receipts.filter((r: any) => selectedIds.includes(String(r.id)) && (r.status === 'مرحل' || r.status === 'معتمد' || r.is_posted));
            if (posted.length > 0) {
                return showToast("⚠️ لا يمكن حذف سجلات مرحلة. يرجى فك الترحيل أولاً.", "error");
            }
            if (confirm("تأكيد الحذف النهائي للسندات المحددة؟")) deleteMutation.mutate(); 
        }, 
        
        focusedIndex, setFocusedIndex, handleTableKeyDown,
        permissions, canUserEdit, isSaving: isTotalSaving
    };
}
