const CACHE_NAME = 'taj-pwa-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 1. لا تعترض أي طلبات غير GET (مثل POST أو PUT أو DELETE)
  if (request.method !== 'GET') {
    return;
  }

  // 2. تجاهل بروتوكولات إضافات المتصفح وغيرها
  if (!request.url.startsWith('http')) {
    return;
  }

  const url = new URL(request.url);

  // 3. تجاوز مسارات الـ API وطلبات Supabase والـ WebSockets لتفادي أي مشاكل شبكة
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase.co')) {
    return;
  }

  // 3.5 الملفات الثابتة المجزّأة (hash) لا تتغير: Cache First لفتح التطبيق فوراً وبدون إنترنت
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/_next/image')) {
    event.respondWith(
      caches.match(request).then((hit) => {
        if (hit) return hit;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone).catch(() => {}));
          }
          return response;
        });
      })
    );
    return;
  }

  // 4. استراتيجية Network First مع Catch آمن لمنع أخطاء Uncaught TypeError
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseClone).catch(() => {});
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }

        // إذا كانت الصفحة المطلوبة (مثل /pos) غير موجودة في الكاش،
        // حاول إرجاع الصفحة الرئيسية (/) أو صفحة الكاشير لضمان عدم توقف العمل.
        if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
          const rootCached = await caches.match('/');
          if (rootCached) return rootCached;

          return new Response(
            '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>غير متصل</title></head><body style="font-family:sans-serif;text-align:center;padding:50px;direction:rtl;"><h2>أنت حالياً غير متصل بالإنترنت ⚠️</h2><p>يرجى التحقق من اتصال الشبكة وإعادة المحاولة لفتح الكاشير.</p></body></html>',
            {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            }
          );
        }

        return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
      })
  );
});

// 🔔 معالجة إشعارات الدفع (Web Push Notifications)
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'صيدلية تاج المودة', body: event.data ? event.data.text() : 'إشعار جديد' };
  }

  const title = data.title || 'إشعار جديد | صيدلية تاج المودة';
  const options = {
    body: data.body || data.message || '',
    icon: '/taj_logo.png',
    badge: '/taj_logo.png',
    vibrate: [200, 100, 200],
    data: {
      url: data.url || data.actionUrl || '/notifications',
      id: data.id,
      timestamp: Date.now()
    },
    tag: data.tag || 'taj_mawadah-notification',
    renotify: true
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 📱 معالجة النقر على الإشعار في الجوال أو المتصفح
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // إذا كان التطبيق مفتوحاً بالفعل، ركز عليه وانتقل للرابط
      for (const client of windowClients) {
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && client.url !== urlToOpen) {
            return client.navigate(urlToOpen);
          }
          return;
        }
      }
      // إذا لم يكن مفتوحاً، افتح نافذة جديدة
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

