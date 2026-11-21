import { doc, getDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
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

interface StoredPushSubscriptionRecord {
  id: string;
  endpoint: string;
  subscription: PushSubscriptionJSON;
  userId: string;
  role: User['role'];
  phone?: string;
  relatedId?: string;
  deviceLabel?: string;
  vapidPublicKey?: string;
  updatedAt: string;
}

const VAPID_PUBLIC_DOC_KEY = 'nps_vapid_public_key';
const VAPID_KEYS_DOC_KEY = 'nps_vapid_keys';
const SUBS_DOC_KEY = 'nps_push_subscriptions';
const PUSH_OUTBOX_DOC_KEY = 'nps_push_outbox';
const LAST_VAPID_KEY_STORAGE = 'nps_last_vapid_public_key';

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

function validateAndDecodeVapidPublicKey(publicKey?: string | null): Uint8Array | null {
  if (!publicKey || !publicKey.trim()) return null;
  try {
    const keyBytes = urlBase64ToUint8Array(publicKey);
    if (keyBytes.length !== 65 || keyBytes[0] !== 0x04) {
      return null;
    }
    return keyBytes;
  } catch {
    return null;
  }
}

async function readFirestoreStoreJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const ref = doc(db, 'nps_store', key);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (snap.exists()) {
      const val = snap.data()?.value;
      if (typeof val === 'string') {
        return JSON.parse(val) as T;
      }
    }
  } catch (err) {
    console.warn(`[WebPush] Firestore read failed for ${key}:`, err);
  }
  return fallback;
}

async function writeFirestoreStoreJson<T>(key: string, data: T): Promise<boolean> {
  try {
    await setDoc(doc(db, 'nps_store', key), {
      value: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    });
    return true;
  } catch (err) {
    console.warn(`[WebPush] Firestore write failed for ${key}:`, err);
    return false;
  }
}

async function fetchVapidPublicKeyFromFirestore(): Promise<VapidKeyFetchResult | null> {
  const pubDoc = await readFirestoreStoreJson<{ publicKey?: string } | null>(VAPID_PUBLIC_DOC_KEY, null);
  let candidate = pubDoc?.publicKey?.trim();

  if (!candidate) {
    const keysDoc = await readFirestoreStoreJson<{ publicKey?: string } | null>(VAPID_KEYS_DOC_KEY, null);
    candidate = keysDoc?.publicKey?.trim();
  }

  if (!candidate) return null;
  const keyBytes = validateAndDecodeVapidPublicKey(candidate);
  if (!keyBytes) {
    return {
      ok: false,
      code: 'FIRESTORE_VAPID_KEY_INVALID',
      message: 'مفتاح VAPID العام المحفوظ في قاعدة البيانات غير صالح.'
    };
  }
  return { ok: true, publicKey: candidate, keyBytes };
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
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  let apiError: VapidKeyFetchResult | null = null;

  try {
    const res = await fetch('/api/push/vapid-public-key', {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      console.warn(
        `[WebPush] /api/push/vapid-public-key returned non-JSON (${res.status}, ${contentType}); trying Firestore fallback.`
      );
      apiError = {
        ok: false,
        code: res.status === 404 ? 'API_ROUTE_NOT_FOUND' : 'API_RETURNED_NON_JSON',
        message:
          res.status === 404
            ? 'مسار الـ API (/api/push/vapid-public-key) غير موجود على الخادم (404).'
            : 'الخادم أعاد صفحة HTML بدلاً من JSON عند طلب مفتاح الإشعارات.'
      };
    } else {
      const data = (await res.json()) as {
        ok?: boolean;
        publicKey?: string;
        code?: string;
        error?: string;
      };

      if (!res.ok) {
        if (data.code === 'VAPID_ENV_PARTIAL' || data.code === 'VAPID_ENV_INVALID') {
          return {
            ok: false,
            code: data.code,
            message:
              data.error ||
              'مفاتيح VAPID غير مهيأة بشكل صحيح في متغيرات البيئة (Environment Variables).'
          };
        }
        apiError = {
          ok: false,
          code: data.code || `HTTP_${res.status}`,
          message: data.error
            ? `خطأ الخادم (${res.status}): ${data.error}`
            : `تعذر الحصول على مفتاح الإشعارات من الخادم (كود ${res.status}).`
        };
      } else {
        const publicKey = data.publicKey?.trim();
        const keyBytes = validateAndDecodeVapidPublicKey(publicKey);
        if (publicKey && keyBytes) {
          return { ok: true, publicKey, keyBytes };
        }
        apiError = {
          ok: false,
          code: 'INVALID_VAPID_KEY_FORMAT',
          message: 'صيغة مفتاح VAPID العام المستلم من الخادم غير صالحة.'
        };
      }
    }
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    console.warn('[WebPush] Error calling /api/push/vapid-public-key, trying Firestore fallback:', err);
    apiError = {
      ok: false,
      code: isAbort ? 'VAPID_FETCH_TIMEOUT' : 'VAPID_NETWORK_ERROR',
      message: isAbort
        ? 'انتهت مهلة الاتصال بالخادم أثناء جلب مفتاح الإشعارات.'
        : 'تعذر الاتصال بخادم الإشعارات.'
    };
  } finally {
    window.clearTimeout(timeoutId);
  }

  // Fallback: Read VAPID public key from Firestore when /api/* is unavailable (e.g. static Shared App URL)
  const fsResult = await fetchVapidPublicKeyFromFirestore();
  if (fsResult?.ok && fsResult.keyBytes) {
    return fsResult;
  }

  if (fsResult && !fsResult.ok) {
    return fsResult;
  }

  return (
    apiError || {
      ok: false,
      code: 'VAPID_KEY_UNAVAILABLE',
      message:
        'تعذر الحصول على مفتاح الإشعارات من الخادم أو قاعدة البيانات. تأكد من تشغيل الخادم الخلفي (server.ts).'
    }
  );
}

async function saveSubscriptionToFirestore(entry: StoredPushSubscriptionRecord): Promise<boolean> {
  const list = await readFirestoreStoreJson<StoredPushSubscriptionRecord[]>(SUBS_DOC_KEY, []);
  const filtered = Array.isArray(list) ? list.filter((s) => s.endpoint !== entry.endpoint) : [];
  filtered.push(entry);
  return writeFirestoreStoreJson(SUBS_DOC_KEY, filtered);
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

    // 1. Fetch & validate VAPID public key (API primary + Firestore fallback) BEFORE subscribing
    const keyResult = await fetchVapidPublicKey();
    if (!keyResult.ok || !keyResult.keyBytes) {
      return {
        status: 'error',
        code: keyResult.code,
        message: keyResult.message || 'تعذر الحصول على مفتاح الإشعارات من الخادم.'
      };
    }

    const expectedKeyBytes = keyResult.keyBytes;
    const expectedPubKey = keyResult.publicKey || '';
    const prevSavedVapidKey = localStorage.getItem(LAST_VAPID_KEY_STORAGE);
    let subscription = await reg.pushManager.getSubscription();

    if (subscription) {
      let keyMismatch = Boolean(prevSavedVapidKey && expectedPubKey && prevSavedVapidKey !== expectedPubKey);
      if (subscription.options?.applicationServerKey) {
        const existingBytes = new Uint8Array(subscription.options.applicationServerKey);
        if (!uint8ArraysEqual(existingBytes, expectedKeyBytes)) {
          keyMismatch = true;
        }
      }
      if (keyMismatch) {
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

    const record: StoredPushSubscriptionRecord = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      endpoint: subscription.endpoint,
      subscription: subJson,
      userId: user.id,
      role: user.role,
      phone: user.phone,
      relatedId: user.relatedId,
      deviceLabel,
      vapidPublicKey: expectedPubKey || undefined,
      updatedAt: new Date().toISOString()
    };

    let saved = false;
    try {
      const saveRes = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: subJson,
          userId: user.id,
          role: user.role,
          phone: user.phone,
          relatedId: user.relatedId,
          deviceLabel,
          vapidPublicKey: expectedPubKey || undefined
        })
      });
      const ct = (saveRes.headers.get('content-type') || '').toLowerCase();
      if (saveRes.ok && ct.includes('application/json')) {
        saved = true;
      }
    } catch {
      // Fallback below
    }

    if (!saved) {
      saved = await saveSubscriptionToFirestore(record);
    }

    if (!saved) {
      return {
        status: 'error',
        code: 'SUBSCRIBE_PERSIST_FAILED',
        message: 'تعذر حفظ اشتراك إشعارات الهاتف على الخادم أو قاعدة البيانات.'
      };
    }

    if (expectedPubKey) {
      localStorage.setItem(LAST_VAPID_KEY_STORAGE, expectedPubKey);
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
    let removedViaApi = false;
    try {
      const res = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: endpoint || undefined, userId })
      });
      if (res.ok) removedViaApi = true;
    } catch {
      // Fallback below
    }

    if (!removedViaApi && (endpoint || userId)) {
      const list = await readFirestoreStoreJson<StoredPushSubscriptionRecord[]>(SUBS_DOC_KEY, []);
      if (Array.isArray(list)) {
        const next = list.filter((s) => {
          if (endpoint && s.endpoint === endpoint) return false;
          if (!endpoint && userId && s.userId === userId) return false;
          return true;
        });
        await writeFirestoreStoreJson(SUBS_DOC_KEY, next);
      }
    }
    window.dispatchEvent(new Event('nps_push_status_changed'));
  } catch {
    // Non-fatal
  }
}

async function enqueueOutboxPushJob(type: 'send' | 'test', payload: Record<string, unknown>): Promise<boolean> {
  const jobs = await readFirestoreStoreJson<Array<Record<string, unknown>>>(PUSH_OUTBOX_DOC_KEY, []);
  const next = Array.isArray(jobs) ? jobs.slice(-19) : [];
  next.push({
    id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    processed: false
  });
  return writeFirestoreStoreJson(PUSH_OUTBOX_DOC_KEY, next);
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
  void (async () => {
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload)
      });
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && ct.includes('application/json')) {
        return;
      }
    } catch {
      // Fall through to Firestore outbox
    }
    await enqueueOutboxPushJob('send', payload);
  })();
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
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        return {
          ok: true,
          message: 'تم إرسال إشعار تجريبي إلى جهازك بنجاح!'
        };
      }
      if (res.status !== 404) {
        return { ok: false, message: data.error || 'تعذر إرسال الإشعار التجريبي.' };
      }
    }
  } catch {
    // Fallback to Firestore outbox below
  }

  const queued = await enqueueOutboxPushJob('test', {
    endpoint: regResult.endpoint,
    userId: user.id,
    phone: user.phone
  });
  if (queued) {
    return {
      ok: true,
      message: 'تم تفعيل الإشعارات وإرسال طلب الإشعار التجريبي بنجاح!'
    };
  }
  return { ok: false, message: 'تعذر الاتصال بالخادم لإرسال الإشعار التجريبي.' };
}
