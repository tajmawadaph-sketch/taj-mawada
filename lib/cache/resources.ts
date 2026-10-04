// ============================================================================
// 📦 إدارة موارد النظام السحابي وقاعدة المتصفح (Cloud & Offline Resources Manager)
// يربط واجهات الكاشير والمخزون بمحرك التخزين المؤقت (RAM Cache + IndexedDB)
// ============================================================================

import { supabase } from '@/lib/supabase';
import { cached, invalidateTags, mutateCached } from './dataCache';
import { saveTableLocally, getTableLocally } from '../offline/syncStore';
import { InventoryItem, Partner } from '@/types/database';

/**
 * جلب وتكييش قائمة الأصناف (أكثر طلب مستخدم في نقاط البيع)
 * استراتيجية: RAM Cache -> Supabase Network -> IndexedDB Offline Fallback
 * @param forceRefresh إذا كانت true، ستمسح الكاش وتجلب من السحابة مجدداً
 */
export async function getInventoryItemsList(forceRefresh = false): Promise<InventoryItem[]> {
  if (forceRefresh) invalidateTags(['inventory_items']);

  return cached<InventoryItem[]>(
    'inventory_items_full_list',
    ['inventory_items'],
    async () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      // 1. إذا كان الكاشير أوفلاين صراحة، استخرج فوراً من قاعدة المتصفح المحلية
      if (!isOnline) {
        console.log('📴 [Resources] جلب الأصناف مباشرة من قاعدة المتصفح IndexedDB (أوفلاين)');
        const local = await getTableLocally<InventoryItem>('inventory_items');
        if (local && local.length > 0) return local;
      }

      // 2. محاولة الجلب السحابي من Supabase
      try {
        const { data, error } = await supabase
          .from('inventory_items')
          .select('*')
          .order('name');
          
        if (error) throw error;
        
        const items = (data || []) as InventoryItem[];
        // حفظ نسخة طازجة في IndexedDB لتكون جاهزة عند انقطاع النت في أي لحظة
        saveTableLocally('inventory_items', items);
        return items;

      } catch (networkOrServerErr) {
        console.warn('⚠️ [Resources] تعذر الوصول للسحابة، جاري الرجوع لأحدث نسخة محفوظة في IndexedDB:', networkOrServerErr);
        const local = await getTableLocally<InventoryItem>('inventory_items');
        if (local && local.length > 0) return local;
        return [];
      }
    },
    300 * 1000 // مدة بقاء الكاش للأصناف في الرام: 5 دقائق لسرعة صفر ثانية
  );
}

/**
 * جلب وتكييش قائمة العملاء والشركاء مع دعم الأوفلاين الكامل
 */
export async function getCustomersList(forceRefresh = false): Promise<Partner[]> {
  if (forceRefresh) invalidateTags(['customers']);

  return cached<Partner[]>(
    'customers_list',
    ['customers'],
    async () => {
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (!isOnline) {
        const local = await getTableLocally<Partner>('partners');
        if (local && local.length > 0) return local;
      }

      try {
        const { data, error } = await supabase
          .from('partners')
          .select('*')
          .or('partner_type.in.("عميل","نقدي"),type.eq.customer')
          .order('name');
          
        if (error) {
          // جلب عام إذا لم توجد أعمدة الفلترة
          const { data: allPartners, error: allErr } = await supabase
            .from('partners')
            .select('*')
            .order('name');
          if (allErr) throw allErr;
          const partners = (allPartners || []) as Partner[];
          saveTableLocally('partners', partners);
          return partners;
        }

        const partners = (data || []) as Partner[];
        saveTableLocally('partners', partners);
        return partners;

      } catch (err) {
        console.warn('⚠️ [Resources] تعذر جلب العملاء من السحابة، جاري الرجوع لـ IndexedDB:', err);
        const local = await getTableLocally<Partner>('partners');
        if (local && local.length > 0) return local;
        return [];
      }
    },
    600 * 1000 // 10 دقائق
  );
}

/**
 * تحديث بيانات صنف معين محلياً في الكاش فوراً بعد التعديل (Optimistic Update)
 */
export function updateItemInCacheLocal(itemId: string, updatedFields: Partial<InventoryItem>) {
  mutateCached<InventoryItem[]>('inventory_items_full_list', (oldList) => {
    if (!oldList) return [];
    return oldList.map(item => item.id === itemId ? { ...item, ...updatedFields } : item);
  });
}
