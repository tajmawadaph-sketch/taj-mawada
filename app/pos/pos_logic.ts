"use client";
import { useState, useMemo, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';
import { useRealtimeInvalidate } from '@/lib/useRealtimeSync';
import { SALES_ACCOUNTS, CASH_ACCOUNTS, ACC } from '@/lib/account-ids';
import { syncAllWarehouseBalances } from '@/lib/inventory_engine';
import { notifyInvoiceCreated } from '@/lib/notificationService';
import { distributeManualDiscount, applyPromotions, Promotion, PosCartItem } from '@/lib/promotions_engine';
import { getLocalExpiryMetadata } from '@/app/expiry-alerts/expiry_alerts_logic';
import { executeWithOfflineSync } from '@/lib/offline/offlineExecutor';
import { getInventoryItemsList, getCustomersList } from '@/lib/cache/resources';


export function usePosLogic() {
    const { showToast } = useToast();
    const queryClient = useQueryClient();

    // 🔄 مزامنة فورية - تحديث المخزون والفواتير والورديات تلقائياً
    useRealtimeInvalidate(['warehouse_inventory', 'invoices', 'pos_shifts'], ['pos_inventory', 'invoices', 'active_pos_shift', 'pos_open_shifts']);

    const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>('');
    const [cart, setCart] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'نقدي (كاش)' | 'شبكة (مدى)' | 'آجل'>('نقدي (كاش)');
    const [partnerId, setPartnerId] = useState<string>('');
    const [delegateId, setDelegateId] = useState<string>(''); // المندوب المسؤول
    const [isDelegateLocked, setIsDelegateLocked] = useState(false); // القفل إذا كان المستخدم مندوب
    const [manualDiscountAmount, setManualDiscountAmount] = useState<number>(0);
    const [discountType, setDiscountType] = useState<'amount' | 'percentage'>('amount');

    // 🏢 التبديل الآمن بين المستودعات مع إفراغ السلة لمنع تداخل أرصدة الفروع
    const handleWarehouseChange = (newWarehouseId: string) => {
        if (!newWarehouseId || newWarehouseId === selectedWarehouseId) return;
        if (cart.length > 0) {
            const confirmMsg = "تنبيه: التبديل إلى فرع أو مستودع آخر سيقوم بإفراغ سلة المشتريات الحالية لضمان استقلالية المخزون والوردية لكل فرع.\n\nهل تريد المتابعة وتغيير الفرع؟";
            if (typeof window !== 'undefined' && !window.confirm(confirmMsg)) {
                return;
            }
            setCart([]);
        }
        setSelectedWarehouseId(newWarehouseId);
    };

    // Fetch current user and profile
    const { data: userProfile, isLoading: loadingProfile } = useQuery({
        queryKey: ['pos_user_profile'],
        queryFn: async () => {
            let userId: string | undefined;
            const { data: { session } } = await supabase.auth.getSession();
            userId = session?.user?.id;
            if (!userId) {
                const { data: { user } } = await supabase.auth.getUser();
                userId = user?.id;
            }
            if (!userId) return null;

            const { data: profile } = await supabase
                .from('profiles')
                .select('id, linked_partner_id, role')
                .eq('id', userId)
                .maybeSingle();
            return profile || { id: userId };
        }
    });

    // 👑 التحقق من صلاحيات الإدارة العليا أو المشرف (التبديل الحر بين الفروع والمستودعات)
    const isManagerOrAdmin = Boolean(
        userProfile?.role === 'super_admin' || 
        userProfile?.role === 'admin' || 
        userProfile?.role === 'manager'
    );

    // Fetch Warehouses (Points of Sale)
    const { data: warehouses = [], isLoading: loadingWarehouses } = useQuery({
        queryKey: ['pos_warehouses'],
        queryFn: async () => {
            const { data } = await supabase.from('warehouses').select('*').eq('is_active', true).order('name');
            return data || [];
        }
    });

    // Fetch delegates & employees (الموظفين والمناديب والكاشير)
    const { data: delegates = [] } = useQuery({
        queryKey: ['pos_delegates'],
        queryFn: async () => {
            const [partnersRes, profilesRes] = await Promise.all([
                supabase.from('partners').select('*').eq('is_active', true).order('name'),
                supabase.from('profiles').select('*').eq('is_active', true).order('full_name')
            ]);
            const partners = partnersRes.data || [];
            const profiles = profilesRes.data || [];
            const pMap = new Map(partners.map((p: any) => [p.id, p]));
            const nameMap = new Map(partners.map((p: any) => [p.name.trim().toLowerCase(), p]));

            const list: any[] = [];
            const seenPartnerIds = new Set<string>();

            // 1. أولاً: إضافة كافة موظفي النظام من profiles
            profiles.forEach((prof: any) => {
                const pName = (prof.full_name || prof.email?.split('@')[0] || 'موظف').trim();
                const partner = (prof.linked_partner_id && pMap.get(prof.linked_partner_id)) || nameMap.get(pName.toLowerCase());
                if (partner) seenPartnerIds.add(partner.id);
                list.push({
                    id: partner?.id || prof.linked_partner_id || prof.id,
                    name: pName,
                    partnerId: partner?.id || prof.linked_partner_id || null,
                    userId: prof.id,
                    role: prof.role || partner?.job_role || 'كاشير / موظف',
                    phone: prof.phone_number || partner?.phone || '',
                    source: 'profile'
                });
            });

            // 2. ثانياً: إضافة باقي الشركاء من نوع موظف أو مندوب أو كاشير أو سائق
            partners.forEach((part: any) => {
                if (!seenPartnerIds.has(part.id)) {
                    const type = (part.partner_type || '').trim();
                    if (['مندوب', 'موظف', 'كاشير', 'سائق', 'عامل', 'delegate', 'employee', 'driver'].includes(type) || part.job_role) {
                        list.push({
                            id: part.id,
                            name: part.name,
                            partnerId: part.id,
                            userId: null,
                            role: part.job_role || type || 'مندوب',
                            phone: part.phone || '',
                            source: 'partner'
                        });
                    }
                }
            });

            return list;
        }
    });

    // Fetch Active Shift (حماية أمنية وبأمان تام دون أخطاء PGRST200)
    const { data: activeShift, isLoading: loadingShift } = useQuery({
        queryKey: ['active_pos_shift', selectedWarehouseId, delegates, warehouses],
        queryFn: async () => {
            if (!selectedWarehouseId) return null;

            const { data, error } = await supabase
                .from('pos_shifts')
                .select('*')
                .eq('status', 'open')
                .eq('warehouse_id', selectedWarehouseId)
                .order('opened_at', { ascending: false })
                .limit(1);

            if (error) {
                console.warn('Error fetching active pos shift:', error);
                return null;
            }

            const rawShift = data?.[0];
            if (!rawShift) return null;

            const wh = warehouses.find((w: any) => w.id === rawShift.warehouse_id);
            const del = delegates.find((d: any) => 
                (rawShift.delegate_id && (d.id === rawShift.delegate_id || d.partnerId === rawShift.delegate_id)) ||
                (rawShift.user_id && d.userId === rawShift.user_id)
            );

            return {
                ...rawShift,
                warehouse: wh || { id: rawShift.warehouse_id, name: 'منفذ البيع' },
                delegate: del ? { id: del.partnerId || del.id, name: del.name, phone: del.phone } : null
            };
        },
        enabled: !!selectedWarehouseId
    });

    // 🔒 مزامنة المندوب المسؤول تلقائياً مع الوردية النشطة للمستودع المختار
    useEffect(() => {
        if (activeShift && activeShift.warehouse_id === selectedWarehouseId) {
            if (activeShift.delegate_id && activeShift.delegate_id !== delegateId) {
                setDelegateId(activeShift.delegate_id);
            } else if (!activeShift.delegate_id && delegateId) {
                setDelegateId('');
            }
        }
    }, [activeShift?.id, activeShift?.delegate_id, selectedWarehouseId]);

    // Fetch all currently open shifts across the system (استعراض ورديات كل الموظفين والمنافذ)
    const { data: allOpenShifts = [], isLoading: loadingAllShifts } = useQuery({
        queryKey: ['pos_open_shifts', warehouses, delegates],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('pos_shifts')
                .select('*')
                .eq('status', 'open')
                .order('opened_at', { ascending: false });

            if (error) {
                console.warn('Error fetching all open shifts:', error);
                return [];
            }

            return (data || []).map((s: any) => {
                const wh = warehouses.find((w: any) => w.id === s.warehouse_id);
                const del = delegates.find((d: any) => 
                    (s.delegate_id && (d.id === s.delegate_id || d.partnerId === s.delegate_id)) ||
                    (s.user_id && d.userId === s.user_id)
                );
                return {
                    ...s,
                    warehouse: wh || { id: s.warehouse_id, name: 'منفذ البيع' },
                    delegate: del ? { id: del.partnerId || del.id, name: del.name, phone: del.phone } : null
                };
            });
        }
    });

    // 🚚 جلب أمر التشغيل المفتوح تلقائياً إذا كان منفذ البيع المختار سيارة
    const { data: activeFleetOperation = null } = useQuery({
        queryKey: ['pos_active_fleet_op', selectedWarehouseId],
        enabled: !!selectedWarehouseId,
        queryFn: async () => {
            if (!selectedWarehouseId) return null;
            const currentWh = warehouses.find(w => w.id === selectedWarehouseId);
            if (!currentWh || currentWh.type !== 'vehicle') return null;

            const targetVehicleId = currentWh.vehicle_id || currentWh.id;

            const { data, error } = await supabase
                .from('fleet_operations')
                .select(`
                    id,
                    operation_number,
                    operation_date,
                    status,
                    driver_id,
                    vehicle_id,
                    warehouse_id,
                    driver:partners!driver_id(id, name, phone),
                    vehicle:fleet_vehicles(id, plate_number)
                `)
                .or(`vehicle_id.eq.${targetVehicleId},warehouse_id.eq.${selectedWarehouseId}`)
                .neq('status', 'مغلق')
                .neq('status', 'closed')
                .order('operation_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn('Could not fetch active fleet operation for POS:', error);
                return null;
            }
            return data || null;
        }
    });

    // مزامنة المندوب تلقائياً من أمر تشغيل الرحلة إذا كان منفذ البيع سيارة والمندوب غير مقفل
    useEffect(() => {
        if (activeFleetOperation?.driver_id && !isDelegateLocked) {
            setDelegateId(activeFleetOperation.driver_id);
        }
    }, [activeFleetOperation, isDelegateLocked]);

    // Auto-select delegate and warehouse based on logged-in user
    useEffect(() => {
        const profile: any = userProfile;
        if (!loadingProfile && !loadingWarehouses) {
            // البحث عن الموظف الحالي في قائمة الموظفين
            const myEmp = delegates.find((d: any) => 
                (profile?.id && d.userId === profile.id) ||
                (profile?.linked_partner_id && (d.partnerId === profile.linked_partner_id || d.id === profile.linked_partner_id))
            );

            const targetId = myEmp?.partnerId || myEmp?.id || profile?.linked_partner_id;

            if (targetId) {
                setDelegateId(targetId);
                if (profile.role !== 'admin' && profile.role !== 'super_admin' && profile.role !== 'manager') {
                    setIsDelegateLocked(true);
                }
                
                // البحث عن مستودع الموظف / المندوب
                if (warehouses.length > 0) {
                    const assignedWh = warehouses.find((w: any) => w.delegate_id === targetId);
                    if (assignedWh) {
                        setSelectedWarehouseId(assignedWh.id);
                    } else if (!selectedWarehouseId) {
                        setSelectedWarehouseId(warehouses[0].id); // fallback
                    }
                }
            } else {
                // ليس مندوب (مستخدم عادي/أدمن)
                setIsDelegateLocked(false);
                if (!selectedWarehouseId && warehouses.length > 0) {
                    setSelectedWarehouseId(warehouses[0].id);
                }
            }
        }
    }, [userProfile, warehouses, loadingProfile, loadingWarehouses, delegates]);

    const [onlyLowStock, setOnlyLowStock] = useState(false);

    // Fetch available items in the selected POS
    const { data: inventoryItems = [], isLoading: loadingItems } = useQuery({
        queryKey: ['pos_inventory', selectedWarehouseId],
        queryFn: async () => {
            if (!selectedWarehouseId) return [];

            // 1. Fetch Item Master Catalog with RAM Cache & IndexedDB Offline Fallback
            const catalog = await getInventoryItemsList();

            const localExp = getLocalExpiryMetadata();
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 2. Fetch inventory for selected warehouse with offline protection
            let whInv: any[] = [];
            try {
                const { data: invData, error: whErr } = await supabase
                    .from('warehouse_inventory')
                    .select('id, quantity, item_id')
                    .eq('warehouse_id', selectedWarehouseId);
                if (!whErr && invData) whInv = invData;
            } catch (whErr) {
                console.warn('⚠️ [POS Logic] تعذر جلب أرصدة المستودع سحابياً، سيتم الاعتماد على رصيد الكاش المحلي:', whErr);
            }

            const whMap = new Map();
            (whInv || []).forEach((row: any) => {
                whMap.set(row.item_id, row);
            });

            return (catalog || []).map((item: any) => {
                const whRow = whMap.get(item.id);
                // 🛡️ حماية صارمة لمنع احتساب وعرض أي كمية سالبة نهائياً
                let availableQty = whRow ? Math.max(0, Number(whRow.quantity || 0)) : 0;
                
                // Fallback for main warehouse if not yet recorded in warehouse_inventory
                if (!whRow && selectedWarehouseId === '11111111-1111-1111-1111-111111111111') {
                    availableQty = Math.max(0, Number(item.current_quantity || 0));
                }

                const reorderLvl = Number(item.reorder_level) || 5;
                const isCritical = availableQty <= reorderLvl;
                const isNear = availableQty > reorderLvl && availableQty <= reorderLvl * 1.5;

                const cachedMeta = localExp[item.id] || {};
                const expiryDate = item.expiry_date || cachedMeta.expiry_date || null;
                const batchNum = item.batch_number || cachedMeta.batch_number || null;
                const alertDays = Number(item.alert_before_days || cachedMeta.alert_before_days || 30);

                let daysLeft: number | null = null;
                let isExpired = false;
                let isNearExpiry = false;

                if (expiryDate) {
                    const exp = new Date(expiryDate);
                    exp.setHours(0, 0, 0, 0);
                    const diffTime = exp.getTime() - today.getTime();
                    daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (daysLeft <= 0) {
                        isExpired = true;
                    } else if (daysLeft <= alertDays) {
                        isNearExpiry = true;
                    }
                }

                return {
                    id: item.id,
                    name: item.name || 'صنف غير معروف',
                    price: Number(item.default_price) || 0,
                    suggested_price: Number(item.suggested_price) || Number(item.default_price) || 0,
                    unit: item.unit || 'حبة',
                    code: item.code,
                    available_qty: availableQty,
                    reorder_level: reorderLvl,
                    isCriticalLow: isCritical,
                    isNearLow: isNear,
                    is_returnable_bottle: Boolean(item.is_returnable_bottle),
                    tax_rate: (item.tax_rate !== undefined && item.tax_rate !== null) ? Number(item.tax_rate) : 15,
                    expiry_date: expiryDate,
                    batch_number: batchNum,
                    alert_before_days: alertDays,
                    days_left: daysLeft,
                    isExpired,
                    isNearExpiry
                };
            });
        },
        enabled: !!selectedWarehouseId
    });

    const lowStockCount = useMemo(() => {
        return inventoryItems.filter((i: any) => i.isCriticalLow).length;
    }, [inventoryItems]);

    const expiredCount = useMemo(() => {
        return inventoryItems.filter((i: any) => i.isExpired).length;
    }, [inventoryItems]);

    const nearExpiryCount = useMemo(() => {
        return inventoryItems.filter((i: any) => i.isNearExpiry).length;
    }, [inventoryItems]);

    // Fetch customers with RAM Cache & IndexedDB Offline Fallback
    const { data: customers = [] } = useQuery({
        queryKey: ['pos_customers'],
        queryFn: async () => {
            return getCustomersList();
        }
    });

    const filteredItems = useMemo(() => {
        let items = inventoryItems;
        if (onlyLowStock) {
            items = items.filter((i: any) => i.isCriticalLow || i.isNearLow);
        }
        if (searchQuery) {
            items = items.filter((i: any) => i.name?.toLowerCase().includes(searchQuery.toLowerCase()));
        }
        return items;
    }, [inventoryItems, searchQuery, onlyLowStock]);

    const [selectedItemForCart, setSelectedItemForCart] = useState<any>(null);

    const addToCart = (item: any, qty: number = 1, price?: number) => {
        if (!activeShift) {
            setTimeout(() => showToast("⛔ يجب بدء الوردية أولاً قبل إجراء أي مبيعات!", "warning"), 0);
            setIsShiftOpenModalOpen(true);
            return;
        }
        if (item.isExpired) {
            setTimeout(() => showToast(`⛔ منع البيع: الصنف (${item.name}) منتهي الصلاحية بتاريخ ${item.expiry_date}! يمنع بيع السلع منتهية الصلاحية.`, 'error'), 0);
            return;
        }
        if (item.isNearExpiry) {
            setTimeout(() => showToast(`⏳ تنبيه: الصنف (${item.name}) قارب على انتهاء الصلاحية (متبقي ${item.days_left} يوم)!`, 'warning'), 0);
        }
        setCart(prev => {
            const existing = prev.find(i => i.id === item.id);
            const unitPrice = price !== undefined ? price : (existing ? existing.unit_price : (item.suggested_price || 0));
            
            if (existing) {
                if (existing.qty + qty > item.available_qty) {
                    setTimeout(() => showToast(`⛔ تجاوز المخزون ممنوع! الكمية المطلوبة (${existing.qty + qty}) تتجاوز الرصيد المتوفر (${item.available_qty})`, 'error'), 0);
                    return prev;
                }
                return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + qty, unit_price: unitPrice } : i);
            }
            if (qty > item.available_qty) {
                setTimeout(() => showToast(`⛔ تجاوز المخزون ممنوع! الكمية المطلوبة (${qty}) تتجاوز الرصيد المتوفر (${item.available_qty})`, 'error'), 0);
                return prev;
            }
            return [...prev, { ...item, qty, unit_price: unitPrice }];
        });
    };

    const handleItemClick = (item: any) => {
        if (!activeShift) {
            showToast("⛔ يجب بدء الوردية أولاً قبل اختيار الأصناف!", "warning");
            setIsShiftOpenModalOpen(true);
            return;
        }
        if (item.isExpired) {
            showToast(`⛔ لا يمكن بيع (${item.name}): الصنف منتهي الصلاحية بتاريخ ${item.expiry_date}!`, 'error');
            return;
        }
        if (item.isNearExpiry) {
            showToast(`⏳ تنبيه: الصنف (${item.name}) قارب على انتهاء الصلاحية (متبقي ${item.days_left} يوم)!`, 'warning');
        }
        setSelectedItemForCart({ ...item, selected_qty: 1, selected_price: item.suggested_price || 0 });
    };

    const confirmAddToCart = () => {
        if (!activeShift) {
            showToast("⛔ يجب بدء الوردية أولاً!", "warning");
            setIsShiftOpenModalOpen(true);
            return;
        }
        if (selectedItemForCart) {
            if (selectedItemForCart.isExpired) {
                showToast(`⛔ لا يمكن بيع (${selectedItemForCart.name}): الصنف منتهي الصلاحية!`, 'error');
                return;
            }
            if (selectedItemForCart.selected_qty > selectedItemForCart.available_qty) {
                showToast(`⛔ منع البيع: الكمية المطلوبة (${selectedItemForCart.selected_qty}) تتجاوز الرصيد المتوفر في المستودع (${selectedItemForCart.available_qty})!`, 'error');
                return;
            }
            addToCart(selectedItemForCart, selectedItemForCart.selected_qty, selectedItemForCart.selected_price);
            setSelectedItemForCart(null);
        }
    };


    const handleBarcodeScan = (barcodeOrItem: any) => {
        if (!barcodeOrItem) return;

        if (!activeShift) {
            showToast("⛔ يجب بدء الوردية أولاً قبل مسح الباركود وإجراء المبيعات!", "warning");
            setIsShiftOpenModalOpen(true);
            return;
        }

        let item: any = null;
        let cleanCode = '';

        if (typeof barcodeOrItem === 'object' && barcodeOrItem.id) {
            item = barcodeOrItem;
            cleanCode = item.code || item.barcode || item.name || '';
        } else {
            cleanCode = String(barcodeOrItem).trim();
            if (!cleanCode) return;

            const norm = (s: any) => String(s || '').trim().toLowerCase();
            const normClean = norm(cleanCode);
            const normCleanNoZero = normClean.replace(/^0+/, '');

            // 1. المطابقة الدقيقة عبر الباركود أو كود الصنف أو المعرف أو الاسم
            item = inventoryItems.find((i: any) => {
                const itemCode = norm(i.code);
                const itemBarcode = norm(i.barcode);
                const itemId = norm(i.id);
                const itemName = norm(i.name);

                return (
                    itemCode === normClean ||
                    itemBarcode === normClean ||
                    itemId === normClean ||
                    itemName === normClean ||
                    (normCleanNoZero && (itemCode.replace(/^0+/, '') === normCleanNoZero || itemBarcode.replace(/^0+/, '') === normCleanNoZero))
                );
            });

            // 2. مطابقة مرنة في حال تم تمرير جزء من الاسم أو الكود
            if (!item && inventoryItems.length > 0) {
                const matches = inventoryItems.filter((i: any) => 
                    norm(i.name).includes(normClean) || 
                    (i.code && norm(i.code).includes(normClean)) ||
                    (i.barcode && norm(i.barcode).includes(normClean))
                );
                if (matches.length === 1) {
                    item = matches[0];
                }
            }
        }

        if (!item) {
            showToast(`⚠️ الصنف غير موجود أو غير متوفر في هذا المنفذ: ${cleanCode}`, 'error');
            return;
        }

        if (item.isExpired) {
            showToast(`⛔ منع البيع: الصنف (${item.name}) منتهي الصلاحية بتاريخ ${item.expiry_date}! يمنع بيع السلع المنتهية للمستهلكين.`, 'error');
            return;
        }

        if (item.isNearExpiry) {
            showToast(`⏳ تنبيه كاشير: الصنف (${item.name}) قارب على انتهاء الصلاحية (متبقي ${item.days_left} يوم)`, 'warning');
        }

        // 3. إضافة حبة أولى إذا لم يكن في السلة، أو زيادة العدد إذا كان موجوداً مسبقاً
        let finalQty = 1;
        let isIncrement = false;
        let isOutOfStock = false;

        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            const unitPrice = item.suggested_price || item.default_price || (existing ? existing.unit_price : 0);

            if (existing) {
                if (existing.qty + 1 > item.available_qty) {
                    isOutOfStock = true;
                    return prev;
                }
                isIncrement = true;
                finalQty = existing.qty + 1;
                return prev.map(c => c.id === item.id ? { ...c, qty: existing.qty + 1, unit_price: unitPrice } : c);
            }

            if (1 > item.available_qty) {
                isOutOfStock = true;
                return prev;
            }

            finalQty = 1;
            return [...prev, { ...item, qty: 1, unit_price: unitPrice }];
        });

        if (isOutOfStock) {
            showToast(`⛔ تجاوز المخزون ممنوع! الرصيد المتاح من (${item.name}) هو ${item.available_qty} ${item.unit || ''} فقط`, 'error');
            return;
        }

        // 4. نغمة تأكيد الكاشير واهتزاز الجوال
        if (typeof window !== 'undefined') {
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    const ctx = new AudioCtx();
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(1760, ctx.currentTime);
                    gain.gain.setValueAtTime(0.35, ctx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                }
            } catch {}
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
                try { navigator.vibrate([80]); } catch {}
            }
        }

        // 5. إشعار مرئي سريع وواضح للكمية المحدثة
        if (isIncrement) {
            showToast(`➕ (${item.name}) — الكمية بالسلة: ${finalQty} ${item.unit || ''}`, 'success');
        } else {
            showToast(`🛒 تمت إضافة (${item.name}) إلى السلة`, 'success');
        }
    };

    const updateCartItemPrice = (id: string, price: number) => {
        setCart(prev => prev.map(i => i.id === id ? { ...i, unit_price: price } : i));
    };

    const updateCartItemQty = (id: string, qty: number) => {
        const item = inventoryItems.find((i: any) => i.id === id);
        if (item && qty > item.available_qty) {
            showToast(`⛔ تجاوز المخزون ممنوع! الرصيد المتاح لهذا الصنف هو ${item.available_qty} فقط`, 'error');
            return;
        }
        if (qty <= 0) {
            setCart(prev => prev.filter(i => i.id !== id));
            return;
        }
        setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
    };

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.id !== id));
    };

    const [isTaxInclusive, setIsTaxInclusive] = useState<boolean>(true);
    const [lastInvoice, setLastInvoice] = useState<any>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState<boolean>(false);
    const [isThermalPrintModalOpen, setIsThermalPrintModalOpen] = useState<boolean>(false);
    const [isShiftCloseModalOpen, setIsShiftCloseModalOpen] = useState<boolean>(false);
    const [isShiftOpenModalOpen, setIsShiftOpenModalOpen] = useState<boolean>(false);
    const [isOpenShiftsDrawerOpen, setIsOpenShiftsDrawerOpen] = useState<boolean>(false);
    const [hasAutoOpenedShift, setHasAutoOpenedShift] = useState<boolean>(false);

    // تذكير بفتح الوردية لمرة واحدة عند التحميل للكاشير/المندوب
    useEffect(() => {
        if (!loadingShift && !loadingProfile && selectedWarehouseId && !activeShift && !hasAutoOpenedShift) {
            setIsShiftOpenModalOpen(true);
            setHasAutoOpenedShift(true);
        }
    }, [loadingShift, loadingProfile, selectedWarehouseId, activeShift, hasAutoOpenedShift]);

    // Fetch Active Promotions safely without client 404s
    const { data: promotions = [] } = useQuery({
        queryKey: ['active_promotions'],
        queryFn: async () => {
            try {
                const res = await fetch('/api/pos/promotions');
                if (!res.ok) return [];
                const json = await res.json();
                return (json.data || []) as Promotion[];
            } catch {
                return [];
            }
        }
    });

    const processedCart = useMemo(() => {
        let currentCart = [...cart];
        
        if (promotions.length > 0) {
            currentCart = applyPromotions(currentCart, promotions);
        }
        
        if (manualDiscountAmount > 0) {
            currentCart = distributeManualDiscount(currentCart, manualDiscountAmount, discountType);
        } else {
             currentCart = currentCart.map(item => {
                 const gross = (item.unit_price || item.price || 0) * (item.qty || item.quantity);
                 const d = (item.discount || 0) + (item.promo_discount || 0);
                 return { ...item, total: gross - d };
             });
        }
        
        return currentCart;
    }, [cart, promotions, manualDiscountAmount, discountType]);

    const cartTotal = useMemo(() => {
        let taxableSubtotal = 0;
        let exemptSubtotal = 0;
        let totalTax = 0;
        
        processedCart.forEach(item => {
            const itemTotal = Number(item.total) || 0;
            const itemTaxRate = (item.tax_rate !== undefined && item.tax_rate !== null) ? Number(item.tax_rate) : 15;
            
            if (itemTaxRate === 0) {
                exemptSubtotal += itemTotal;
            } else {
                if (isTaxInclusive) {
                    const lineSub = itemTotal / (1 + (itemTaxRate / 100));
                    const lineTax = itemTotal - lineSub;
                    taxableSubtotal += lineSub;
                    totalTax += lineTax;
                } else {
                    taxableSubtotal += itemTotal;
                    totalTax += itemTotal * (itemTaxRate / 100);
                }
            }
        });
        
        const subtotal = Math.round((taxableSubtotal + exemptSubtotal) * 100) / 100;
        const tax = Math.round(totalTax * 100) / 100;
        const total = isTaxInclusive 
            ? Math.round((taxableSubtotal + totalTax + exemptSubtotal) * 100) / 100
            : Math.round((subtotal + tax) * 100) / 100;

        return { 
            subtotal, 
            tax, 
            total,
            taxableSubtotal: Math.round(taxableSubtotal * 100) / 100,
            exemptSubtotal: Math.round(exemptSubtotal * 100) / 100
        };
    }, [processedCart, isTaxInclusive]);

    const checkoutMutation = useMutation({
        mutationFn: async () => {
            // 🔒 حماية صارمة: منع أي عملية بيع بدون بدء وفتح الوردية أولاً
            if (!activeShift) {
                setIsShiftOpenModalOpen(true);
                throw new Error("⛔ منع أمني: لا يمكن إتمام أي عملية بيع بدون بدء وفتح الوردية أولاً! يرجى الضغط على 'بدء الوردية' لتسجيل العهدة وبدء البيع.");
            }
            if (cart.length === 0) throw new Error("السلة فارغة!");
            if (!selectedWarehouseId) throw new Error("يرجى تحديد منفذ البيع!");

            const autoNumber = `INV-POS-${Date.now().toString().slice(-6)}`;
            
            const linesData = processedCart.map(item => ({
                item_id: item.inventory_items?.id || item.id,
                name: item.inventory_items?.name || item.name,
                quantity: item.quantity || item.qty,
                unit_price: item.selected_price || item.unit_price || item.price || 0,
                discount: (item.discount || 0) + (item.promo_discount || 0),
                total: item.total !== undefined ? item.total : (((item.quantity || item.qty) * (item.selected_price || item.unit_price || item.price || 0)) - ((item.discount || 0) + (item.promo_discount || 0))),
                tax_rate: (item.tax_rate !== undefined && item.tax_rate !== null) ? Number(item.tax_rate) : 15,
                warehouse_id: selectedWarehouseId,
                is_returnable_bottle: Boolean(item.is_returnable_bottle)
            }));

            const totalInvoiceDiscount = processedCart.reduce((sum, item) => sum + (item.discount || 0) + (item.promo_discount || 0), 0);

            // Resolve fleet_operation_id if warehouse is a vehicle
            let fleetOpId = activeFleetOperation?.id || null;
            if (!fleetOpId && selectedWarehouseId) {
                const wh = warehouses.find(w => w.id === selectedWarehouseId);
                if (wh?.type === 'vehicle') {
                    const targetVehicleId = wh.vehicle_id || wh.id;
                    const { data: op } = await supabase.from('fleet_operations')
                        .select('id, driver_id')
                        .or(`vehicle_id.eq.${targetVehicleId},warehouse_id.eq.${selectedWarehouseId}`)
                        .neq('status', 'مغلق')
                        .neq('status', 'closed')
                        .order('operation_date', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    if (op) {
                        fleetOpId = op.id;
                    }
                }
            }

            // 🔑 الحسابات من الملف المركزي — بدون استعلامات DB إضافية
            // 123 العملاء (ذمم مدينون) — 41 إيرادات المبيعات

            // 1. إنشاء الفاتورة بحالة معلق
            const invoiceHeader = {
                invoice_number: autoNumber,
                date: new Date().toISOString().split('T')[0],
                partner_id: partnerId || null,
                client_name: !partnerId ? 'عميل نقدي' : customers.find((c: any) => c.id === partnerId)?.name,
                total_amount: cartTotal.total,
                taxable_amount: cartTotal.taxableSubtotal !== undefined ? cartTotal.taxableSubtotal : cartTotal.subtotal,
                tax_amount: cartTotal.tax,
                materials_discount: totalInvoiceDiscount, // Add total discount here
                status: 'معتمد',
                warehouse_id: selectedWarehouseId,
                delegate_id: delegateId || null,
                payment_method: paymentMethod,
                paid_amount: paymentMethod !== 'آجل' ? cartTotal.total : 0,
                debit_account_id: SALES_ACCOUNTS.AR,        // 123 العملاء
                credit_account_id: SALES_ACCOUNTS.REVENUE,  // 41 إيرادات المبيعات
                tax_acc_id: SALES_ACCOUNTS.VAT,             // 215 ضريبة القيمة المضافة
                lines_data: linesData,
                shift_id: activeShift?.id,
                fleet_operation_id: fleetOpId,
                payment_status: paymentMethod !== 'آجل' ? 'paid' : 'unpaid'
            };

            // 🔌 إتمام العملية عبر منفذ الأوفلاين الذكي (Cloud First مع حفظ فوري في طابور الأوفلاين عند غياب النت)
            const execution = await executeWithOfflineSync({
                cloudOperation: async () => {
                    const { data: insertedInv, error: invErr } = await supabase.from('invoices').insert([invoiceHeader]).select().single();
                    if (invErr) throw new Error(invErr.message);

                    // 🔔 بث إشعار فوري للفاتورة في النظام وعبر الجوال
                    notifyInvoiceCreated({
                        invoiceNumber: invoiceHeader.invoice_number,
                        clientName: invoiceHeader.client_name,
                        totalAmount: Number(invoiceHeader.total_amount) || 0,
                        invoiceId: insertedInv?.id
                    }).catch(() => {});

                    // 🔄 التحديث التلقائي لعهدة العبوات والمستلزمات (إن وُجدت أصناف فوارغ)
                    const returnableBottlesCount = cart.reduce((acc, it) => acc + (it.is_returnable_bottle ? (Number(it.qty) || Number(it.quantity) || 0) : 0), 0);
                    if (returnableBottlesCount > 0) {
                        // 1. تسجيل عهدة الفوارغ في حساب العميل المسجل
                        if (partnerId) {
                            try {
                                const { data: pRec } = await supabase.from('partners').select('bottle_custody').eq('id', partnerId).maybeSingle();
                                const currentCustody = Number(pRec?.bottle_custody || 0);
                                await supabase.from('partners').update({
                                    bottle_custody: currentCustody + returnableBottlesCount
                                }).eq('id', partnerId);
                            } catch (custodyErr) {
                                console.error('Error updating partner bottle custody:', custodyErr);
                            }
                        }

                        // 2. تحديث عداد الفوارغ المباعة في الوردية الحالية
                        if (activeShift?.id) {
                            try {
                                const { data: sRec } = await supabase.from('pos_shifts').select('bottles_sold').eq('id', activeShift.id).maybeSingle();
                                const curSold = Number(sRec?.bottles_sold || 0);
                                await supabase.from('pos_shifts').update({
                                    bottles_sold: curSold + returnableBottlesCount
                                }).eq('id', activeShift.id);
                            } catch (shiftErr) {
                                console.error('Error updating shift bottles_sold:', shiftErr);
                            }
                        }
                    }

                    // Deduct from warehouse and create inventory transaction history
                    for (let line of linesData) {
                        const txNumber = 'TX-POS-' + Math.floor(Math.random() * 1000000);
                        await supabase.from('inventory_transactions').insert([{
                            transaction_number: txNumber,
                            transaction_date: new Date().toISOString().split('T')[0],
                            type: 'sales_deduction',
                            quantity: line.quantity,
                            item_id: line.item_id,
                            partner_id: partnerId || null,
                            unit_price: line.unit_price,
                            total_price: (line as any).total_price || (line as any).total || (line.quantity * line.unit_price),
                            status: 'approved',
                            invoice_id: insertedInv?.id || null,
                            warehouse_id: line.warehouse_id,
                            shift_id: activeShift?.id,
                            fleet_operation_id: fleetOpId
                        }]);

                        const { data: invItem } = await supabase.from('warehouse_inventory')
                            .select('quantity, id').eq('item_id', line.item_id).eq('warehouse_id', line.warehouse_id).maybeSingle();
                        if (invItem) {
                            const newQty = Math.max(0, (Number(invItem.quantity) || 0) - line.quantity);
                            await supabase.from('warehouse_inventory')
                                .update({ quantity: newQty })
                                .eq('id', invItem.id);
                        } else {
                            await supabase.from('warehouse_inventory')
                                .insert([{
                                    warehouse_id: line.warehouse_id,
                                    item_id: line.item_id,
                                    quantity: 0
                                }]);
                        }

                        if (line.warehouse_id === '11111111-1111-1111-1111-111111111111') {
                            const { data: catItem } = await supabase.from('inventory_items')
                                .select('current_quantity').eq('id', line.item_id).single();
                            if (catItem) {
                                const newCatQty = Math.max(0, (Number(catItem.current_quantity) || 0) - line.quantity);
                                await supabase.from('inventory_items')
                                    .update({ current_quantity: newCatQty })
                                    .eq('id', line.item_id);
                            }
                        }
                    }

                    // AUTO POST INVOICE (Creates Journal Lines & guarantees status is معتمد)
                    if (insertedInv) {
                        let postSuccess = false;
                        try {
                            const { error: postErr } = await supabase.rpc('post_invoices_bulk', { p_ids: [insertedInv.id] });
                            if (!postErr) postSuccess = true;
                        } catch {}

                        if (!postSuccess) {
                            try {
                                const { data: jh } = await supabase.from('journal_headers').insert([{
                                    entry_date: insertedInv.date || new Date().toISOString().split('T')[0],
                                    description: `فاتورة مبيعات نقاط بيع رقم ${insertedInv.invoice_number || autoNumber}`,
                                    reference_id: insertedInv.id,
                                    v_type: 'invoice',
                                    status: 'posted',
                                    fleet_operation_id: fleetOpId || null
                                }]).select().single();

                                if (jh) {
                                    const jLines: any[] = [];
                                    const tot = Number(insertedInv.total_amount || 0);
                                    const tx = Number(insertedInv.tax_amount || 0);
                                    const txbl = Number(insertedInv.taxable_amount || (tot - tx));

                                    if (tot > 0) {
                                        jLines.push({
                                            header_id: jh.id,
                                            account_id: insertedInv.debit_account_id || SALES_ACCOUNTS.AR,
                                            partner_id: insertedInv.partner_id || null,
                                            debit: tot,
                                            credit: 0,
                                            notes: `استحقاق فاتورة مبيعات نقاط بيع #${insertedInv.invoice_number || autoNumber}`,
                                            fleet_operation_id: fleetOpId || null,
                                            delegate_id: delegateId || null
                                        });
                                    }
                                    if (txbl > 0) {
                                        jLines.push({
                                            header_id: jh.id,
                                            account_id: insertedInv.credit_account_id || SALES_ACCOUNTS.REVENUE,
                                            partner_id: insertedInv.partner_id || null,
                                            debit: 0,
                                            credit: txbl,
                                            notes: `إيراد مبيعات نقاط بيع #${insertedInv.invoice_number || autoNumber}`,
                                            fleet_operation_id: fleetOpId || null,
                                            delegate_id: delegateId || null
                                        });
                                    }
                                    if (tx > 0) {
                                        jLines.push({
                                            header_id: jh.id,
                                            account_id: insertedInv.tax_acc_id || SALES_ACCOUNTS.VAT,
                                            partner_id: insertedInv.partner_id || null,
                                            debit: 0,
                                            credit: tx,
                                            notes: `ضريبة القيمة المضافة فاتورة #${insertedInv.invoice_number || autoNumber}`,
                                            tax_amount: tx,
                                            fleet_operation_id: fleetOpId || null,
                                            delegate_id: delegateId || null
                                        });
                                    }
                                    if (jLines.length > 0) {
                                        await supabase.from('journal_lines').insert(jLines);
                                    }
                                }
                            } catch (jhErr) {
                                console.warn('POS direct journal creation notice:', jhErr);
                            }
                        }

                        // 🧾 إنشاء وترحيل سند القبض تلقائياً للمبيعات النقدية والشبكة (كل ما هو غير آجل)
                        if (paymentMethod !== 'آجل' && cartTotal.total > 0) {
                            const isCardPayment = paymentMethod === 'شبكة (مدى)' || paymentMethod.includes('شبك') || paymentMethod.includes('مدى') || paymentMethod.includes('بطاق') || paymentMethod.includes('بنك');
                            const appropriateSafeAcc = isCardPayment 
                                ? CASH_ACCOUNTS.BANKS 
                                : (delegateId ? ACC.EMPLOYEE_CUSTODY : CASH_ACCOUNTS.CASH_BOX);

                            try {
                                const { error: rpcReceiptErr } = await supabase.rpc('auto_create_pos_receipt', {
                                    p_invoice_id: insertedInv.id
                                });
                                if (rpcReceiptErr) {
                                    console.warn('auto_create_pos_receipt RPC error, using direct insert fallback:', rpcReceiptErr);
                                    const autoRvNumber = `RV-POS-${Date.now().toString().slice(-6)}`;
                                    const { data: insertedRv } = await supabase.from('receipt_vouchers').insert([{
                                        receipt_number: autoRvNumber,
                                        date: new Date().toISOString().split('T')[0],
                                        amount: cartTotal.total,
                                        payment_method: paymentMethod,
                                        notes: `سداد فاتورة مبيعات نقاط بيع #${insertedInv.invoice_number || autoNumber}`,
                                        invoice_id: insertedInv.id,
                                        partner_id: partnerId || null,
                                        delegate_id: delegateId || null,
                                        status: 'معتمد',
                                        shift_id: activeShift?.id || null,
                                        fleet_operation_id: fleetOpId || null,
                                        safe_bank_acc_id: appropriateSafeAcc,
                                        partner_acc_id: SALES_ACCOUNTS.AR
                                    }]).select().single();

                                    if (insertedRv) {
                                        const { data: rvJh } = await supabase.from('journal_headers').insert([{
                                            entry_date: insertedRv.date || new Date().toISOString().split('T')[0],
                                            description: `سند قبض مبيعات نقاط بيع رقم ${insertedRv.receipt_number || ''}`,
                                            reference_id: insertedRv.id,
                                            v_type: 'receipt_voucher',
                                            status: 'posted',
                                            fleet_operation_id: fleetOpId || null
                                        }]).select().single();

                                        if (rvJh) {
                                            await supabase.from('journal_lines').insert([
                                                {
                                                    header_id: rvJh.id,
                                                    account_id: appropriateSafeAcc,
                                                    partner_id: partnerId || null,
                                                    debit: cartTotal.total,
                                                    credit: 0,
                                                    notes: `تحصيل مبيعات نقاط بيع #${insertedInv.invoice_number || autoNumber}`,
                                                    fleet_operation_id: fleetOpId || null,
                                                    delegate_id: delegateId || null
                                                },
                                                {
                                                    header_id: rvJh.id,
                                                    account_id: SALES_ACCOUNTS.AR,
                                                    partner_id: partnerId || null,
                                                    debit: 0,
                                                    credit: cartTotal.total,
                                                    notes: `سداد عميل مبيعات نقاط بيع #${insertedInv.invoice_number || autoNumber}`,
                                                    fleet_operation_id: fleetOpId || null,
                                                    delegate_id: delegateId || null
                                                }
                                            ]);
                                        }
                                    }
                                } else {
                                    await supabase.from('receipt_vouchers').update({
                                        shift_id: activeShift?.id || null,
                                        fleet_operation_id: fleetOpId || null,
                                        delegate_id: delegateId || null,
                                        safe_bank_acc_id: appropriateSafeAcc,
                                        status: 'معتمد'
                                    }).eq('invoice_id', insertedInv.id);
                                }
                            } catch (receiptErr) {
                                console.error('Error auto-creating receipt voucher for POS sale:', receiptErr);
                            }
                        }

                        // 🔄 مزامنة أرصدة كافة المستودعات ومنع أي انحرافات أو أرقام سالبة فوراً
                        try {
                            await syncAllWarehouseBalances();
                        } catch (syncErr) {
                            console.warn('Sync warehouse balances warning in POS:', syncErr);
                        }
                    }

                    return insertedInv;
                },
                offlineBackup: {
                    type: 'invoice',
                    action: 'insert',
                    payload: invoiceHeader
                }
            });

            const finalInvoice = execution.data || {
                id: `offline_${Date.now()}`,
                ...invoiceHeader
            };

            return {
                ...finalInvoice,
                isOffline: Boolean(execution.isOffline)
            };
        },
        onSuccess: (data: any) => {
            setLastInvoice(data);
            setIsThermalPrintModalOpen(true);
            if (data?.isOffline) {
                showToast("تم حفظ الفاتورة محلياً بنجاح وجاهزة للطباعة الفورية! (وضع الأوفلاين) 📴", "success");
            } else {
                showToast("تمت عملية البيع وإصدار سند القبض بنجاح! ✅", "success");
            }
            setCart([]);
            queryClient.invalidateQueries({ queryKey: ['pos_inventory'] });
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['pos_invoices'] });
            queryClient.invalidateQueries({ queryKey: ['receipt_vouchers'] });
        },
        onError: (err: any) => {
            showToast(`فشلت العملية: ${err.message}`, "error");
        }
    });

    return {
        selectedWarehouseId, setSelectedWarehouseId, handleWarehouseChange, warehouses,
        isManagerOrAdmin,
        searchQuery, setSearchQuery, inventoryItems: filteredItems, filteredItems,
        selectedItemForCart, setSelectedItemForCart, confirmAddToCart, handleItemClick,
        cart, addToCart, removeFromCart, updateCartItemQty, updateCartItemPrice,
        lastInvoice, setLastInvoice, handleBarcodeScan,
        isPrintModalOpen, setIsPrintModalOpen,
        isThermalPrintModalOpen, setIsThermalPrintModalOpen,
        isShiftCloseModalOpen, setIsShiftCloseModalOpen,
        isShiftOpenModalOpen, setIsShiftOpenModalOpen,
        isOpenShiftsDrawerOpen, setIsOpenShiftsDrawerOpen,
        activeShift, loadingShift, userProfile,
        allOpenShifts, loadingAllShifts,
        switchToShift: (shift: any) => {
            if (shift.warehouse_id) handleWarehouseChange(shift.warehouse_id);
            if (shift.delegate_id) setDelegateId(shift.delegate_id);
            else setDelegateId('');
        },
        cartTotal, isTaxInclusive, setIsTaxInclusive,
        paymentMethod, setPaymentMethod,
        customers, partnerId, setPartnerId,
        delegates, delegateId, setDelegateId, 
        isDelegateLocked: isManagerOrAdmin ? false : (isDelegateLocked || !!activeShift),
        activeFleetOperation,
        onlyLowStock, setOnlyLowStock, lowStockCount,
        expiredCount, nearExpiryCount,
        handleCheckout: () => checkoutMutation.mutate(),
        isCheckingOut: checkoutMutation.isPending,
        isLoading: loadingWarehouses || loadingItems || loadingShift,
        manualDiscountAmount, setManualDiscountAmount,
        discountType, setDiscountType,
        processedCart
    };
}
