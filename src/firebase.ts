import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
  Firestore
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

let dbInstance: Firestore;
try {
  dbInstance = initializeFirestore(
    app,
    {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
      }),
      experimentalAutoDetectLongPolling: true
    },
    firebaseConfig.firestoreDatabaseId
  );
} catch {
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;

function isNetworkUnavailableError(error: unknown): boolean {
  if (!error) return false;
  const code = (error as { code?: string }).code;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    code === 'unavailable' ||
    msg.includes('the client is offline') ||
    msg.includes('failed to get document') ||
    msg.includes('network')
  );
}

async function testConnection(retried = false): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (isNetworkUnavailableError(error)) {
      if (!retried && typeof window !== 'undefined') {
        setTimeout(() => {
          void testConnection(true);
        }, 3000);
      }
      return;
    }
    console.error('Please check your Firebase configuration.', error);
  }
}

void testConnection();

