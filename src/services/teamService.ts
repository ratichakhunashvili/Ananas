import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { ref, remove, set } from 'firebase/database';
import { signOut as firebaseSignOut, createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import {
  db,
  functions,
  rtdb,
  USERNAME_DOMAIN,
  getSecondaryAuthApp,
  disposeSecondaryAuthApp,
} from '../lib/firebase';
import type { Team, UserProfile } from '../types';
import { logAudit } from './auditService';
import { friendlyAuthError } from './userService';

function usernameKey(username: string): string {
  return username.trim().toLowerCase();
}

export interface CreateTeamInput {
  gameId: string;
  name: string;
  username: string;
  password: string;
  actorUid: string;
  actorName: string;
}

/**
 * Creates a team AND its login in one step - a team is the login unit here,
 * not a container of individual participant accounts. Whoever on the team
 * knows the username/password can sign in from their own phone; every
 * device that does so shares the same Firebase Auth user (and therefore the
 * same buzzer identity), which is exactly what "the team" means for scoring.
 *
 * Uses a disposable secondary Firebase App instance to mint the Auth user,
 * same reasoning as createAccount() in userService.ts: the default client
 * SDK would otherwise hijack the Admin's own signed-in session.
 */
export async function createTeamWithLogin(input: CreateTeamInput): Promise<string> {
  const key = usernameKey(input.username);
  const existing = await getDoc(doc(db, 'usernames', key));
  if (existing.exists()) {
    throw new Error(`Username "${input.username}" is already taken.`);
  }

  const email = `${key}@${USERNAME_DOMAIN}`;
  const secondaryApp = getSecondaryAuthApp();
  let uid: string;
  try {
    const secondaryAuth = getAuth(secondaryApp);
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, input.password);
    uid = cred.user.uid;
    await firebaseSignOut(secondaryAuth);
  } catch (err) {
    throw friendlyAuthError(err);
  } finally {
    await disposeSecondaryAuthApp(secondaryApp);
  }

  const teamRef = doc(collection(db, 'games', input.gameId, 'teams'));
  const team: Omit<Team, 'id'> = {
    gameId: input.gameId,
    name: input.name.trim(),
    color: null,
    score: 0,
    uid,
    username: key,
    disabled: false,
    createdAt: Date.now(),
  };

  const profile: UserProfile = {
    uid,
    role: 'team',
    username: key,
    displayName: input.name.trim(),
    email,
    gameId: input.gameId,
    teamId: teamRef.id,
    disabled: false,
    createdAt: Date.now(),
    createdBy: input.actorUid,
  };
  const batch = writeBatch(db);
  batch.set(teamRef, team);
  batch.set(doc(db, 'users', uid), profile);
  batch.set(doc(db, 'usernames', key), { uid, email });
  batch.set(doc(db, 'games', input.gameId, 'teamCredentials', teamRef.id), {
    password: input.password,
    updatedAt: Date.now(),
  });
  await batch.commit();

  await set(ref(rtdb, `rolesIndex/${uid}`), 'team');
  await set(ref(rtdb, `rosterIndex/${input.gameId}/${uid}`), teamRef.id);

  await logAudit({
    gameId: input.gameId,
    action: 'TEAM_CREATED',
    actorUid: input.actorUid,
    actorName: input.actorName,
    payload: { teamId: teamRef.id, name: input.name, username: key },
  });

  return teamRef.id;
}

export async function resetTeamPassword(gameId: string, teamId: string): Promise<string> {
  const reset = httpsCallable<{ gameId: string; teamId: string }, { password: string }>(
    functions,
    'resetTeamPassword'
  );
  const result = await reset({ gameId, teamId });
  return result.data.password;
}

export function listenTeamCredentials(gameId: string, cb: (credentials: Record<string, string>) => void): () => void {
  return onSnapshot(collection(db, 'games', gameId, 'teamCredentials'), (snap) => {
    const credentials: Record<string, string> = {};
    for (const credential of snap.docs) {
      const password = credential.data().password;
      if (typeof password === 'string') credentials[credential.id] = password;
    }
    cb(credentials);
  });
}

export async function updateTeam(
  gameId: string,
  teamId: string,
  updates: Partial<Pick<Team, 'name' | 'color'>>,
  actorUid: string,
  actorName: string
): Promise<void> {
  await updateDoc(doc(db, 'games', gameId, 'teams', teamId), updates);
  await logAudit({
    gameId,
    action: 'TEAM_UPDATED',
    actorUid,
    actorName,
    payload: { teamId, updates },
  });
}

/**
 * Removes a team's ability to play: deletes its username lookup (blocks
 * future sign-in immediately) and disables its profile, then removes the
 * team record itself. As with participant removal previously, this cannot
 * purge the underlying Firebase Auth account from the client SDK - see
 * README's Architecture notes for why, and the Admin-SDK-based alternative.
 */
export async function deleteTeam(
  gameId: string,
  teamId: string,
  actorUid: string,
  actorName: string
): Promise<void> {
  const teamSnap = await getDoc(doc(db, 'games', gameId, 'teams', teamId));
  const team = teamSnap.data() as Team | undefined;

  if (team?.username) {
    await deleteDoc(doc(db, 'usernames', team.username)).catch(() => undefined);
  }
  if (team?.uid) {
    await updateDoc(doc(db, 'users', team.uid), { disabled: true }).catch(() => undefined);
    await remove(ref(rtdb, `rosterIndex/${gameId}/${team.uid}`)).catch(() => undefined);
  }
  await deleteDoc(doc(db, 'games', gameId, 'teamCredentials', teamId));
  await deleteDoc(doc(db, 'games', gameId, 'teams', teamId));

  await logAudit({
    gameId,
    action: 'TEAM_DELETED',
    actorUid,
    actorName,
    payload: { teamId },
  });
}

export function listenTeams(gameId: string, cb: (teams: Team[]) => void): () => void {
  const q = query(collection(db, 'games', gameId, 'teams'), orderBy('createdAt', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Team, 'id'>) })));
  });
}
