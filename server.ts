import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import type { PushSubscription as WebPushSubscription } from 'web-push';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof import('web-push');
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

interface StoredPushSubscription {
  id: string;
  endpoint: string;
  subscription: WebPushSubscription;
  userId: string;
  role: 'owner' | 'teacher' | 'parent' | 'secretary';
  phone?: string;
  relatedId?: string;
  deviceLabel?: string;
  updatedAt: string;
}

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

interface ParentRecord {
  id: string;
  phone?: string;
  userId?: string;
  attendanceNotificationPref?: 'both' | 'presence_only' | 'absence_only';
}

const VAPID_DOC_KEY = 'nps_vapid_keys';
const SUBS_DOC_KEY = 'nps_push_subscriptions';
const PARENTS_DOC_KEY = 'nps_parents';

function normalizePhone(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('20') && digits.length >= 12) {
    return '0' + digits.slice(2);
  }
  return digits;
}

function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
  const raw = fs.readFileSync(cfgPath, 'utf8');
  return JSON.parse(raw) as FirebaseAppletConfig;
}

const firebaseConfig = loadFirebaseConfig();
const fbApp = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
let db: ReturnType<typeof getFirestore>;
try {
  db = initializeFirestore(
    fbApp,
    { experimentalAutoDetectLongPolling: true },
    databaseId
  );
} catch {
  db = getFirestore(fbApp, databaseId);
}

let cachedVapidKeys: VapidKeys | null = null;
let cachedVapidSource: 'env' | 'firestore' | 'generated' | null = null;
let vapidInitPromise: Promise<VapidKeys> | null = null;
let cachedSubscriptions: StoredPushSubscription[] = [];
let subscriptionsLoaded = false;

class VapidConfigError extends Error {
  code: string;
  details?: string;
  constructor(code: string, message: string, details?: string) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function isValidVapidPublicKeyFormat(publicKey: string): boolean {
  try {
    const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(base64, 'base64');
    return decoded.length === 65 && decoded[0] === 0x04;
  } catch {
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    )
  ]);
}

async function readStoreValue<T>(key: string, fallback: T): Promise<T> {
  try {
    const snap = await withTimeout(getDoc(doc(db, 'nps_store', key)), 3500, `read:${key}`);
    if (snap.exists()) {
      const val = snap.data()?.value;
      if (typeof val === 'string') {
        return JSON.parse(val) as T;
      }
    }
  } catch (err) {
    console.warn(`Failed reading nps_store/${key} from Firestore:`, err);
  }
  return fallback;
}

async function writeStoreValue<T>(key: string, data: T): Promise<void> {
  try {
    await withTimeout(
      setDoc(doc(db, 'nps_store', key), {
        value: JSON.stringify(data),
        updatedAt: new Date().toISOString()
      }),
      3500,
      `write:${key}`
    );
  } catch (err) {
    console.warn(`Failed writing nps_store/${key} to Firestore:`, err);
  }
}

async function ensureVapidKeys(): Promise<VapidKeys> {
  if (cachedVapidKeys) return cachedVapidKeys;
  if (vapidInitPromise) return vapidInitPromise;

  vapidInitPromise = (async () => {
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@nps-school.app';
    const envPub = process.env.VAPID_PUBLIC_KEY?.trim() || '';
    const envPriv = process.env.VAPID_PRIVATE_KEY?.trim() || '';

    if ((envPub && !envPriv) || (!envPub && envPriv)) {
      throw new VapidConfigError(
        'VAPID_ENV_PARTIAL',
        'متغيرات البيئة الخاصة بـ VAPID غير مكتملة: يجب ضبط VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY معاً.',
        `hasPublicKey=${Boolean(envPub)}, hasPrivateKey=${Boolean(envPriv)}`
      );
    }

    if (envPub && envPriv) {
      if (!isValidVapidPublicKeyFormat(envPub)) {
        throw new VapidConfigError(
          'VAPID_ENV_INVALID',
          'صيغة مفتاح VAPID_PUBLIC_KEY في متغيرات البيئة غير صالحة (يجب أن يكون Base64URL بطول 65 بايت).',
          'Invalid P-256 uncompressed public key'
        );
      }
      try {
        webpush.setVapidDetails(subject, envPub, envPriv);
      } catch (err) {
        throw new VapidConfigError(
          'VAPID_ENV_INVALID',
          'فشل التحقق من صحة مفاتيح VAPID في متغيرات البيئة.',
          err instanceof Error ? err.message : String(err)
        );
      }
      cachedVapidKeys = { publicKey: envPub, privateKey: envPriv };
      cachedVapidSource = 'env';
      return cachedVapidKeys;
    }

    const fromDb = await readStoreValue<VapidKeys | null>(VAPID_DOC_KEY, null);
    if (fromDb?.publicKey && fromDb?.privateKey && isValidVapidPublicKeyFormat(fromDb.publicKey)) {
      try {
        webpush.setVapidDetails(subject, fromDb.publicKey, fromDb.privateKey);
        cachedVapidKeys = fromDb;
        cachedVapidSource = 'firestore';
        return cachedVapidKeys;
      } catch (err) {
        console.warn('Stored VAPID keys in Firestore failed validation, regenerating:', err);
      }
    }

    const generated = webpush.generateVAPIDKeys();
    webpush.setVapidDetails(subject, generated.publicKey, generated.privateKey);
    cachedVapidKeys = {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey
    };
    cachedVapidSource = 'generated';
    void writeStoreValue(VAPID_DOC_KEY, cachedVapidKeys);
    return cachedVapidKeys;
  })();

  try {
    return await vapidInitPromise;
  } finally {
    vapidInitPromise = null;
  }
}

async function loadSubscriptions(forceRefresh = false): Promise<StoredPushSubscription[]> {
  if (subscriptionsLoaded && !forceRefresh) {
    return cachedSubscriptions;
  }
  const fromDb = await readStoreValue<StoredPushSubscription[]>(SUBS_DOC_KEY, []);
  if (Array.isArray(fromDb)) {
    // Merge any in-memory subscriptions not yet reflected
    const byEndpoint = new Map<string, StoredPushSubscription>();
    for (const s of fromDb) {
      if (s?.endpoint) byEndpoint.set(s.endpoint, s);
    }
    for (const s of cachedSubscriptions) {
      if (s?.endpoint) {
        const existing = byEndpoint.get(s.endpoint);
        if (!existing || s.updatedAt > existing.updatedAt) {
          byEndpoint.set(s.endpoint, s);
        }
      }
    }
    cachedSubscriptions = Array.from(byEndpoint.values());
  }
  subscriptionsLoaded = true;
  return cachedSubscriptions;
}

async function saveSubscriptions(list: StoredPushSubscription[]): Promise<void> {
  cachedSubscriptions = list;
  subscriptionsLoaded = true;
  await writeStoreValue(SUBS_DOC_KEY, list);
}

function shouldDeliverToParent(
  pref: ParentRecord['attendanceNotificationPref'],
  notifType?: string
): boolean {
  const effective = pref || 'both';
  if (notifType === 'presence') {
    return effective === 'both' || effective === 'presence_only';
  }
  if (notifType === 'absence' || notifType === 'departure') {
    return effective === 'both' || effective === 'absence_only';
  }
  return true;
}

async function startServer() {
  // Warm up VAPID keys and push subscriptions in background so server binds port 3000 immediately
  void ensureVapidKeys().catch((err) => console.warn('VAPID warmup warning:', err));
  void loadSubscriptions(true).catch((err) => console.warn('Subscriptions warmup warning:', err));

  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Ensure Service Worker and Manifest are never aggressively cached on mobile
  app.use((req, res, next) => {
    if (req.path === '/sw.js' || req.path === '/manifest.webmanifest') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Service-Worker-Allowed', '/');
    }
    next();
  });

  // Prevent caching on API responses
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      pushReady: Boolean(cachedVapidKeys),
      vapidSource: cachedVapidSource
    });
  });

  app.get('/api/push/vapid-public-key', async (_req, res) => {
    try {
      const keys = await ensureVapidKeys();
      if (!keys?.publicKey || !isValidVapidPublicKeyFormat(keys.publicKey)) {
        res.status(500).json({
          ok: false,
          code: 'VAPID_KEY_INVALID',
          error: 'مفتاح VAPID العام المولّد في الخادم غير صالح.'
        });
        return;
      }
      res.json({
        ok: true,
        publicKey: keys.publicKey,
        source: cachedVapidSource || 'unknown'
      });
    } catch (err) {
      if (err instanceof VapidConfigError) {
        console.error(`[WebPush] ${err.code}: ${err.message}`, err.details || '');
        res.status(500).json({
          ok: false,
          code: err.code,
          error: err.message,
          details: err.details
        });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error('[WebPush] VAPID_INIT_FAILED:', message);
      res.status(500).json({
        ok: false,
        code: 'VAPID_INIT_FAILED',
        error: 'فشل الخادم في تهيئة مفتاح الإشعارات العام (VAPID).',
        details: message
      });
    }
  });

  app.post('/api/push/subscribe', async (req, res) => {
    try {
      const { subscription, userId, role, phone, relatedId, deviceLabel } = req.body as {
        subscription?: WebPushSubscription;
        userId?: string;
        role?: StoredPushSubscription['role'];
        phone?: string;
        relatedId?: string;
        deviceLabel?: string;
      };

      if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        res.status(400).json({ error: 'Invalid push subscription payload' });
        return;
      }

      if (!userId || !role) {
        res.status(400).json({ error: 'Missing user identity fields' });
        return;
      }

      // Admin does not receive notifications
      if (role === 'owner') {
        res.json({ ok: true, skipped: true });
        return;
      }

      const list = await loadSubscriptions();
      const now = new Date().toISOString();
      const entry: StoredPushSubscription = {
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        endpoint: subscription.endpoint,
        subscription,
        userId,
        role,
        phone: phone || undefined,
        relatedId: relatedId || undefined,
        deviceLabel: deviceLabel || undefined,
        updatedAt: now
      };

      const filtered = list.filter((item) => item.endpoint !== subscription.endpoint);
      filtered.push(entry);
      await saveSubscriptions(filtered);

      res.json({ ok: true, total: filtered.length });
    } catch (err) {
      console.error('Subscribe error:', err);
      res.status(500).json({ error: 'Failed to save subscription' });
    }
  });

  app.post('/api/push/unsubscribe', async (req, res) => {
    try {
      const { endpoint, userId } = req.body as { endpoint?: string; userId?: string };
      const list = await loadSubscriptions();
      const next = list.filter((item) => {
        if (endpoint && item.endpoint === endpoint) return false;
        if (!endpoint && userId && item.userId === userId) return false;
        return true;
      });
      await saveSubscriptions(next);
      res.json({ ok: true, remaining: next.length });
    } catch (err) {
      console.error('Unsubscribe error:', err);
      res.status(500).json({ error: 'Failed to remove subscription' });
    }
  });

  app.post('/api/push/send', async (req, res) => {
    try {
      await ensureVapidKeys();
      const {
        notifId,
        recipientUserId,
        recipientPhone,
        recipientRole,
        notificationType,
        title,
        body,
        url,
        studentId
      } = req.body as {
        notifId?: string;
        recipientUserId?: string;
        recipientPhone?: string;
        recipientRole?: StoredPushSubscription['role'];
        notificationType?: string;
        title?: string;
        body?: string;
        url?: string;
        studentId?: string;
      };

      if (!title || !body) {
        res.status(400).json({ error: 'Missing notification title or body' });
        return;
      }

      if (recipientRole === 'owner') {
        res.json({ ok: true, sent: 0, skipped: 'owner' });
        return;
      }

      const list = await loadSubscriptions(true);
      const targetNormPhone = normalizePhone(recipientPhone);

      let matches = list.filter((sub) => {
        if (sub.role === 'owner') return false;
        if (recipientUserId && sub.userId === recipientUserId) return true;
        if (targetNormPhone && normalizePhone(sub.phone) === targetNormPhone) {
          if (!recipientRole || sub.role === recipientRole) return true;
        }
        if (!recipientUserId && !targetNormPhone && recipientRole && sub.role === recipientRole) {
          return true;
        }
        return false;
      });

      // Enforce parent notification preferences (حضور فقط / انصراف فقط / الاثنين معاً)
      if (
        matches.length > 0 &&
        (notificationType === 'presence' ||
          notificationType === 'absence' ||
          notificationType === 'departure')
      ) {
        const parents = await readStoreValue<ParentRecord[]>(PARENTS_DOC_KEY, []);
        if (Array.isArray(parents) && parents.length > 0) {
          matches = matches.filter((sub) => {
            if (sub.role !== 'parent') return true;
            const subPhone = normalizePhone(sub.phone);
            const parent = parents.find(
              (p) =>
                (sub.relatedId && p.id === sub.relatedId) ||
                p.userId === sub.userId ||
                (subPhone && normalizePhone(p.phone) === subPhone)
            );
            return shouldDeliverToParent(parent?.attendanceNotificationPref, notificationType);
          });
        }
      }

      if (matches.length === 0) {
        res.json({ ok: true, sent: 0, failed: 0, cleaned: 0 });
        return;
      }

      const payload = JSON.stringify({
        title,
        body,
        url: url || '/',
        studentId,
        type: notificationType,
        tag: notifId ? `nps_${notifId}` : `nps_${Date.now()}`
      });

      const expiredEndpoints = new Set<string>();
      let sent = 0;
      let failed = 0;

      await Promise.all(
        matches.map(async (sub) => {
          try {
            await webpush.sendNotification(sub.subscription, payload, {
              TTL: 86400,
              urgency: 'high'
            });
            sent += 1;
          } catch (err: unknown) {
            failed += 1;
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? (err as { statusCode?: number }).statusCode
                : undefined;
            if (statusCode === 404 || statusCode === 410) {
              expiredEndpoints.add(sub.endpoint);
            } else {
              console.warn('WebPush send failure:', statusCode, err);
            }
          }
        })
      );

      if (expiredEndpoints.size > 0) {
        const cleanedList = list.filter((s) => !expiredEndpoints.has(s.endpoint));
        await saveSubscriptions(cleanedList);
      }

      res.json({ ok: true, sent, failed, cleaned: expiredEndpoints.size });
    } catch (err) {
      console.error('Push send endpoint error:', err);
      res.status(500).json({ error: 'Failed to dispatch web push' });
    }
  });

  app.post('/api/push/test', async (req, res) => {
    try {
      await ensureVapidKeys();
      const { endpoint, userId, phone } = req.body as {
        endpoint?: string;
        userId?: string;
        phone?: string;
      };

      const list = await loadSubscriptions(true);
      const normPhone = normalizePhone(phone);
      const targets = list.filter((sub) => {
        if (endpoint && sub.endpoint === endpoint) return true;
        if (userId && sub.userId === userId) return true;
        if (normPhone && normalizePhone(sub.phone) === normPhone) return true;
        return false;
      });

      if (targets.length === 0) {
        res.status(404).json({
          ok: false,
          error: 'لم يتم العثور على اشتراك إشعارات مسجل لهذا الجهاز بعد'
        });
        return;
      }

      const payload = JSON.stringify({
        title: 'مدارس النيل الخاصة — اختبار الإشعارات',
        body: 'تم تفعيل إشعارات الهاتف بنجاح! ستصلك الإشعارات الفورية حتى خارج المتصفح.',
        url: '/',
        tag: `nps_test_${Date.now()}`
      });

      let sent = 0;
      const expired = new Set<string>();
      await Promise.all(
        targets.map(async (sub) => {
          try {
            await webpush.sendNotification(sub.subscription, payload, {
              TTL: 3600,
              urgency: 'high'
            });
            sent += 1;
          } catch (err: unknown) {
            const statusCode =
              typeof err === 'object' && err !== null && 'statusCode' in err
                ? (err as { statusCode?: number }).statusCode
                : undefined;
            if (statusCode === 404 || statusCode === 410) {
              expired.add(sub.endpoint);
            }
          }
        })
      );

      if (expired.size > 0) {
        await saveSubscriptions(list.filter((s) => !expired.has(s.endpoint)));
      }

      res.json({ ok: sent > 0, sent });
    } catch (err) {
      console.error('Test push error:', err);
      res.status(500).json({ ok: false, error: 'Failed to send test push' });
    }
  });

  // Explicit JSON 404 for unknown /api/* routes so they never fall through to SPA HTML
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      ok: false,
      code: 'API_ROUTE_NOT_FOUND',
      error: `مسار API غير موجود: ${req.method} ${req.originalUrl}`
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        }
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NPS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
