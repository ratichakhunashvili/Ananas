import { initializeApp, getApps, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import { getStorage, connectStorageEmulator } from 'firebase/storage';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
};

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.databaseURL
);

if (!isFirebaseConfigured) {
  // eslint-disable-next-line no-console
  console.error(
    'Firebase config is missing. Copy .env.example to .env.local and fill in your Firebase project values.'
  );
}

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
// A malformed/missing databaseURL throws synchronously inside getDatabase().
// When config isn't set up yet we still want the app to boot far enough to
// show the setup screen (see src/pages/SetupNeededPage.tsx) instead of a
// blank crashed page, so fall back to a syntactically valid placeholder URL.
export const rtdb = getDatabase(app, isFirebaseConfigured ? undefined : 'https://unconfigured.firebaseio.com');
export const storage = getStorage(app);

export const USERNAME_DOMAIN =
  (import.meta.env.VITE_AUTH_USERNAME_DOMAIN as string | undefined) || 'ananas.local';

/**
 * Admin account creation (participants/spectators) must not sign the admin
 * out of their own session. Firebase's client SDK signs in as whichever user
 * createUserWithEmailAndPassword() just created, so we spin up a disposable
 * secondary App instance purely to mint the new Auth user, then tear it down.
 * The admin's primary `auth` session is never touched.
 */
export function getSecondaryAuthApp(): FirebaseApp {
  const name = `secondary-${Date.now()}`;
  return initializeApp(firebaseConfig, name);
}

export async function disposeSecondaryAuthApp(app: FirebaseApp): Promise<void> {
  await deleteApp(app);
}

// Optional local emulator support for development/testing without touching
// a real Firebase project. Enable with VITE_USE_FIREBASE_EMULATORS=true.
if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  const alreadyConnected = getApps().length > 1;
  if (!alreadyConnected) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
    connectStorageEmulator(storage, '127.0.0.1', 9199);
  }
}
