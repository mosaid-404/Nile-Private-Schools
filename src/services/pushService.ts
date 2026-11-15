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

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
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
      .then(async () => navigator.serviceWorker.ready)
      .catch((err) => {
        console.warn('Service Worker registration failed:', err);
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

export async function ensurePushSubscription(
  user: User,
  requestPermissionIfDefault = false
): Promise<{ status: PushRegistrationStatus; endpoint?: string; message?: string }> {
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
      return { status: 'unsupported' };
    }

    const keyRes = await fetch('/api/push/vapid-public-key');
    if (!keyRes.ok) {
      return { status: 'error', message: 'تعذر الحصول على مفتاح الإشعارات من الخادم.' };
    }
    const { publicKey } = (await keyRes.json()) as { publicKey?: string };
    if (!publicKey) {
      return { status: 'error', message: 'مفتاح الإشعارات غير متاح حالياً.' };
    }

    const expectedKeyBytes = urlBase64ToUint8Array(publicKey);
    let subscription = await reg.pushManager.getSubscription();

    if (subscription?.options?.applicationServerKey) {
      const existingBytes = new Uint8Array(subscription.options.applicationServerKey);
      if (!uint8ArraysEqual(existingBytes, expectedKeyBytes)) {
        await subscription.unsubscribe().catch(() => {});
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: expectedKeyBytes.buffer as ArrayBuffer
      });
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
      return { status: 'error', message: 'تعذر حفظ اشتراك إشعارات الهاتف على الخادم.' };
    }

    window.dispatchEvent(new Event('nps_push_status_changed'));
    return { status: 'subscribed', endpoint: subscription.endpoint };
  } catch (err) {
    console.warn('Push subscription setup error:', err);
    return {
      status: 'error',
      message: 'حدث خطأ أثناء تفعيل إشعارات الخلفية على هذا الجهاز.'
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
    const data = (await res.json()) as { ok?: boolean; error?: string };
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
