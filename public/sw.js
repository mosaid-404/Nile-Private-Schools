/**
 * Nile Private Schools (NPS) - Service Worker
 * Version: nps-v1.0.0
 */

const CACHE_NAME = 'nps-app-shell-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/icons/app-logo.png',
  '/icons/favicon-32.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png'
];

// Install: Cache Shell & static files safely
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset)));
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Bypass /api, /sw.js & Firebase, network-first for navigation, stale-while-revalidate for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never intercept non-GET, API routes, SW updates, or Firebase/Google APIs
  if (
    request.method !== 'GET' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.webmanifest' ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('firebaseio.com')
  ) {
    return;
  }

  // Handle navigation requests (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/offline.html') || caches.match('/');
      })
    );
    return;
  }

  // Handle static assets & Google fonts
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        if (
          request.url.includes('fonts.googleapis.com') ||
          request.url.includes('fonts.gstatic.com') ||
          request.url.includes('/assets/')
        ) {
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        }

        return networkResponse;
      }).catch(() => {
        if (request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/offline.html');
        }
      });
    })
  );
});

// Background Push Notification Reception (runs on mobile even when browser/app is closed)
self.addEventListener('push', (event) => {
  const showPushNotification = async () => {
    let data = {};
    if (event.data) {
      try {
        data = event.data.json();
      } catch {
        const text = event.data.text();
        data = { title: 'مدارس النيل الخاصة', body: text };
      }
    }

    const title = (typeof data.title === 'string' && data.title.trim()) || 'تنبيه جديد — مدارس النيل الخاصة';
    const body = (typeof data.body === 'string' && data.body.trim()) || 'لديك إشعار جديد من النظام المدرسي.';

    const options = {
      body,
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-192.png',
      dir: 'rtl',
      lang: 'ar',
      tag: data.tag || `nps_push_${Date.now()}`,
      renotify: true,
      vibrate: [250, 100, 250],
      data: {
        url: data.url || '/',
        studentId: data.studentId,
        date: new Date().toISOString()
      },
      actions: [
        { action: 'view', title: 'عرض التفاصيل' },
        { action: 'close', title: 'إغلاق' }
      ]
    };

    await self.registration.showNotification(title, options);
  };

  event.waitUntil(
    showPushNotification().catch(() =>
      self.registration.showNotification('تنبيه جديد — مدارس النيل الخاصة', {
        body: 'لديك إشعار جديد في التطبيق.',
        icon: '/icons/icon-192.png',
        dir: 'rtl',
        lang: 'ar'
      })
    )
  );
});

// Automatically re-subscribe if the browser rotates the push subscription in the background
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        let applicationServerKey = event.oldSubscription?.options?.applicationServerKey || null;
        if (!applicationServerKey) {
          const res = await fetch('/api/push/vapid-public-key', { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            if (json && json.publicKey) {
              const padding = '='.repeat((4 - (json.publicKey.length % 4)) % 4);
              const base64 = (json.publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
              const raw = atob(base64);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
              applicationServerKey = bytes;
            }
          }
        }
        if (applicationServerKey) {
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey
          });
        }
      } catch {
        // Will re-sync when app next opens
      }
    })()
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const rawUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) {
            client.navigate(targetUrl).catch(() => {});
          }
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// Background sync support
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-attendance') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SYNC_OFFLINE_ATTENDANCE' });
        });
      })
    );
  }
});
