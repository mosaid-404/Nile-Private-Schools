import type { User } from '../types';

export type PushRegistrationStatus =
  | 'subscribed'
  | 'denied'
  | 'default'
  | 'unsupported'
  | 'ios_requires_install'
  | 'error';

export interface PushSupportInfo {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  isIOS: boolean;
  isStandalone: boolean;
  requiresIOSHomeScreenInstall: boolean;
}

interface VapidKeyFetchResult {
  ok: boolean;
  publicKey?: string;
  keyBytes?: Uint8Array;
  code?: string;
  message?: string;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const cleaned = base64String.trim();
  const padding = '='.repeat((4 - (cleaned.length % 4)) % 4);
  const base64 = (cleaned + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function getPushSupportInfo(): PushSupportInfo {
  if (typeof window === 'undefined') {
    return {
      supported: false,
      permission: 'unsupported',
      isIOS: false,
      isStandalone: false,
      requiresIOSHomeScreenInstall: false
    };
  }

  const ua = window.navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as unknown as { MSStream?: unknown }).MSStream;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const hasApis =
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  const requiresIOSHomeScreenInstall = isIOS && !isStandalone && !hasApis;

  return {
    supported: hasApis,
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
    isIOS,
    isStandalone,
    requiresIOSHomeScreenInstall
  };
}

let cachedSwRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export async function getActiveServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  if (!cachedSwRegistrationPromise) {
    cachedSwRegistrationPromise = navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(async (reg) => {
        void reg.update().catch(() => {});
        return navigator.serviceWorker.ready;
      })
      .catch((err) => {
        console.warn('[WebPush] Service Worker registration failed:', err);
        cachedSwRegistrationPromise = null;
        return null;
      });
  }
  return cachedSwRegistrationPromise;
}

export async function getCurrentPushEndpoint(): Promise<string | null> {
  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (!reg || !reg.pushManager) return null;
    const sub = await reg.pushManager.getSubscription();
    return sub?.endpoint || null;
  } catch {
    return null;
  }
}

export async function fetchVapidPublicKey(): Promise<VapidKeyFetchResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch('/api/push/vapid-public-key', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      console.error(
        `[WebPush] Invalid content-type from /api/push/vapid-public-key: status=${res.status}, contentType=${contentType}`
      );
      return {
        ok: false,
        code: 'API_RETURNED_NON_JSON',
        message:
          res.status === 404
            ? 'مسار الـ API الخاص بمفتاح الإشعارات (/api/push/vapid-public-key) غير موجود (404).'
            : 'الخادم أعاد صفحة HTML بدلاً من JSON عند طلب مفتاح الإشعارات — تأكد من تشغيل خادم Node/Express (server.ts).'
      };
    }

    const data = (await res.json()) as {
      ok?: boolean;
      publicKey?: string;
      code?: string;
      error?: string;
      details?: string;
    };

    if (!res.ok) {
      console.error('[WebPush] Backend returned error for VAPID key:', res.status, data);
      if (res.status === 404 || data.code === 'API_ROUTE_NOT_FOUND') {
        return {
          ok: false,
          code: data.code || 'API_ROUTE_NOT_FOUND',
          message: 'مسار الـ API (/api/push/vapid-public-key) غير موجود على الخادم (404).'
        };
      }
      if (data.code === 'VAPID_ENV_PARTIAL' || data.code === 'VAPID_ENV_INVALID') {
        return {
          ok: false,
          code: data.code,
          message: data.error || 'مفاتيح VAPID غير مهيأة بشكل صحيح في متغيرات البيئة (Environment Variables).'
        };
      }
      return {
        ok: false,
        code: data.code || `HTTP_${res.status}`,
        message: data.error
          ? `خطأ الخادم (${res.status}): ${data.error}`
          : `تعذر الحصول على مفتاح الإشعارات من الخادم (كود ${res.status}).`
      };
    }

    const publicKey = data.publicKey?.trim();
    if (!publicKey) {
      console.error('[WebPush] Empty publicKey received from server:', data);
      return {
        ok: false,
        code: 'EMPTY_VAPID_KEY',
        message: 'الخادم لم يُرجع مفتاح VAPID العام (قيمة فارغة).'
      };
    }

    try {
      const keyBytes = urlBase64ToUint8Array(publicKey);
      if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
        console.error('[WebPush] Invalid VAPID public key byte length:', keyBytes.length);
        return {
          ok: false,
          code: 'INVALID_VAPID_KEY_FORMAT',
          message: 'مفتاح VAPID العام المستلم من الخادم بصيغة غير صالحة.'
        };
      }
      return { ok: true, publicKey, keyBytes };
    } catch (decodeErr) {
      console.error('[WebPush] Failed decoding VAPID public key:', decodeErr);
      return {
        ok: false,
        code: 'INVALID_VAPID_KEY_FORMAT',
        message: 'تعذر فك تشفير مفتاح VAPID العام المستلم من الخادم.'
      };
    }
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    console.error('[WebPush] Network error fetching VAPID public key:', err);
    return {
      ok: false,
      code: isAbort ? 'VAPID_FETCH_TIMEOUT' : 'VAPID_NETWORK_ERROR',
      message: isAbort
        ? 'انتهت مهلة الاتصال بالخادم أثناء جلب مفتاح الإشعارات.'
        : 'تعذر الاتصال بالخادم لجلب مفتاح الإشعارات. تأكد من اتصالك بالإنترنت ومن تشغيل الخادم.'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function ensurePushSubscription(
  user: User,
  requestPermissionIfDefault = false
): Promise<{ status: PushRegistrationStatus; endpoint?: string; message?: string; code?: string }> {
  if (!user || user.role === 'owner') {
    return { status: 'default' };
  }

  const info = getPushSupportInfo();
  if (info.requiresIOSHomeScreenInstall || (info.isIOS && !info.isStandalone && !info.supported)) {
    return {
      status: 'ios_requires_install',
      message: 'على الآيفون: أضف التطبيق إلى الشاشة الرئيسية أولاً ثم افتحه لتفعيل الإشعارات.'
    };
  }

  if (!info.supported) {
    return {
      status: 'unsupported',
      message: 'هذا المتصفح لا يدعم إشعارات الخلفية الفورية.'
    };
  }

  let permission = Notification.permission;
  if (permission === 'default' && requestPermissionIfDefault) {
    permission = await Notification.requestPermission();
  }

  if (permission === 'denied') {
    return {
      status: 'denied',
      message: 'تم حظر الإشعارات من إعدادات المتصفح. يرجى السماح بالإشعارات من إعدادات الموقع.'
    };
  }

  if (permission !== 'granted') {
    return { status: 'default' };
  }

  try {
    const reg = await getActiveServiceWorkerRegistration();
    if (!reg || !reg.pushManager) {
      return {
        status: 'unsupported',
        message: 'ملف Service Worker غير نشط حالياً. أعد تحميل الصفحة وحاول مجدداً.'
      };
    }

    // 1. Fetch & validate VAPID public key securely BEFORE calling pushManager.subscribe
    const keyResult = await fetchVapidPublicKey();
    if (!keyResult.ok || !keyResult.keyBytes) {
      return {
        status: 'error',
        code: keyResult.code,
        message: keyResult.message || 'تعذر الحصول على مفتاح الإشعارات من الخادم.'
      };
    }

    const expectedKeyBytes = keyResult.keyBytes;
    let subscription = await reg.pushManager.getSubscription();

    // Re-subscribe if existing subscription uses an outdated/different VAPID key
    if (subscription?.options?.applicationServerKey) {
      const existingBytes = new Uint8Array(subscription.options.applicationServerKey);
      if (!uint8ArraysEqual(existingBytes, expectedKeyBytes)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
    }

    // 2. Subscribe with validated applicationServerKey
    if (!subscription) {
      try {
        subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: expectedKeyBytes.buffer as ArrayBuffer
        });
      } catch (subErr: unknown) {
        const errName = subErr instanceof Error ? subErr.name : '';
        if (errName === 'InvalidStateError') {
          // Clear stale subscription and retry once
          const stale = await reg.pushManager.getSubscription().catch(() => null);
          if (stale) await stale.unsubscribe().catch(() => {});
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: expectedKeyBytes.buffer as ArrayBuffer
          });
        } else if (errName === 'NotAllowedError') {
          return {
            status: 'denied',
            code: 'PUSH_PERMISSION_DENIED',
            message: 'تم رفض إذن إشعارات الخلفية من المتصفح أو إعدادات الهاتف.'
          };
        } else {
          console.error('[WebPush] pushManager.subscribe failed:', subErr);
          return {
            status: 'error',
            code: errName || 'PUSH_SUBSCRIBE_FAILED',
            message: 'تعذر تسجيل الجهاز في خدمة إشعارات المتصفح. تأكد من فتح التطبيق عبر HTTPS.'
          };
        }
      }
    }

    const subJson = subscription.toJSON();
    const deviceLabel = /android/i.test(navigator.userAgent)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? 'iOS'
      : 'Desktop';

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: subJson,
        userId: user.id,
        role: user.role,
        phone: user.phone,
        relatedId: user.relatedId,
        deviceLabel
      })
    });

    if (!saveRes.ok) {
      const errBody = (await saveRes.json().catch(() => ({}))) as { error?: string };
      console.error('[WebPush] Failed saving subscription:', saveRes.status, errBody);
      return {
        status: 'error',
        code: `SUBSCRIBE_HTTP_${saveRes.status}`,
        message: errBody.error || 'تعذر حفظ اشتراك إشعارات الهاتف على الخادم.'
      };
    }

    window.dispatchEvent(new Event('nps_push_status_changed'));
    return { status: 'subscribed', endpoint: subscription.endpoint };
  } catch (err) {
    console.error('[WebPush] Unexpected subscription setup error:', err);
    return {
      status: 'error',
      code: 'PUSH_SETUP_EXCEPTION',
      message:
        err instanceof Error
          ? `حدث خطأ غير متوقع أثناء تفعيل الإشعارات: ${err.message}`
          : 'حدث خطأ أثناء تفعيل إشعارات الخلفية على هذا الجهاز.'
    };
  }
}

export async function unregisterCurrentPushSubscription(userId?: string): Promise<void> {
  try {
    const endpoint = await getCurrentPushEndpoint();
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: endpoint || undefined, userId })
    });
    window.dispatchEvent(new Event('nps_push_status_changed'));
  } catch {
    // Non-fatal
  }
}

export function dispatchRemoteWebPush(payload: {
  notifId: string;
  recipientUserId?: string;
  recipientPhone?: string;
  recipientRole: string;
  notificationType: string;
  title: string;
  body: string;
  url?: string;
  studentId?: string;
}): void {
  if (typeof window === 'undefined' || payload.recipientRole === 'owner') return;
  try {
    void fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {
    // Non-fatal fallback
  }
}

export async function sendTestWebPush(user: User): Promise<{ ok: boolean; message: string }> {
  const regResult = await ensurePushSubscription(user, true);
  if (regResult.status !== 'subscribed') {
    return {
      ok: false,
      message: regResult.message || 'يرجى السماح بالإشعارات أولاً لتجربة الإرسال.'
    };
  }

  try {
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: regResult.endpoint,
        userId: user.id,
        phone: user.phone
      })
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, message: data.error || 'تعذر إرسال الإشعار التجريبي.' };
    }
    return {
      ok: true,
      message: 'تم إرسال إشعار تجريبي إلى جهازك بنجاح!'
    };
  } catch {
    return { ok: false, message: 'تعذر الاتصال بالخادم لإرسال الإشعار التجريبي.' };
  }
}
