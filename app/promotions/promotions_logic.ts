"use client";
import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/lib/toast-context';

export function usePromotionsLogic() {
    const { showToast, showConfirm } = useToast();
    const queryClient = useQueryClient();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const [searchQuery, setSearchQuery] = useState('');

    const { data: promotions = [], isLoading } = useQuery({
        queryKey: ['promotions'],
        queryFn: async () => {
            const { data, error } = await supabase.from('promotions').select('*').order('created_at', { ascending: false });
            if (error) {
                // If the table doesn't exist yet, return an empty array to prevent crashing
                if (error.code === '42P01') {
                    showToast('جدول العروض الترويجية غير موجود في قاعدة البيانات. يرجى تشغيل السكربت المرفق.', 'error');
                }
                return [];
            }
            return data;
        }
    });

    const { data: inventoryItems = [] } = useQuery({
        queryKey: ['inventory_items_lookup'],
        queryFn: async () => {
            const { data } = await supabase.from('inventory_items').select('id, name').order('name');
            return data || [];
        }
    });

    const saveMutation = useMutation({
        mutationFn: async (payload: any) => {
            if (payload.id) {
                const { error } = await supabase.from('promotions').update(payload).eq('id', payload.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('promotions').insert([payload]);
                if (error) throw error;
            }
        },
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: ['promotions'] });
            queryClient.invalidateQueries({ queryKey: ['active_promotions'] });
            try {
                const { data } = await supabase.from('promotions').select('*').eq('status', 'active');
                if (data) {
                    const { saveTableLocally } = await import('@/lib/offline/syncStore');
                    const { invalidateTags } = await import('@/lib/cache/dataCache');
                    invalidateTags(['promotions']);
                    await saveTableLocally('promotions', data);
                }
            } catch {}
            showToast('تم حفظ العرض الترويجي وتحديث محرك الكاشير بنجاح 🎁', 'success');
            setIsFormOpen(false);
            setEditingItem(null);
        },
        onError: (err: any) => {
            showToast(`خطأ في الحفظ: ${err.message}`, 'error');
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from('promotions').delete().eq('id', id);
            if (error) throw error;
        },
        onSuccess: async () => {
            queryClient.invalidateQueries({ queryKey: ['promotions'] });
            queryClient.invalidateQueries({ queryKey: ['active_promotions'] });
            try {
                const { data } = await supabase.from('promotions').select('*').eq('status', 'active');
                if (data) {
                    const { saveTableLocally } = await import('@/lib/offline/syncStore');
                    const { invalidateTags } = await import('@/lib/cache/dataCache');
                    invalidateTags(['promotions']);
                    await saveTableLocally('promotions', data);
                }
            } catch {}
            showToast('تم حذف العرض الترويجي بنجاح', 'success');
        }
    });

    const filtered = useMemo(() => {
        if (!searchQuery) return promotions;
        return promotions.filter((p: any) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [promotions, searchQuery]);

    const handleEdit = (item: any) => {
        setEditingItem(item);
        setIsFormOpen(true);
    };

    const handleDelete = async (id: string) => {
        const confirmed = await showConfirm({
            title: 'حذف العرض الترويجي',
            message: 'هل أنت متأكد من حذف هذا العرض؟',
            confirmText: 'نعم، حذف',
            cancelText: 'إلغاء',
            type: 'danger'
        });
        if (confirmed) {
            deleteMutation.mutate(id);
        }
    };

    return {
        promotions: filtered,
        isLoading,
        searchQuery,
        setSearchQuery,
        isFormOpen,
        setIsFormOpen,
        editingItem,
        setEditingItem,
        handleEdit,
        handleDelete,
        saveMutation,
        inventoryItems
    };
}
