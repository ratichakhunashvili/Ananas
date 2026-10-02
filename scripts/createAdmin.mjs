#!/usr/bin/env node
/**
 * One-time (or as-needed) Admin account bootstrap.
 *
 * This deliberately runs OUTSIDE the deployed web app, using the Firebase
 * Admin SDK, so the very first Admin account never needs a client-side
 * "sign up as admin" form (which would be a standing attack surface) and so
 * credentials never pass through or get bundled into frontend source.
 *
 * Usage (from the project root):
 *
 *   1. Download a service account key for your Firebase project:
 *      Firebase Console -> Project settings -> Service accounts
 *      -> Generate new private key. Save it outside git, e.g. as
 *      ./serviceAccountKey.json (already in .gitignore).
 *
 *   2. Create a .env.admin file (NOT committed) with:
 *      ADMIN_EMAIL=you@yourschool.com
 *      ADMIN_PASSWORD=choose-a-strong-password
 *      ADMIN_DISPLAY_NAME=Head Admin
 *      FIREBASE_DATABASE_URL=https://<project-id>-default-rtdb.<region>.firebasedatabase.app
 *      GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json
 *
 *   3. Run:
 *      node --env-file=.env.admin scripts/createAdmin.mjs
 *
 * Re-running this script for the same email just resets that user's
 * password and re-confirms their admin role - safe to run again.
 */

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
const displayName = process.env.ADMIN_DISPLAY_NAME || 'Admin';
const databaseURL = process.env.FIREBASE_DATABASE_URL;
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!email || !password) {
  console.error('Missing ADMIN_EMAIL or ADMIN_PASSWORD. See scripts/createAdmin.mjs for setup instructions.');
  process.exit(1);
}
if (!databaseURL) {
  console.error('Missing FIREBASE_DATABASE_URL (Realtime Database URL).');
  process.exit(1);
}
if (!credentialsPath) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS (path to your service account JSON).');
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(credentialsPath, 'utf8'));

initializeApp({
  credential: cert(serviceAccount),
  databaseURL,
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
    console.log(`Updated existing Firebase Auth user ${email} (${uid}).`);
  } catch {
    const created = await auth.createUser({ email, password, displayName });
    uid = created.uid;
    console.log(`Created Firebase Auth user ${email} (${uid}).`);
  }

  await db
    .collection('users')
    .doc(uid)
    .set(
      {
        uid,
        role: 'admin',
        username: email.split('@')[0].toLowerCase(),
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

  await rtdb.ref(`rolesIndex/${uid}`).set('admin');

  console.log(`\n${email} is now an Ananas Admin. Sign in at /login with this email and password.`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
