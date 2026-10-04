// ============================================================================
// 🧠 محرك التخزين المؤقت في الذاكرة الحية (RAM Cache Engine)
// المرحلة الأولى من خطة عمل الأوفلاين لنظام "تاج المودة" (Taj Al-Mawadah)
// ============================================================================

type CacheEntry<T> = {
  data: T;
  timestamp: number;
  tags: string[];
};

// تخزين البيانات في الذاكرة (RAM)
const ramCache = new Map<string, CacheEntry<any>>();

// سجل الطلبات قيد التنفيذ لمنع تكرار طلب نفس البيانات في نفس اللحظة (In-Flight Dedup)
const inFlightRequests = new Map<string, Promise<any>>();

// الحد الأقصى للعناصر في الرام لضمان عدم استهلاك ذاكرة جهاز الكاشير
const MAX_CACHE_ENTRIES = 50; 
// العمر الافتراضي للبيانات قبل تحديثها بالخلفية (90 ثانية)
const DEFAULT_TTL = 90 * 1000; 

/**
 * ⚡ دالة الجلب الذكية (Smart Fetcher with Stale-While-Revalidate)
 * تقوم بفحص الكاش أولاً، وتعيد البيانات فوراً للواجهة، وتحدث البيانات بالخلفية إن لزم الأمر
 */
export async function cached<T>(
  key: string,
  tags: string[],
  fetcher: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  const now = Date.now();
  const cachedItem = ramCache.get(key);

  // 1. إذا كانت البيانات موجودة وحديثة، أعدها فوراً من الرام
  if (cachedItem && now - cachedItem.timestamp < ttl) {
    return cachedItem.data as T;
  }

  // 2. (Stale-While-Revalidate) إذا كانت البيانات قديمة قليلاً:
  // أعد البيانات القديمة لضمان سرعة الواجهة، وقم بالتحديث بالخلفية بدون تعطيل المستخدم
  if (cachedItem) {
    if (!inFlightRequests.has(key)) {
      const fetchPromise = fetcher().then(data => {
        ramCache.set(key, { data, timestamp: Date.now(), tags });
        inFlightRequests.delete(key);
        pruneRamCache();
        return data;
      }).catch(err => {
        inFlightRequests.delete(key);
        console.error(`⚠️ فشل التحديث بالخلفية للمفتاح ${key}`, err);
      });
      inFlightRequests.set(key, fetchPromise);
    }
    return cachedItem.data as T;
  }

  // 3. البيانات غير موجودة إطلاقاً (أول مرة تفتح الشاشة)
  // إذا كان هناك طلب جاري بالفعل، انتظر نتيجته ولا تفتح اتصالاً جديداً
  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key) as Promise<T>;
  }

  // جلب جديد كلياً
  const fetchPromise = fetcher().then(data => {
    ramCache.set(key, { data, timestamp: Date.now(), tags });
    inFlightRequests.delete(key);
    pruneRamCache();
    return data;
  }).catch(err => {
    inFlightRequests.delete(key);
    throw err;
  });

  inFlightRequests.set(key, fetchPromise);
  return fetchPromise;
}

/**
 * 👁️ قراءة فورية للبيانات من الرام بدون تشغيل أي اتصال بالنت (مفيدة للكاشير أثناء البحث عن باركود)
 */
export function peek<T>(key: string): T | undefined {
  return ramCache.get(key)?.data as T | undefined;
}

/**
 * ✍️ التعديل الفوري محلياً (Optimistic UI) 
 * لتحديث الواجهة فوراً قبل حتى أن يصل الرد من السيرفر
 */
export function mutateCached<T>(key: string, updater: (old: T | undefined) => T) {
  const oldItem = ramCache.get(key);
  const newData = updater(oldItem?.data as T | undefined);
  ramCache.set(key, {
    data: newData,
    timestamp: Date.now(),
    tags: oldItem?.tags || []
  });
}

/**
 * 🗑️ إبطال صلاحية البيانات عند إجراء تعديل (مثلاً مسح كاش الأصناف عند إضافة صنف جديد)
 */
export function invalidateTags(tagsToInvalidate: string[]) {
  for (const [key, entry] of ramCache.entries()) {
    if (entry.tags.some(tag => tagsToInvalidate.includes(tag))) {
      ramCache.delete(key);
    }
  }
}

/**
 * 🧹 تنظيف الرام تلقائياً (Garbage Collection)
 * يحذف أقدم البيانات عندما يتجاوز الكاش الحد المسموح به
 */
export function pruneRamCache() {
  if (ramCache.size > MAX_CACHE_ENTRIES) {
    // ترتيب تنازلي حسب الأقدم
    const sortedEntries = Array.from(ramCache.entries()).sort(
      (a, b) => a[1].timestamp - b[1].timestamp
    );
    const entriesToRemove = sortedEntries.slice(0, ramCache.size - MAX_CACHE_ENTRIES);
    for (const [key] of entriesToRemove) {
      ramCache.delete(key);
    }
  }
}
