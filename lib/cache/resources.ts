// ============================================================================
// 📦 إدارة موارد النظام السحابي (Cloud Resources Manager)
// ربط واجهات الكاشير والمخزون بمحرك التخزين المؤقت
// ============================================================================

import { supabase } from '@/lib/supabase';
import { cached, invalidateTags, mutateCached } from './dataCache';
import { InventoryItem, Partner } from '@/types/database';

/**
 * جلب وتكييش قائمة الأصناف (أكثر طلب مستخدم في نقاط البيع)
 * @param forceRefresh إذا كانت true، ستمسح الكاش وتجلب من السحابة مجدداً
 */
export async function getInventoryItemsList(forceRefresh = false): Promise<InventoryItem[]> {
  if (forceRefresh) invalidateTags(['inventory_items']);

  return cached<InventoryItem[]>(
    'inventory_items_full_list',
    ['inventory_items'],
    async () => {
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .order('name');
        
      if (error) {
        console.error('❌ خطأ في جلب الأصناف من السحابة:', error);
        throw error;
      }
      return data;
    },
    300 * 1000 // مدة بقاء الكاش للأصناف: 5 دقائق لتقليل استهلاك النت في الكاشير
  );
}

/**
 * جلب وتكييش قائمة العملاء
 */
export async function getCustomersList(forceRefresh = false): Promise<Partner[]> {
  if (forceRefresh) invalidateTags(['customers']);

  return cached<Partner[]>(
    'customers_list',
    ['customers'],
    async () => {
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('type', 'customer')
        .order('name');
        
      if (error) throw error;
      return (data || []) as Partner[];
    },
    600 * 1000 // 10 دقائق
  );
}

/**
 * تحديث بيانات صنف معين محلياً في الكاش فوراً بعد التعديل (Optimistic Update)
 * بدون الحاجة لتحميل كل الأصناف من جديد
 */
export function updateItemInCacheLocal(itemId: string, updatedFields: Partial<InventoryItem>) {
  mutateCached<InventoryItem[]>('inventory_items_full_list', (oldList) => {
    if (!oldList) return [];
    return oldList.map(item => item.id === itemId ? { ...item, ...updatedFields } : item);
  });
}
