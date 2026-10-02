import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  getAuth,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { ref, set } from 'firebase/database';
import {
  auth,
  db,
  rtdb,
  USERNAME_DOMAIN,
  getSecondaryAuthApp,
  disposeSecondaryAuthApp,
} from '../lib/firebase';
import type { UserProfile } from '../types';

export function usernameToEmail(username: string): string {
  return `${username.trim().toLowerCase()}@${USERNAME_DOMAIN}`;
}

/**
 * Firebase surfaces things like "auth/invalid-credential" and
 * "auth/too-many-requests", which are meaningless to a student holding a
 * phone in a noisy room. Translate the ones that actually happen.
 */
export function friendlyAuthError(err: unknown): Error {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return new Error('Wrong username or password.');
    case 'auth/too-many-requests':
      return new Error('Too many attempts. Wait a minute and try again.');
    case 'auth/network-request-failed':
      return new Error('No connection. Check your wifi and try again.');
    case 'auth/user-disabled':
      return new Error('This login has been turned off by your teacher.');
    case 'auth/weak-password':
      return new Error('Password must be at least 6 characters.');
    case 'auth/email-already-in-use':
      return new Error('That username is already taken.');
    default:
      return err instanceof Error ? err : new Error('Could not sign in.');
  }
}

function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}

export function subscribeProfile(
  uid: string,
  cb: (profile: UserProfile | null) => void
): () => void {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    cb(snap.exists() ? (snap.data() as UserProfile) : null);
  });
}

export interface CreateSpectatorInput {
  username: string;
  password: string;
  displayName: string;
  actorUid: string;
}

/**
 * Creates a spectator login (read-only, not tied to a team). Teams get their
 * own combined creation flow in teamService.createTeamWithLogin - a team IS
 * the login unit there, so there's no separate "participant account" step.
 *
 * Uses a disposable secondary Firebase App instance so the admin performing
 * this stays signed in - the default client SDK would otherwise swap the
 * admin's session to the newly created user.
 */
export async function createSpectator(input: CreateSpectatorInput): Promise<UserProfile> {
  const key = usernameKey(input.username);
  const existing = await getDoc(doc(db, 'usernames', key));
  if (existing.exists()) {
    throw new Error(`Username "${input.username}" is already taken.`);
  }

  const email = usernameToEmail(input.username);
  const secondaryApp = getSecondaryAuthApp();
  let uid: string;
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);
    uid = cred.user.uid;
    await firebaseSignOut(secondaryAuth);
  } finally {
    await disposeSecondaryAuthApp(secondaryApp);
  }

  const profile: UserProfile = {
    uid,
    role: 'spectator',
    username: key,
    displayName: input.displayName.trim() || input.username,
    email,
    gameId: null,
    teamId: null,
    disabled: false,
    createdAt: Date.now(),
    createdBy: input.actorUid,
  };

  await setDoc(doc(db, 'users', uid), profile);
  await setDoc(doc(db, 'usernames', key), { uid, email });
  await set(ref(rtdb, `rolesIndex/${uid}`), 'spectator');

  return profile;
}

/**
 * Removes a spectator login. As elsewhere, the client SDK cannot purge the
 * underlying Firebase Auth record - this deletes the username lookup (blocks
 * future sign-in immediately) and the profile doc itself. Nothing else
 * references a spectator's profile, so unlike a team there's no "disabled"
 * flag to maintain - it's just gone from the list.
 */
export async function disableSpectator(uid: string, username: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid));
  await deleteDoc(doc(db, 'usernames', username)).catch(() => undefined);
}

export function listenSpectators(cb: (users: UserProfile[]) => void): () => void {
  const q = query(collection(db, 'users'), where('role', '==', 'spectator'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => d.data() as UserProfile));
  });
}

/** Accepts either a team/spectator username or an admin's real email. */
export async function login(usernameOrEmail: string, password: string) {
  const trimmed = usernameOrEmail.trim();
  if (trimmed.includes('@') && !trimmed.toLowerCase().endsWith(`@${USERNAME_DOMAIN}`)) {
    return loginWithEmail(trimmed, password);
  }
  return loginWithUsername(trimmed, password);
}

export async function loginWithUsername(username: string, password: string) {
  const key = usernameKey(username);
  const lookup = await getDoc(doc(db, 'usernames', key));
  if (!lookup.exists()) {
    // Deliberately the same wording as a bad password: saying "no such
    // username" would confirm which names exist to anyone probing.
    throw new Error('Wrong username or password.');
  }
  const { email } = lookup.data() as { email: string };
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    throw friendlyAuthError(err);
  }
  const profile = await getProfile(cred.user.uid);
  if (!profile || profile.disabled) {
    await firebaseSignOut(auth);
    throw new Error('This login has been turned off by your teacher.');
  }
  return profile;
}

export async function loginWithEmail(email: string, password: string) {
  let cred;
  try {
    cred = await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    throw friendlyAuthError(err);
  }
  const profile = await getProfile(cred.user.uid);
  if (!profile || profile.disabled) {
    await firebaseSignOut(auth);
    throw new Error('This login has been turned off by your teacher.');
  }
  return profile;
}

export async function logout(): Promise<void> {
  await firebaseSignOut(auth);
}
