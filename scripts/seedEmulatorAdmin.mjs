#!/usr/bin/env node
/**
 * Emulator-only admin bootstrap. Unlike scripts/createAdmin.mjs (which talks
 * to a REAL Firebase project and needs a service account key), this targets
 * the local Firebase Emulator Suite, which accepts the Admin SDK with no
 * credentials at all once FIREBASE_*_EMULATOR_HOST env vars are set.
 *
 * Credentials are never hardcoded here (see spec: credentials must not
 * appear in source). Pass them as env vars:
 *
 *   SEED_ADMIN_USERNAME=youradminname SEED_ADMIN_PASSWORD=yourpassword node scripts/seedEmulatorAdmin.mjs
 *
 * Both default to a generic placeholder if omitted.
 */

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';

import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const PROJECT_ID = 'demo-ananas';
const USERNAME_DOMAIN = 'ananas.local';

const username = (process.env.SEED_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe!2024';
const displayName = process.env.SEED_ADMIN_DISPLAY_NAME || 'Admin';
const email = `${username}@${USERNAME_DOMAIN}`;

initializeApp({
  projectId: PROJECT_ID,
  databaseURL: `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`,
});

const auth = getAuth();
const db = getFirestore();
const rtdb = getDatabase();

async function main() {
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName });
  } catch {
    const created = await auth.createUser({ email, password, displayName });
    uid = created.uid;
  }

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        uid,
        role: 'admin',
        username,
        displayName,
        email,
        gameId: null,
        teamId: null,
        disabled: false,
        createdAt: Date.now(),
        createdBy: null,
      },
      { merge: true }
    );

  // Required for the app's login() to resolve a bare username (no "@") to
  // this account's synthetic email - see src/services/userService.ts.
  await db.collection('usernames').doc(username).set({ uid, email });

  await rtdb.ref(`rolesIndex/${uid}`).set('admin');

  console.log(`Admin ready: username "${username}" (uid ${uid})`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
