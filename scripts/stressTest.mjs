#!/usr/bin/env node
/**
 * Emulator stress + scenario suite for the live game engine.
 *
 * Exercises the parts that are expensive to get wrong in front of a class:
 * the simultaneous-buzz race at full roster size, the lockout rules, the
 * states where buzzing must be refused, the answer-leak boundary, and
 * whether team scores still reconcile against the score-event log at the end.
 *
 * Run with the emulators up:  node scripts/stressTest.mjs
 */

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';

import { initializeApp as adminInit } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getDatabase as adminDb } from 'firebase-admin/database';
import { getFirestore as adminFs } from 'firebase-admin/firestore';

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from 'firebase/auth';
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  runTransaction,
  serverTimestamp,
  get as dbGet,
} from 'firebase/database';

const PROJECT_ID = 'demo-ananas';
const GAME_ID = 'stressgame';
const TEAM_COUNT = 20;
const DB_URL = `http://127.0.0.1:9000/?ns=${PROJECT_ID}-default-rtdb`;

adminInit({ projectId: PROJECT_ID, databaseURL: DB_URL });
const aAuth = adminAuth();
const aDb = adminDb();
const aFs = adminFs();

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

// --------------------------------------------------------------------------
// Setup: one game, TEAM_COUNT teams, each with its own shared login
// --------------------------------------------------------------------------
async function setup() {
  console.log(`\nSetting up ${TEAM_COUNT} teams...`);
  await aDb.ref(`liveGames/${GAME_ID}`).remove();
  await aDb.ref(`rosterIndex/${GAME_ID}`).remove();
  await aDb.ref(`liveMusic/${GAME_ID}`).remove();

  const clients = [];
  for (let i = 0; i < TEAM_COUNT; i++) {
    const teamId = `team${i}`;
    const email = `stress${i}@ananas.local`;
    let uid;
    try {
      uid = (await aAuth.getUserByEmail(email)).uid;
      await aAuth.updateUser(uid, { password: 'password123' });
    } catch {
      uid = (await aAuth.createUser({ email, password: 'password123' })).uid;
    }
    await aDb.ref(`rolesIndex/${uid}`).set('team');
    await aDb.ref(`rosterIndex/${GAME_ID}/${uid}`).set(teamId);
    await aFs.doc(`games/${GAME_ID}/teams/${teamId}`).set({
      gameId: GAME_ID, name: `Team ${i}`, color: null, score: 0,
      uid, username: `stress${i}`, disabled: false, createdAt: Date.now(),
    });
    clients.push({ teamId, email, uid });
  }

  // Sign in every team as a separate client app, like 20 real phones.
  const cfg = { apiKey: 'fake', projectId: PROJECT_ID, databaseURL: DB_URL };
  for (const c of clients) {
    const app = initializeApp(cfg, `c-${c.teamId}-${Date.now()}`);
    const auth = getAuth(app);
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    const rtdb = getDatabase(app);
    connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
    await signInWithEmailAndPassword(auth, c.email, 'password123');
    c.rtdb = rtdb;
  }
  console.log(`Signed in ${clients.length} team clients.`);
  return clients;
}

async function openQuestion(gqId, { status = 'LIVE', timerMs = 60000 } = {}) {
  const now = Date.now();
  await aDb.ref(`liveGames/${GAME_ID}`).update({
    status,
    currentQuestion: {
      gameQuestionId: gqId, questionId: 'q', type: 'TEXT', categoryName: null,
      points: 2, timerSeconds: 60, status: 'ACTIVE',
      startedAt: now, endsAt: timerMs === null ? null : now + timerMs,
      text: 'Test question', winningTeamId: null, awardedPoints: null,
    },
  });
  await aDb.ref(`liveGames/${GAME_ID}/buzzer/${gqId}`).set({ open: true });
}

async function buzz(client, gqId, overrides = {}) {
  const claimRef = ref(client.rtdb, `liveGames/${GAME_ID}/buzzer/${gqId}/claim`);
  try {
    const res = await runTransaction(claimRef, (cur) => {
      if (cur !== null) return undefined;
      return {
        uid: client.uid, teamId: client.teamId, teamName: client.teamId,
        at: serverTimestamp(), ...overrides,
      };
    });
    return res.committed ? 'WON' : 'TOO_LATE';
  } catch (e) {
    return `DENIED:${e.code || e.message}`;
  }
}

async function main() {
  const clients = await setup();

  // ---- TEST 1: full-roster simultaneous buzz --------------------------------
  console.log(`\nTEST 1: all ${TEAM_COUNT} teams buzz simultaneously`);
  await openQuestion('gq1');
  const t0 = Date.now();
  const results = await Promise.all(clients.map((c) => buzz(c, 'gq1')));
  const elapsed = Date.now() - t0;
  const winners = results.filter((r) => r === 'WON');
  check(`exactly one winner out of ${TEAM_COUNT}`, winners.length === 1, `winners=${winners.length}`);
  check('all others rejected', results.filter((r) => r !== 'WON').length === TEAM_COUNT - 1);
  console.log(`  (resolved ${TEAM_COUNT} concurrent claims in ${elapsed}ms)`);

  const claimSnap = await aDb.ref(`liveGames/${GAME_ID}/buzzer/gq1/claim`).get();
  const winnerTeamId = claimSnap.val()?.teamId;
  check('stored claim matches a real team', clients.some((c) => c.teamId === winnerTeamId));
  check('claim.at was stamped by the server', typeof claimSnap.val()?.at === 'number');

  // ---- TEST 2: lockout after a wrong answer --------------------------------
  console.log('\nTEST 2: a team marked wrong cannot buzz again');
  await aDb.ref(`liveGames/${GAME_ID}/buzzer/gq1/attempts/${winnerTeamId}`).set({
    uid: 'x', teamId: winnerTeamId, at: Date.now(), result: 'wrong',
  });
  await aDb.ref(`liveGames/${GAME_ID}/buzzer/gq1/claim`).remove();
  const loser = clients.find((c) => c.teamId === winnerTeamId);
  const retry = await buzz(loser, 'gq1');
  check('locked-out team is refused', retry.startsWith('DENIED'), retry);

  const other = clients.find((c) => c.teamId !== winnerTeamId);
  const otherRes = await buzz(other, 'gq1');
  check('a team that has not tried yet still wins the floor', otherRes === 'WON', otherRes);

  // ---- TEST 3: buzzing is refused when the game is paused -------------------
  console.log('\nTEST 3: buzzer refuses while the game is PAUSED');
  await openQuestion('gq2', { status: 'PAUSED' });
  const pausedRes = await buzz(clients[0], 'gq2');
  check('paused game blocks buzzing', pausedRes.startsWith('DENIED'), pausedRes);

  // ---- TEST 4: buzzing is refused after the timer expires -------------------
  console.log('\nTEST 4: buzzer refuses after the timer has run out');
  await openQuestion('gq3', { timerMs: -5000 }); // already expired
  const expiredRes = await buzz(clients[0], 'gq3');
  check('expired timer blocks buzzing', expiredRes.startsWith('DENIED'), expiredRes);

  // ---- TEST 5: a forged timestamp is rejected ------------------------------
  console.log('\nTEST 5: forged claim timestamp is rejected');
  await openQuestion('gq4');
  const forged = await buzz(clients[0], 'gq4', { at: 0 });
  check('client-chosen at=0 is refused', forged.startsWith('DENIED'), forged);
  const forgedTeam = await buzz(clients[1], 'gq4', { teamId: 'team0' });
  check('claiming on behalf of another team is refused', forgedTeam.startsWith('DENIED'), forgedTeam);
  const honest = await buzz(clients[2], 'gq4');
  check('an honest buzz still succeeds after forgery attempts', honest === 'WON', honest);

  // ---- TEST 6: music answers are not readable by teams ---------------------
  console.log('\nTEST 6: a team cannot read the music round answer');
  await aDb.ref(`liveMusic/${GAME_ID}`).set({
    musicTrackId: 't1', provider: 'youtube', providerId: 'SECRET_VIDEO_ID',
    title: 'Secret Song', artist: 'Secret Artist', startSeconds: 0,
  });
  let leaked = null;
  try {
    const snap = await dbGet(ref(clients[0].rtdb, `liveMusic/${GAME_ID}`));
    leaked = snap.val();
  } catch {
    leaked = 'DENIED';
  }
  check('liveMusic is unreadable by a team', leaked === 'DENIED', `got ${JSON.stringify(leaked)}`);

  const publicSnap = await dbGet(ref(clients[0].rtdb, `liveGames/${GAME_ID}/music`));
  const pub = JSON.stringify(publicSnap.val() ?? {});
  check('public music node carries no track identity', !pub.includes('SECRET'), pub);

  // ---- TEST 7: teams cannot tamper with game state ------------------------
  console.log('\nTEST 7: teams cannot write privileged state');
  const tamper = async (path, value) => {
    try {
      const { set } = await import('firebase/database');
      await set(ref(clients[0].rtdb, path), value);
      return 'ALLOWED';
    } catch (e) {
      return `DENIED:${e.code || ''}`;
    }
  };
  check('cannot reopen a buzzer', (await tamper(`liveGames/${GAME_ID}/buzzer/gq1/open`, true)).startsWith('DENIED'));
  check('cannot fake an attempt result', (await tamper(`liveGames/${GAME_ID}/buzzer/gq1/attempts/team5`, { uid: 'x', teamId: 'team5', at: 1, result: 'correct' })).startsWith('DENIED'));
  check('cannot change game status', (await tamper(`liveGames/${GAME_ID}/status`, 'FINISHED')).startsWith('DENIED'));
  check('cannot promote self to admin', (await tamper(`rolesIndex/${clients[0].uid}`, 'admin')).startsWith('DENIED'));
  check('cannot reassign own team', (await tamper(`rosterIndex/${GAME_ID}/${clients[0].uid}`, 'team9')).startsWith('DENIED'));

  // ---- TEST 8: score integrity vs. the event log --------------------------
  console.log('\nTEST 8: team scores reconcile against the score-event log');
  const teamRef = aFs.doc(`games/${GAME_ID}/teams/team0`);
  for (let i = 0; i < 25; i++) {
    await aFs.runTransaction(async (tx) => {
      const snap = await tx.get(teamRef);
      tx.update(teamRef, { score: (snap.data().score ?? 0) + 2 });
      tx.set(aFs.collection(`games/${GAME_ID}/scoreEvents`).doc(), {
        gameId: GAME_ID, teamId: 'team0', teamName: 'Team 0', amount: 2,
        reason: 'stress', source: 'QUESTION', questionId: null,
        adminUid: 'admin', adminName: 'admin', timestamp: Date.now(),
      });
    });
  }
  const finalTeam = (await teamRef.get()).data();
  const events = await aFs.collection(`games/${GAME_ID}/scoreEvents`).where('teamId', '==', 'team0').get();
  const sum = events.docs.reduce((acc, d) => acc + d.data().amount, 0);
  check('score equals the sum of its events', finalTeam.score === sum, `score=${finalTeam.score} events=${sum}`);

  // ---- Summary ------------------------------------------------------------
  console.log(`\n${'='.repeat(52)}`);
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log('='.repeat(52));

  // Cleanup
  await aDb.ref(`liveGames/${GAME_ID}`).remove();
  await aDb.ref(`rosterIndex/${GAME_ID}`).remove();
  await aDb.ref(`liveMusic/${GAME_ID}`).remove();
  for (const c of clients) await aAuth.deleteUser(c.uid).catch(() => {});
  await aFs.recursiveDelete(aFs.collection(`games/${GAME_ID}/teams`));
  await aFs.recursiveDelete(aFs.collection(`games/${GAME_ID}/scoreEvents`));

  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
