"use client";
import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { supabase } from '@/lib/supabase'; 
import { useRouter } from 'next/navigation';
import { useToast } from '@/lib/toast-context'; 
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; 
import { fetchPaginatedData } from '@/lib/supabase-pagination';
import { getInvoiceSummaryAndAging } from '@/lib/helpers';
import { useRealtimeInvalidate } from '@/lib/useRealtimeSync';
import { useAuth } from '@/components/authGuard';
import { notifyInvoiceCreated } from '@/lib/notificationService';


const updateInventoryQty = async (itemId: string, warehouseId: string, qtyChange: number) => {
    const { data } = await supabase.from('warehouse_inventory').select('*').eq('item_id', itemId).eq('warehouse_id', warehouseId).single();
    if (data) {
        await supabase.from('warehouse_inventory').update({ quantity: Number(data.quantity) + qtyChange }).eq('id', data.id);
    } else if (qtyChange > 0) {
        await supabase.from('warehouse_inventory').insert({ warehouse_id: warehouseId, item_id: itemId, quantity: qtyChange });
    }
};

export function useInvoicesLogic() {
    const router = useRouter();
    const { showToast, showConfirm } = useToast(); 
    const queryClient = useQueryClient();
    const { profile, can } = useAuth();
    
    // 🔄 تحديث فوري ذكي
    useRealtimeInvalidate(['invoices', 'receipt_vouchers'], ['invoices']);

    const updateRowsInCache = (targetIds: any[], updatedFields: any) => {
        queryClient.setQueryData(['invoices'], (oldData: any[]) => {
            if (!oldData) return [];
            const stringIds = targetIds.map(String);
            return oldData.map(row => 
                stringIds.includes(String(row.id)) ? { ...row, ...updatedFields } : row 
            );
        });
    };

    const [globalSearch, setGlobalSearch] = useState('');
    const deferredSearch = useDeferredValue(globalSearch); 
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'posted' | 'pending' | 'quotation' | 'sales_order' | 'unpaid' | 'overdue' | 'returned'>('all');
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [currentRecord, setCurrentRecord] = useState<any>({ lines: [] });

    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
    const [selectedInvoiceForPay, setSelectedInvoiceForPay] = useState<any>(null);
    const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
    const [selectedInvoiceForReturn, setSelectedInvoiceForReturn] = useState<any>(null);

    const { data: partners = [] } = useQuery({
        queryKey: ['partners_lookup'],
        queryFn: async () => {
            const { data } = await supabase.from('partners').select('id, name, phone, code');
            return data || [];
        }
    });

    const { data: accounts = [] } = useQuery({
        queryKey: ['accounts_lookup'],
        queryFn: async () => {
            const { data } = await supabase.from('accounts').select('id, name, code');
            return data || [];
        }
    });

    const { data: activeShift } = useQuery({
        queryKey: ['active_pos_shift_invoices'],
        queryFn: async () => {
            const { data } = await supabase
                .from('pos_shifts')
                .select('*')
                .eq('status', 'open')
                .order('opened_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            return data || null;
        }
    });

    const partnersMap = useMemo(() => new Map(partners.map((p: any) => [p.id, p])), [partners]);
    const accountsMap = useMemo(() => new Map(accounts.map((a: any) => [a.id, a])), [accounts]);

    const { data: rawInvoices = [], isLoading: isInvLoading } = useQuery({
        queryKey: ['invoices'],
        staleTime: 0,
        queryFn: async () => {
            const buildQuery = () => {
                let q = supabase
                    .from('invoices')
                    .select('*')
                    .order('date', { ascending: false });
                
                // 🛡️ Data Scoping Logic
                if (profile) {
                    const role = String(profile.role || '').toLowerCase();
                    const isGlobalAdmin = role === 'admin' || role === 'super_admin' || role === 'manager' || profile.is_admin === true;
                    if (!isGlobalAdmin && profile.linked_partner_id) {
                        q = q.or(`delegate_id.eq.${profile.linked_partner_id},partner_id.eq.${profile.linked_partner_id}`);
                    }
                }
                return q;
            };
            return await fetchPaginatedData(buildQuery, 'id');
        },
        enabled: !!profile // Wait until profile is loaded
    });

    const invoices = useMemo(() => {
        return (rawInvoices || []).map((inv: any) => {
            const p = inv.partner_id ? partnersMap.get(inv.partner_id) : null;
            const debitAcc = inv.debit_account_id ? accountsMap.get(inv.debit_account_id) : null;
            const creditAcc = inv.credit_account_id ? accountsMap.get(inv.credit_account_id) : null;
            return {
                ...inv,
                partners: p || (inv.client_name ? { name: inv.client_name } : null),
                client_name: inv.client_name || p?.name || 'عميل نقدي',
                debit_acc: debitAcc,
                credit_acc: creditAcc
            };
        });
    }, [rawInvoices, partnersMap, accountsMap]);

    const { data: projects = [], isLoading: isProjLoading } = useQuery({
        queryKey: ['job_orders'],
        queryFn: async () => {
            const { data, error } = await supabase.from('job_orders').select('*').eq('status', 'قيد التنفيذ');
            if (error) throw error;
            return data || [];
        }
    });

    const { data: fleetOperations = [] } = useQuery({
        queryKey: ['fleet_operations_open'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('fleet_operations')
                .select('id, operation_number, operation_date, status, vehicle_id, driver_id, description, vehicle:fleet_vehicles(plate_number), driver:partners(name)')
                .neq('status', 'مغلق')
                .neq('status', 'closed')
                .order('operation_date', { ascending: false });
            if (error) throw error;
            return data?.map((op:any) => ({
                id: op.id,
                operation_number: op.operation_number,
                status: op.status,
                vehicle_id: op.vehicle_id,
                driver_id: op.driver_id,
                name: `🚚 ${op.operation_number} | ${op.driver?.name ? `مندوب: ${op.driver.name}` : 'بدون مندوب'} | ${op.vehicle?.plate_number ? `سيارة: ${op.vehicle.plate_number}` : ''} ${op.description ? `(${op.description})` : ''}`
            })) || [];
        }
    });

    const { data: warehouses = [] } = useQuery({
        queryKey: ['warehouses'],
        queryFn: async () => {
            const { data, error } = await supabase.from('warehouses').select('*').eq('is_active', true).order('type');
            if (error) throw error;
            return data || [];
        }
    });

    const { data: delegates = [] } = useQuery({
        queryKey: ['delegates'],
        queryFn: async () => {
            const { data, error } = await supabase.from('partners').select('*').in('partner_type', ['موظف', 'مندوب']);
            if (error) throw error;
            return data || [];
        }
    });

    const { data: warehouseItems = [] } = useQuery({
        queryKey: ['warehouse_items', currentRecord?.warehouse_id],
        queryFn: async () => {
            if (currentRecord?.warehouse_id) {
                const { data, error } = await supabase
                    .from('warehouse_inventory')
                    .select('quantity, item_id, inventory_items(name, unit, default_price, tax_rate, code)')
                    .eq('warehouse_id', currentRecord.warehouse_id)
                    .gt('quantity', 0);
                if (error) throw error;
                return data?.map((d: any) => ({
                    id: d.item_id,
                    name: d.inventory_items?.name,
                    unit: d.inventory_items?.unit,
                    price: d.inventory_items?.default_price || 0,
                    quantity: d.quantity,
                    tax_rate: d.inventory_items?.tax_rate,
                    code: d.inventory_items?.code
                })) || [];
            } else {
                const { data, error } = await supabase.from('inventory_items').select('id, name, unit, default_price, tax_rate, code');
                if (error) throw error;
                return data?.map((d: any) => ({
                    id: d.id,
                    name: d.name,
                    unit: d.unit,
                    price: d.default_price || 0,
                    quantity: 'غير محدد',
                    tax_rate: d.tax_rate,
                    code: d.code
                })) || [];
            }
        },
        enabled: true
    });

    const allFiltered = useMemo(() => {
        if (!invoices) return [];
        return invoices.filter((inv: any) => {
            const searchLower = (deferredSearch || '').toLowerCase();
            const matchesSearch = 
                inv.invoice_number?.toLowerCase().includes(searchLower) || 
                inv.client_name?.toLowerCase().includes(searchLower) ||
                inv.partners?.name?.toLowerCase().includes(searchLower);
            
            let matchesDate = true;
            const invDate = inv.date ? new Date(inv.date) : null;
            if (invDate) {
                if (dateFrom) matchesDate = matchesDate && invDate >= new Date(dateFrom);
                if (dateTo) matchesDate = matchesDate && invDate <= new Date(dateTo);
            }

            const total = Number(inv.total_amount || 0);
            const paid = Number(inv.paid_amount || 0);
            const isApproved = ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase()) || inv.is_posted === true;

            const isQuotation = inv.status === 'عرض سعر' || String(inv.invoice_number || '').startsWith('QUO-');
            const isSalesOrder = inv.status === 'أمر بيع' || String(inv.invoice_number || '').startsWith('SO-');

            let matchesStatus = true;
            if (statusFilter === 'quotation') matchesStatus = isQuotation;
            else if (statusFilter === 'sales_order') matchesStatus = isSalesOrder;
            else if (statusFilter === 'posted') matchesStatus = isApproved && !isQuotation && !isSalesOrder;
            else if (statusFilter === 'pending') matchesStatus = !isApproved && !isQuotation && !isSalesOrder;
            else if (statusFilter === 'unpaid') matchesStatus = (total - paid) > 0 && !isQuotation && !isSalesOrder;
            else if (statusFilter === 'overdue') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                matchesStatus = (total - paid) > 0 && !isQuotation && !isSalesOrder && !!inv.due_date && new Date(inv.due_date) < today;
            } else if (statusFilter === 'returned') {
                matchesStatus = inv.status === 'مرتجع' || inv.status === 'مرتجع جزئي' || String(inv.invoice_number || '').startsWith('RET-');
            }

            return matchesSearch && matchesDate && matchesStatus;
        }).map((inv: any) => {
            const total = Number(inv.total_amount || 0);
            const paid = Number(inv.paid_amount || 0);
            const balance = total - paid;
            
            let paymentStatus = 'unpaid'; 
            if (paid > total && total > 0) paymentStatus = 'overpaid'; 
            else if (paid === total && total > 0) paymentStatus = 'paid'; 
            else if (paid > 0) paymentStatus = 'partial'; 

            return {
                ...inv,
                remaining_amount: balance,
                payment_display_status: paymentStatus
            };
        });
    }, [invoices, deferredSearch, dateFrom, dateTo, statusFilter]);

    const paginatedInvoices = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return allFiltered.slice(start, start + rowsPerPage);
    }, [allFiltered, currentPage, rowsPerPage]);

    const filterStats = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return {
            all: invoices.length,
            quotations: invoices.filter((i: any) => i.status === 'عرض سعر' || String(i.invoice_number || '').startsWith('QUO-')).length,
            salesOrders: invoices.filter((i: any) => i.status === 'أمر بيع' || String(i.invoice_number || '').startsWith('SO-')).length,
            posted: invoices.filter((i: any) => (['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) || i.is_posted === true) && !String(i.invoice_number || '').startsWith('QUO-') && !String(i.invoice_number || '').startsWith('SO-')).length,
            pending: invoices.filter((i: any) => !['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) && !i.is_posted && !String(i.invoice_number || '').startsWith('QUO-') && !String(i.invoice_number || '').startsWith('SO-')).length,
            unpaid: invoices.filter((i: any) => (Number(i.total_amount || 0) - Number(i.paid_amount || 0)) > 0 && !String(i.invoice_number || '').startsWith('QUO-') && !String(i.invoice_number || '').startsWith('SO-')).length,
            overdue: invoices.filter((i: any) => (Number(i.total_amount || 0) - Number(i.paid_amount || 0)) > 0 && !String(i.invoice_number || '').startsWith('QUO-') && !String(i.invoice_number || '').startsWith('SO-') && !!i.due_date && new Date(i.due_date) < today).length,
            returned: invoices.filter((i: any) => i.status === 'مرتجع' || i.status === 'مرتجع جزئي' || String(i.invoice_number || '').startsWith('RET-')).length,
            totalSales: invoices.filter((i: any) => !String(i.invoice_number || '').startsWith('QUO-')).reduce((sum: number, i: any) => sum + Number(i.total_amount || 0), 0),
            totalCollected: invoices.reduce((sum: number, i: any) => sum + Number(i.paid_amount || 0), 0),
            totalRemaining: invoices.filter((i: any) => !String(i.invoice_number || '').startsWith('QUO-')).reduce((sum: number, i: any) => sum + Math.max(0, Number(i.total_amount || 0) - Number(i.paid_amount || 0)), 0),
        };
    }, [invoices]);

    const kpis = useMemo(() => ({
        total: allFiltered.length,
        posted: allFiltered.filter((i: any) => ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) || i.is_posted === true).length,
        pending: allFiltered.filter((i: any) => !['posted', 'معتمد', 'مرحل', 'approved'].includes(String(i.status || '').trim().toLowerCase()) && !i.is_posted).length
    }), [allFiltered]);

    const summary = useMemo(() => getInvoiceSummaryAndAging(allFiltered), [allFiltered]);

    const handleOpenPaymentModal = async (inv: any) => {
        const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
        
        const pName = inv.client_name || inv.partners?.name || '';

        setSelectedInvoiceForPay({
            id: undefined, 
            invoice_id: inv.id, 
            invoice_number: inv.invoice_number,
            date: new Date().toISOString().split('T')[0], 
            partner_id: inv.partner_id, 
            partner_name: pName,
            amount: balance > 0 ? balance : 0, 
            payment_method: 'نقدي (كاش)',
            partner_acc_id: inv.debit_account_id || '4f828d0d-a1f4-4762-83e3-c17dafae802d',
            partner_acc_name: inv.debit_acc?.name || 'العملاء (أصحاب الفروع)', 
            safe_bank_acc_id: '21b8a1db-bc9f-4cf8-b741-1efeded0963c',
            safe_bank_acc_name: 'الخزينة الرئيسية',
            delegate_id: inv.delegate_id,
            fleet_operation_id: inv.fleet_operation_id,
            job_order_id: inv.job_order_id,
        });
        setIsReceiptModalOpen(true);
    };

    const handlePayInvoice = (inv: any) => {
        const balance = Number(inv.total_amount || 0) - Number(inv.paid_amount || 0);
        const defaultAmount = balance > 0 ? balance : 0;
        
        const params = new URLSearchParams({
            invoice_id: inv.id, 
            amount: defaultAmount.toString(), 
            client_name: inv.client_name || '', 
            ref: inv.invoice_number || ''
        });
        router.push(`/ReceiptVouchers?${params.toString()}`);
    };

    const handleAddNew = () => { 
        setCurrentRecord({ 
            lines: [], 
            date: new Date().toISOString().split('T')[0], 
            debit_account_id: '4f828d0d-a1f4-4762-83e3-c17dafae802d',
            debit_account_name: 'العملاء ',
            credit_account_id: '6667f91a-9478-49ab-9721-521ee09381fa',
            credit_account_name: 'إيرادات المبيعات',
            payment_method: 'آجل'
        }); 
        setIsEditModalOpen(true); 
    };

    const handleEdit = (inv: any) => {
        if (inv.is_posted || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase())) {
            showToast("⚠️ لا يمكن تعديل فاتورة معتمدة! لتسجيل الدفعات استخدم زر (💰) الموجود بالجدول. ولتعديل بيانات الأصناف يجب فك الترحيل أولاً.", "error");
            return;
        }

        setCurrentRecord({ ...inv, client_name: inv.client_name || inv.partners?.name || '' });
        setIsEditModalOpen(true);
    };

    const saveMutation = useMutation({
        mutationFn: async (record: any) => {
            const cleanId = (id: any) => (id && typeof id === 'string' && id.trim() !== '') ? id : null;
            
            if (record.id) {
                const { data: currentInv } = await supabase.from('invoices').select('status').eq('id', record.id).single();
                if (currentInv && ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(currentInv.status || '').trim().toLowerCase())) {
                    throw new Error("لا يمكن حفظ التعديلات! الفاتورة معتمدة بالفعل في النظام. يرجى فك الترحيل أولاً.");
                }
            }

            const invoiceHeader = {
                invoice_number: record.invoice_number, 
                date: record.date, 
                partner_id: cleanId(record.partner_id),
                client_name: record.client_name, 
                description: record.description, 
                materials_discount: Number(record.materials_discount) || 0, 
                taxable_amount: Number(record.taxable_amount) || 0,
                tax_amount: Number(record.tax_amount) || 0, 
                guarantee_percent: Number(record.guarantee_percent) || 0,
                guarantee_amount: Number(record.guarantee_amount) || 0, 
                total_amount: Number(record.total_amount) || 0,
                debit_account_id: cleanId(record.debit_account_id), 
                credit_account_id: cleanId(record.credit_account_id),
                materials_acc_id: cleanId(record.materials_acc_id), 
                guarantee_acc_id: cleanId(record.guarantee_acc_id),
                tax_acc_id: cleanId(record.tax_acc_id) || '990c949c-5f32-40d7-8d36-5fe45a6c892c', 
                status: record.status || 'معلق', 
                due_in_days: Number(record.due_in_days) || 0,
                due_date: record.due_date, 
                paid_amount: Number(record.paid_amount) || 0, 
                skip_zatca: record.skip_zatca || false,
                fleet_operation_id: cleanId(record.fleet_operation_id),
                warehouse_id: cleanId(record.warehouse_id),
                delegate_id: cleanId(record.delegate_id),
                payment_method: record.payment_method || 'آجل',
                lines_data: record.lines || record.items || [] 
            };

            if (record.id) {
                const { error: headErr } = await supabase.from('invoices').update(invoiceHeader).eq('id', record.id);
                if (headErr) throw headErr;
            } else {
                const { data: inserted, error: headErr } = await supabase.from('invoices').insert([invoiceHeader]).select().single();
                if (headErr) throw headErr;

                // AUTO POST INVOICE (If Warehouse is specified)
                if (invoiceHeader.warehouse_id && inserted) {
                     await supabase.rpc('post_invoices_bulk', { p_ids: [inserted.id] });
                }

                // 🔔 بث إشعار فوري في النظام وعبر الجوال
                notifyInvoiceCreated({
                    invoiceNumber: invoiceHeader.invoice_number,
                    clientName: invoiceHeader.client_name,
                    totalAmount: Number(invoiceHeader.total_amount) || 0,
                    invoiceId: inserted?.id
                }).catch(() => {});
            }

        },
        onSuccess: () => {
            setIsEditModalOpen(false);
            showToast("تم حفظ الفاتورة بنجاح 💾", "success");
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
        },
        onError: (err: any) => {
            showToast(`حدث خطأ أثناء الحفظ! ❌ ${err.message}`, "error");
        }
    });

    // 🛡️ دوال مساعدة للترحيل وفك الترحيل والحذف المباشر (Dual-Layer Fallback)
    const directPostInvoices = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('post_invoices_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        const { data: invs } = await supabase.from('invoices').select('*').in('id', ids);
        for (const inv of (invs || [])) {
            if (inv.is_posted || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase())) continue;
            const { data: jh } = await supabase.from('journal_headers').insert([{
                entry_date: inv.date || new Date().toISOString().split('T')[0],
                description: `فاتورة مبيعات رقم ${inv.invoice_number || ''}`,
                reference_id: inv.id,
                v_type: 'invoice',
                status: 'posted',
                fleet_operation_id: inv.fleet_operation_id || null
            }]).select().single();

            if (jh) {
                const lines: any[] = [];
                const total = Number(inv.total_amount || 0);
                const tax = Number(inv.tax_amount || 0);
                const taxable = Number(inv.taxable_amount || total - tax);

                if (total > 0 && inv.debit_account_id) {
                    lines.push({
                        header_id: jh.id,
                        account_id: inv.debit_account_id,
                        partner_id: inv.partner_id || null,
                        debit: total,
                        credit: 0,
                        notes: `استحقاق فاتورة مبيعات #${inv.invoice_number || ''}`,
                        fleet_operation_id: inv.fleet_operation_id || null,
                        delegate_id: inv.delegate_id || null
                    });
                }
                if (taxable > 0 && inv.credit_account_id) {
                    lines.push({
                        header_id: jh.id,
                        account_id: inv.credit_account_id,
                        partner_id: inv.partner_id || null,
                        debit: 0,
                        credit: taxable,
                        notes: `إيراد مبيعات فاتورة #${inv.invoice_number || ''}`,
                        fleet_operation_id: inv.fleet_operation_id || null,
                        delegate_id: inv.delegate_id || null
                    });
                }
                if (tax > 0 && inv.tax_acc_id) {
                    lines.push({
                        header_id: jh.id,
                        account_id: inv.tax_acc_id,
                        partner_id: inv.partner_id || null,
                        debit: 0,
                        credit: tax,
                        notes: `ضريبة القيمة المضافة فاتورة #${inv.invoice_number || ''}`,
                        tax_amount: tax,
                        fleet_operation_id: inv.fleet_operation_id || null,
                        delegate_id: inv.delegate_id || null
                    });
                }
                if (lines.length > 0) {
                    await supabase.from('journal_lines').insert(lines);
                }
            }
            await supabase.from('invoices').update({ status: 'معتمد' }).eq('id', inv.id);
        }
    };

    const directUnpostInvoices = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('unpost_invoices_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        const { data: headers } = await supabase.from('journal_headers').select('id').in('reference_id', ids);
        if (headers && headers.length > 0) {
            const headerIds = headers.map(h => h.id);
            await supabase.from('journal_lines').delete().in('header_id', headerIds);
            await supabase.from('journal_headers').delete().in('id', headerIds);
        }
        await supabase.from('invoices').update({ status: 'مسودة' }).in('id', ids);
    };

    const directDeleteInvoices = async (ids: string[]) => {
        try {
            const { error } = await supabase.rpc('delete_invoices_bulk', { p_ids: ids });
            if (!error) return;
        } catch {}

        await directUnpostInvoices(ids);
        await supabase.from('invoices').delete().in('id', ids);
    };

    const postMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            await directPostInvoices(selectedIds);
        },
        onSuccess: () => {
            showToast("تم الاعتماد والترحيل بنجاح ✅", "success");
            setSelectedIds([]);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] }); 
        },
        onError: (err: any) => showToast(`خطأ في الترحيل: ${err.message}`, "error")
    });

    const unpostMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            await directUnpostInvoices(selectedIds);
        },
        onSuccess: () => {
            showToast("تم فك الترحيل بنجاح 🔄", "warning");
            setSelectedIds([]);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] }); 
        },
        onError: (err: any) => showToast(`${err.message}`, "error") 
    });

    const deleteMutation = useMutation({
        mutationFn: async () => {
            if (!selectedIds.length) return;
            await directDeleteInvoices(selectedIds);
        },
        onSuccess: () => {
            showToast("تم الحذف النهائي بنجاح 🗑️", "success");
            setSelectedIds([]);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
            queryClient.invalidateQueries({ queryKey: ['journal_master_view'] }); 
        },
        onError: (err: any) => showToast(`خطأ في الحذف: ${err.message}`, "error")
    });

    const payMutation = useMutation({
        mutationFn: async (receiptData: any) => {
            const autoNumber = `RV-${Date.now()}`;
            const cleanId = (id: any) => (id && typeof id === 'string' && id.trim() !== '') ? id : null;
            const finalAmount = Number(receiptData.amount || 0);
            if (finalAmount <= 0) throw new Error("AMOUNT_ZERO");

            const dataToSave = {
                receipt_number: receiptData.receipt_number || autoNumber,
                date: receiptData.date || new Date().toISOString().split('T')[0],
                amount: finalAmount,
                payment_method: receiptData.payment_method || 'نقدي (كاش)',
                notes: receiptData.notes || `سداد دفعة من فاتورة مبيعات #${receiptData.invoice_number}`,
                invoice_id: cleanId(receiptData.id || receiptData.invoice_id),
                partner_id: cleanId(receiptData.partner_id),
                safe_bank_acc_id: cleanId(receiptData.safe_bank_acc_id), 
                partner_acc_id: cleanId(receiptData.partner_acc_id),
            };

            const { error: receiptErr } = await supabase.from('receipt_vouchers').insert([dataToSave]);
            if (receiptErr) throw receiptErr;

        },
        onError: (err: any) => {
            if (err.message === "AMOUNT_ZERO") showToast("المبلغ المدفوع يجب أن يكون أكبر من صفر ⚠️", "warning");
            else showToast(`حدث خطأ أثناء إنشاء سند القبض: ${err.message}`, "error");
        },
        onSuccess: () => {
            setIsReceiptModalOpen(false);
            setSelectedInvoiceForPay(null);
            showToast("تم إنشاء سند قبض كمسودة بنجاح 💰", "success");
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
        }
    });

    const returnMutation = useMutation({
        mutationFn: async ({
            originalInvoice,
            returnedItems,
            returnStockToWarehouse,
            refundCashFromDrawer,
            reason
        }: any) => {
            if (!returnedItems || returnedItems.length === 0) {
                throw new Error("يرجى تحديد الأصناف والكميات المراد إرجاعها");
            }

            const returnTotal = returnedItems.reduce((s: number, it: any) => s + Number(it.total || 0), 0);
            let returnTax = 0;
            let returnTaxable = 0;

            returnedItems.forEach((it: any) => {
                const itTotal = Number(it.total || 0);
                const itTaxRate = (it.tax_rate !== undefined && it.tax_rate !== null) ? Number(it.tax_rate) : 15;
                if (itTaxRate === 0 || originalInvoice.skip_zatca) {
                    returnTaxable += itTotal;
                } else {
                    const sub = itTotal / (1 + (itTaxRate / 100));
                    const tax = itTotal - sub;
                    returnTaxable += sub;
                    returnTax += tax;
                }
            });

            returnTax = Math.round(returnTax * 100) / 100;
            returnTaxable = Math.round(returnTaxable * 100) / 100;

            const returnInvoiceNumber = `RET-${originalInvoice.invoice_number || Date.now().toString().slice(-6)}`;

            // 1. إنشاء فاتورة المرتجع / إشعار دائن (Credit Note)
            const returnInvoiceHeader = {
                invoice_number: returnInvoiceNumber,
                date: new Date().toISOString().split('T')[0],
                partner_id: originalInvoice.partner_id || null,
                client_name: originalInvoice.client_name || 'عميل نقدي',
                description: `مرتجع مبيعات للفاتورة #${originalInvoice.invoice_number}${reason ? ` (${reason})` : ''}`,
                materials_discount: 0,
                taxable_amount: -returnTaxable,
                tax_amount: -returnTax,
                total_amount: -returnTotal,
                debit_account_id: originalInvoice.credit_account_id, // عكس القيد: مدين إيراد المبيعات
                credit_account_id: originalInvoice.debit_account_id, // دائن العميل/النقدية
                materials_acc_id: originalInvoice.materials_acc_id,
                guarantee_acc_id: originalInvoice.guarantee_acc_id,
                tax_acc_id: originalInvoice.tax_acc_id,
                skip_zatca: Boolean(originalInvoice.skip_zatca),
                status: 'مرتجع',
                due_in_days: 0,
                due_date: null,
                paid_amount: (originalInvoice.payment_method === 'نقدي (كاش)' || originalInvoice.payment_method === 'نقدي') ? -returnTotal : 0,
                lines_data: returnedItems,
                warehouse_id: originalInvoice.warehouse_id,
                delegate_id: originalInvoice.delegate_id,
                payment_method: originalInvoice.payment_method || 'نقدي (كاش)',
                shift_id: activeShift?.id || originalInvoice.shift_id || null,
                payment_status: 'paid'
            };

            const { data: insertedReturn, error: returnErr } = await supabase
                .from('invoices')
                .insert([returnInvoiceHeader])
                .select()
                .single();

            if (returnErr) throw returnErr;

            // 2. فحص إذا كان المرتجع كلياً أم جزئياً لتحديث الفاتورة الأصلية
            const originalLines = originalInvoice.lines_data || originalInvoice.lines || originalInvoice.items || [];
            const originalTotalQty = originalLines.reduce((s: number, l: any) => s + Number(l.quantity || l.qty || 0), 0);
            const returnedTotalQty = returnedItems.reduce((s: number, l: any) => s + Number(l.quantity || l.qty || 0), 0);
            const isFullReturn = returnedTotalQty >= originalTotalQty && originalTotalQty > 0;

            const updatedOriginalStatus = isFullReturn ? 'مرتجع' : 'مرتجع جزئي';
            const existingDesc = originalInvoice.description ? `${originalInvoice.description} | ` : '';
            const newDesc = `${existingDesc}تم إصدار مرتجع برقم #${returnInvoiceNumber} بقيمة ${returnTotal} ر.س`;

            await supabase
                .from('invoices')
                .update({
                    status: updatedOriginalStatus,
                    description: newDesc
                })
                .eq('id', originalInvoice.id);

            // 3. إعادة البضاعة إلى المستودع (إذا كان الخيار مفعلاً)
            if (returnStockToWarehouse && originalInvoice.warehouse_id) {
                const targetWh = originalInvoice.warehouse_id;
                for (const it of returnedItems) {
                    if (it.item_id && Number(it.quantity) > 0) {
                        const qty = Number(it.quantity);
                        const cost = Number(it.unit_price) || 0;

                        // تسجيل حركة وارد مرتجع في inventory_transactions
                        await supabase.from('inventory_transactions').insert([{
                            transaction_number: `TX-RET-${Date.now().toString().slice(-6)}`,
                            transaction_date: new Date().toISOString().split('T')[0],
                            type: 'in',
                            quantity: qty,
                            unit_price: cost,
                            total_price: qty * cost,
                            item_id: it.item_id,
                            warehouse_id: targetWh,
                            invoice_id: originalInvoice.id,
                            notes: `مرتجع مبيعات فاتورة #${originalInvoice.invoice_number}`,
                            status: 'approved'
                        }]);

                        // زيادة رصيد المستودع
                        const { data: whRow } = await supabase
                            .from('warehouse_inventory')
                            .select('id, quantity')
                            .eq('warehouse_id', targetWh)
                            .eq('item_id', it.item_id)
                            .maybeSingle();

                        if (whRow) {
                            await supabase
                                .from('warehouse_inventory')
                                .update({ quantity: Number(whRow.quantity || 0) + qty })
                                .eq('id', whRow.id);
                        } else {
                            await supabase
                                .from('warehouse_inventory')
                                .insert([{
                                    warehouse_id: targetWh,
                                    item_id: it.item_id,
                                    quantity: qty
                                }]);
                        }

                        // إذا كان المستودع الرئيسي، نحدث أيضاً current_quantity في inventory_items
                        if (targetWh === '11111111-1111-1111-1111-111111111111') {
                            const { data: catItem } = await supabase
                                .from('inventory_items')
                                .select('current_quantity')
                                .eq('id', it.item_id)
                                .maybeSingle();
                            if (catItem) {
                                await supabase
                                    .from('inventory_items')
                                    .update({ current_quantity: Number(catItem.current_quantity || 0) + qty })
                                    .eq('id', it.item_id);
                            }
                        }
                    }
                }
            }

            // 4. استرداد المبلغ نقداً وضبط نقدية الوردية في الكاشير
            if (refundCashFromDrawer && (originalInvoice.payment_method === 'نقدي (كاش)' || originalInvoice.payment_method === 'نقدي')) {
                const shiftToUpdate = activeShift?.id || originalInvoice.shift_id;
                if (shiftToUpdate) {
                    try {
                        const { data: sRec } = await supabase
                            .from('pos_shifts')
                            .select('actual_cash, expected_cash, total_sales, total_cash_sales')
                            .eq('id', shiftToUpdate)
                            .maybeSingle();

                        if (sRec) {
                            // خصم المرتجع من الكاش المتوقع ومبيعات الكاش بالوردية
                            await supabase
                                .from('pos_shifts')
                                .update({
                                    expected_cash: Math.max(0, Number(sRec.expected_cash || 0) - returnTotal),
                                    total_cash_sales: Math.max(0, Number(sRec.total_cash_sales || 0) - returnTotal),
                                    total_sales: Math.max(0, Number(sRec.total_sales || 0) - returnTotal)
                                })
                                .eq('id', shiftToUpdate);
                        }
                    } catch (shiftErr) {
                        console.error('Error updating shift return cash:', shiftErr);
                    }
                }
            }
        },
        onSuccess: () => {
            showToast("تم تسجيل مرتجع المبيعات وإعادة البضاعة للمخزن بنجاح 🔄✅", "success");
            setIsReturnModalOpen(false);
            setSelectedInvoiceForReturn(null);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['warehouse_items'] });
            queryClient.invalidateQueries({ queryKey: ['active_pos_shift_invoices'] });
        },
        onError: (err: any) => {
            showToast(`فشل تسجيل المرتجع: ${err.message}`, "error");
        }
    });

    const isSaving = saveMutation.isPending || postMutation.isPending || unpostMutation.isPending || deleteMutation.isPending || payMutation.isPending || returnMutation.isPending;
    const isLoading = isInvLoading || isProjLoading || isSaving;

    return {
        invoices: paginatedInvoices,
        allFiltered,
        projects,
        fleetOperations,
        warehouses,
        delegates,
        summary,
        isLoading,
        isSaving,
        isReturning: returnMutation.isPending,
        isReturnModalOpen, setIsReturnModalOpen,
        selectedInvoiceForReturn, setSelectedInvoiceForReturn,
        handleOpenReturnModal: (inv: any) => {
            setSelectedInvoiceForReturn(inv);
            setIsReturnModalOpen(true);
        },
        handleConfirmReturn: (payload: any) => returnMutation.mutate(payload),
        permissions: { isAdmin: can('invoices', 'edit') },
        handlePayInvoice,
        isReceiptModalOpen, setIsReceiptModalOpen,
        selectedInvoiceForPay, setSelectedInvoiceForPay, 
        handleOpenPaymentModal,
        globalSearch, setGlobalSearch: (v: string) => { setGlobalSearch(v); setCurrentPage(1); },
        dateFrom, setDateFrom: (v: string) => { setDateFrom(v); setCurrentPage(1); },
        dateTo, setDateTo: (v: string) => { setDateTo(v); setCurrentPage(1); },
        selectedIds, setSelectedIds,
        currentPage, setCurrentPage,
        rowsPerPage, setRowsPerPage: (v: number) => { setRowsPerPage(v); setCurrentPage(1); },
        kpis,
        isEditModalOpen, setIsEditModalOpen,
        currentRecord, setCurrentRecord,
        handleAddNew, handleEdit, 
        handleSave: (record: any) => saveMutation.mutate(record),
        handlePostSelected: () => postMutation.mutate(), 
        handleUnpostSelected: () => unpostMutation.mutate(), 
        warehouseItems,
        handleDeleteSelected: async () => {
            const posted = invoices.filter((inv:any) => selectedIds.includes(String(inv.id)) && (inv.is_posted || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase())));
            if (posted.length > 0) {
                return showToast("⚠️ لا يمكن حذف فواتير معتمدة ومرحلة. يرجى فك الترحيل أولاً.", "error");
            }
            if (!selectedIds.length) return;
            const confirmed = await showConfirm({
                title: 'حذف الفواتير المحددة',
                message: 'هل أنت متأكد من الحذف النهائي للفواتير والقيود المرتبطة بها؟',
                confirmText: 'نعم، حذف الفواتير',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;
            deleteMutation.mutate();
        },
        handleDeleteSingle: async (inv: any) => {
            if (inv.is_posted || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase())) {
                return showToast("⚠️ لا يمكن حذف فاتورة معتمدة ومرحلة، يرجى فك الترحيل أولاً.", "error");
            }
            const confirmed = await showConfirm({
                title: 'حذف الفاتورة',
                message: `تحذير: هل أنت متأكد من حذف الفاتورة #${inv.invoice_number} نهائياً؟`,
                confirmText: 'نعم، حذف',
                cancelText: 'إلغاء',
                type: 'danger'
            });
            if (!confirmed) return;
            try {
                await directDeleteInvoices([inv.id]);
                showToast(`تم حذف الفاتورة #${inv.invoice_number} بنجاح 🗑️`, "success");
                queryClient.invalidateQueries({ queryKey: ['invoices'] });
                queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
                queryClient.invalidateQueries({ queryKey: ['journal_master_view'] }); 
            } catch (err: any) {
                showToast(`فشل الحذف: ${err.message}`, "error");
            }
        },
        handleToggleStatus: async (inv: any) => {
            const isApproved = inv.is_posted === true || ['posted', 'معتمد', 'مرحل', 'approved'].includes(String(inv.status || '').trim().toLowerCase());
            setTogglingId(String(inv.id));
            try {
                if (isApproved) {
                    const confirmed = await showConfirm({
                        title: 'فك ترحيل الفاتورة',
                        message: `هل أنت متأكد من فك ترحيل واعتماد الفاتورة #${inv.invoice_number}؟`,
                        confirmText: 'نعم، فك الترحيل',
                        cancelText: 'إلغاء',
                        type: 'warning'
                    });
                    if (!confirmed) return;
                    await directUnpostInvoices([inv.id]);
                    showToast(`تم فك اعتماد الفاتورة #${inv.invoice_number} 🔄`, "warning");
                } else {
                    await directPostInvoices([inv.id]);
                    showToast(`تم اعتماد وترحيل الفاتورة #${inv.invoice_number} بنجاح ✅`, "success");
                }
                queryClient.invalidateQueries({ queryKey: ['invoices'] });
                queryClient.invalidateQueries({ queryKey: ['accounts_report_with_lines'] }); 
                queryClient.invalidateQueries({ queryKey: ['journal_master_view'] }); 
            } catch (err: any) {
                showToast(`خطأ في تغيير حالة الفاتورة: ${err.message}`, "error");
            } finally {
                setTogglingId(null);
            }
        },
        handleConvertToSalesOrder: async (inv: any) => {
            const confirmed = await showConfirm({
                title: 'تحويل عرض السعر إلى أمر بيع',
                message: `هل تؤكد تحويل عرض السعر #${inv.invoice_number} إلى أمر بيع رسمي؟ سيتم تحديث الرقم والحالة.`,
                confirmText: 'تحويل إلى أمر بيع 📦',
                cancelText: 'إلغاء',
                type: 'warning'
            });
            if (!confirmed) return;

            try {
                const rawNum = inv.invoice_number?.replace(/^(QUO|INV)-/, '') || `${Date.now().toString().slice(-6)}`;
                const newNumber = `SO-${new Date().getFullYear()}-${rawNum}`;
                const { error } = await supabase
                    .from('invoices')
                    .update({
                        invoice_number: newNumber,
                        status: 'أمر بيع',
                        description: `أمر بيع محول من عرض سعر #${inv.invoice_number}`
                    })
                    .eq('id', inv.id);

                if (error) throw error;
                showToast(`تم تحويل عرض السعر إلى أمر بيع #${newNumber} بنجاح 🎉`, 'success');
                queryClient.invalidateQueries({ queryKey: ['invoices'] });
            } catch (err: any) {
                showToast(`فشل التحويل: ${err.message}`, 'error');
            }
        },
        handleConvertToInvoice: async (inv: any) => {
            const confirmed = await showConfirm({
                title: 'إصدار فاتورة ضريبية معتمدة',
                message: `هل تؤكد إصدار فاتورة ضريبية رسمية للمستند #${inv.invoice_number}؟ سيتم إنشاء الفاتورة الضريبية وجاهزيتها للاعتماد والترحيل المحاسبي.`,
                confirmText: 'إصدار الفاتورة ⚡',
                cancelText: 'إلغاء',
                type: 'warning'
            });
            if (!confirmed) return;

            try {
                const rawNum = inv.invoice_number?.replace(/^(QUO|SO)-/, '') || `${Date.now().toString().slice(-6)}`;
                const newNumber = `INV-${new Date().getFullYear()}-${rawNum}`;
                const { error } = await supabase
                    .from('invoices')
                    .update({
                        invoice_number: newNumber,
                        status: 'معلق',
                        description: `فاتورة ضريبية محولة من ${inv.status || 'عرض/أمر'} #${inv.invoice_number}`
                    })
                    .eq('id', inv.id);

                if (error) throw error;
                showToast(`تم إصدار الفاتورة الضريبية #${newNumber} بنجاح ✅`, 'success');
                queryClient.invalidateQueries({ queryKey: ['invoices'] });
            } catch (err: any) {
                showToast(`فشل الإصدار: ${err.message}`, 'error');
            }
        },
        statusFilter, setStatusFilter: (v: 'all' | 'posted' | 'pending' | 'quotation' | 'sales_order' | 'unpaid' | 'overdue' | 'returned') => { setStatusFilter(v); setCurrentPage(1); },
        togglingId,
        filterStats,
        handleSavePayment: (record: any) => payMutation.mutate(record), 
    };
}

