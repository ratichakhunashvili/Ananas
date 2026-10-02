import {
  addDoc,
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { ref, onValue, set, update, remove } from 'firebase/database';
import { db, rtdb } from '../lib/firebase';
import { estimatedServerNow } from '../lib/serverTime';
import type { Game, GameQuestion, Question } from '../types';
import type {
  LiveGameMeta,
  LiveMusicPrivate,
  LiveMusicState,
  LiveProblemCaseState,
  LiveQuestionState,
} from '../types/live';
import { logAudit } from './auditService';
import { answerLength } from './questionService';
import { awardPoints } from './scoreService';
import type { MusicTrack, Team } from '../types';

// ---------------------------------------------------------------------------
// Game lifecycle
// ---------------------------------------------------------------------------

export async function createGame(name: string, actorUid: string, actorName: string): Promise<string> {
  const docRef = await addDoc(collection(db, 'games'), {
    name: name.trim(),
    status: 'DRAFT',
    createdAt: Date.now(),
    createdBy: actorUid,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    currentGameQuestionId: null,
  });
  await logAudit({ gameId: docRef.id, action: 'GAME_CREATED', actorUid, actorName, payload: { name } });
  return docRef.id;
}

export async function updateGameName(gameId: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), { name: name.trim() });
}

export function listenGame(gameId: string, cb: (game: Game | null) => void): () => void {
  return onSnapshot(doc(db, 'games', gameId), (snap) => {
    cb(snap.exists() ? ({ id: snap.id, ...(snap.data() as Omit<Game, 'id'>) } as Game) : null);
  });
}

export function listenGames(cb: (games: Game[]) => void): () => void {
  const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Game, 'id'>) })) as Game[]);
  });
}

export function listenLiveGame(gameId: string, cb: (state: LiveGameMeta | null) => void): () => void {
  return onValue(ref(rtdb, `liveGames/${gameId}`), (snap) => {
    cb(snap.val());
  });
}

export async function startGame(gameId: string, actorUid: string, actorName: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), { status: 'LIVE', startedAt: Date.now(), pausedAt: null });
  await update(ref(rtdb, `liveGames/${gameId}`), { status: 'LIVE', updatedAt: estimatedServerNow() });
  await logAudit({ gameId, action: 'GAME_STARTED', actorUid, actorName });
}

export async function pauseGame(gameId: string, actorUid: string, actorName: string): Promise<void> {
  const now = estimatedServerNow();
  await updateDoc(doc(db, 'games', gameId), { status: 'PAUSED', pausedAt: now });
  await update(ref(rtdb, `liveGames/${gameId}`), { status: 'PAUSED', updatedAt: now });
  await logAudit({ gameId, action: 'GAME_PAUSED', actorUid, actorName });
}

/**
 * Resuming shifts any live countdown (question timer or problem-case prep
 * timer) forward by exactly how long the game was paused, so a pause never
 * costs teams preparation/answer time.
 */
export async function resumeGame(
  gameId: string,
  pausedAt: number,
  actorUid: string,
  actorName: string
): Promise<void> {
  const now = estimatedServerNow();
  const pauseDurationMs = Math.max(0, now - pausedAt);

  const liveStateRef = ref(rtdb, `liveGames/${gameId}`);
  const updates: Record<string, unknown> = { status: 'LIVE', updatedAt: now };

  const currentLive = await getLiveGameOnce(gameId);
  if (currentLive?.currentQuestion?.endsAt) {
    updates['currentQuestion/endsAt'] = currentLive.currentQuestion.endsAt + pauseDurationMs;
  }
  if (currentLive?.problemCase?.endsAt) {
    updates['problemCase/endsAt'] = currentLive.problemCase.endsAt + pauseDurationMs;
  }

  await update(liveStateRef, updates);
  await updateDoc(doc(db, 'games', gameId), { status: 'LIVE', pausedAt: null });
  await logAudit({ gameId, action: 'GAME_RESUMED', actorUid, actorName });
}

export async function endGame(gameId: string, actorUid: string, actorName: string): Promise<void> {
  await updateDoc(doc(db, 'games', gameId), { status: 'FINISHED', endedAt: Date.now() });
  await update(ref(rtdb, `liveGames/${gameId}`), { status: 'FINISHED', updatedAt: estimatedServerNow() });
  await logAudit({ gameId, action: 'GAME_ENDED', actorUid, actorName });
}

/**
 * Permanently removes a game and everything scoped to it (teams and their
 * logins, selected questions, score/audit history, live session state).
 * Intended for DRAFT games created by mistake - the UI only offers this
 * before a game has ever gone LIVE, so a played game's history (required
 * for Game History) is never at risk of being wiped out this way.
 */
export async function deleteGame(gameId: string): Promise<void> {
  const [teamsSnap, gqSnap, scoreSnap, auditSnap] = await Promise.all([
    getDocs(collection(db, 'games', gameId, 'teams')),
    getDocs(collection(db, 'games', gameId, 'gameQuestions')),
    getDocs(collection(db, 'games', gameId, 'scoreEvents')),
    getDocs(collection(db, 'games', gameId, 'auditLog')),
  ]);

  const batch = writeBatch(db);
  teamsSnap.docs.forEach((teamDoc) => {
    const team = teamDoc.data() as Team;
    batch.delete(teamDoc.ref);
    // A team IS a login - deleting the game it was created for should fully
    // retire that login too, not leave it dangling with no team to show.
    if (team.username) batch.delete(doc(db, 'usernames', team.username));
    if (team.uid) batch.update(doc(db, 'users', team.uid), { disabled: true });
  });
  gqSnap.docs.forEach((d) => batch.delete(d.ref));
  scoreSnap.docs.forEach((d) => batch.delete(d.ref));
  auditSnap.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'games', gameId));
  await batch.commit();

  await remove(ref(rtdb, `liveGames/${gameId}`));
  await remove(ref(rtdb, `rosterIndex/${gameId}`));
}

async function getLiveGameOnce(gameId: string): Promise<LiveGameMeta | null> {
  return new Promise((resolve) => {
    const r = ref(rtdb, `liveGames/${gameId}`);
    onValue(
      r,
      (snap) => resolve(snap.val()),
      { onlyOnce: true }
    );
  });
}

// ---------------------------------------------------------------------------
// Game questions (ordered selection from the question bank for one game)
// ---------------------------------------------------------------------------

/**
 * Reconciles the game's question list against `selections`, rather than
 * wiping and recreating it. This matters a lot mid-game: the doc id of a
 * gameQuestion is what `game.currentGameQuestionId` and the whole
 * `liveGames/{id}/buzzer/{gqId}` subtree key off, and `status` is the record
 * of which questions have already been played. Recreating the docs would
 * orphan the live question and silently reset every question to WAITING.
 * So: keep existing docs (id + status intact) for questions that stay,
 * only create docs for newly added ones, and delete only the removed ones.
 */
export async function setGameQuestions(
  gameId: string,
  selections: { questionId: string; pointsOverride?: number | null }[]
): Promise<void> {
  const existing = await getDocs(collection(db, 'games', gameId, 'gameQuestions'));
  const byQuestionId = new Map<string, (typeof existing.docs)[number]>();
  existing.docs.forEach((d) => {
    const qid = d.data().questionId as string;
    // Defensive: if the same question somehow got added twice, keep the
    // first and let the duplicate fall through to deletion below.
    if (!byQuestionId.has(qid)) byQuestionId.set(qid, d);
  });

  const keptDocIds = new Set<string>();
  const batch = writeBatch(db);

  selections.forEach((sel, index) => {
    const existingDoc = byQuestionId.get(sel.questionId);
    if (existingDoc) {
      keptDocIds.add(existingDoc.id);
      batch.update(existingDoc.ref, {
        order: index,
        pointsOverride: sel.pointsOverride ?? existingDoc.data().pointsOverride ?? null,
      });
    } else {
      batch.set(doc(collection(db, 'games', gameId, 'gameQuestions')), {
        questionId: sel.questionId,
        order: index,
        pointsOverride: sel.pointsOverride ?? null,
        status: 'WAITING',
      });
    }
  });

  existing.docs.forEach((d) => {
    if (!keptDocIds.has(d.id)) batch.delete(d.ref);
  });

  await batch.commit();
}

export function listenGameQuestions(gameId: string, cb: (gqs: GameQuestion[]) => void): () => void {
  const q = query(collection(db, 'games', gameId, 'gameQuestions'), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GameQuestion, 'id'>) })));
  });
}

async function setGameQuestionStatus(gameId: string, gqId: string, status: GameQuestion['status']) {
  await updateDoc(doc(db, 'games', gameId, 'gameQuestions', gqId), { status });
}

// ---------------------------------------------------------------------------
// Question flow (TEXT / MULTIPLE_CHOICE / PHOTO_ASSOCIATION / MUSIC_GUESS)
// ---------------------------------------------------------------------------

function buildSanitizedQuestion(
  gq: GameQuestion,
  question: Question,
  categoryName: string | null
): LiveQuestionState {
  const points = gq.pointsOverride ?? question.points;
  const timerSeconds = question.timerSeconds;
  const now = estimatedServerNow();

  const base: LiveQuestionState = {
    gameQuestionId: gq.id,
    questionId: question.id,
    type: question.type,
    categoryName,
    points,
    timerSeconds,
    status: 'ACTIVE',
    startedAt: now,
    endsAt: timerSeconds ? now + timerSeconds * 1000 : null,
    pausedRemainingMs: null,
    text: null,
    imageUrl: null,
    imageUrls: null,
    choices: null,
    answerLength: null,
    title: null,
    description: null,
    fileUrls: null,
    winningTeamId: null,
    awardedPoints: null,
  };

  if (question.type === 'TEXT' || question.type === 'MULTIPLE_CHOICE') {
    base.text = question.text;
    base.imageUrl = question.imageUrl;
    base.choices = question.choices;
  } else if (question.type === 'PHOTO_ASSOCIATION') {
    base.imageUrls = question.imageUrls;
    base.answerLength = answerLength(question.correctAnswer);
  } else if (question.type === 'MUSIC_GUESS') {
    base.answerLength = null;
  }

  return base;
}

export async function startQuestion(
  gameId: string,
  gq: GameQuestion,
  question: Question,
  categoryName: string | null,
  track?: MusicTrack | null
): Promise<void> {
  if (question.type === 'PROBLEM_CASE') {
    throw new Error('Problem cases use startProblemCase, not startQuestion.');
  }

  const liveQuestion = buildSanitizedQuestion(gq, question, categoryName);

  const updates: Record<string, unknown> = {
    currentQuestion: liveQuestion,
    [`buzzer/${gq.id}`]: { open: true },
  };

  if (question.type === 'MUSIC_GUESS' && track) {
    const now2 = estimatedServerNow();
    const musicState: LiveMusicState = {
      active: true,
      gameQuestionId: gq.id,
      playing: true,
      playbackToken: now2,
      playbackStartedAt: now2,
      playbackDurationSeconds: question.playbackDurationSeconds,
    };
    updates.music = musicState;

    // Track identity goes to a separate path that teams cannot read - it is
    // literally the answer to the round. See LiveMusicPrivate.
    const privateState: LiveMusicPrivate = {
      musicTrackId: track.id,
      provider: 'youtube',
      providerId: track.providerId,
      title: track.title,
      artist: track.artist,
      startSeconds: question.startSeconds,
    };
    await set(ref(rtdb, `liveMusic/${gameId}`), privateState);
  } else {
    updates.music = null;
    await remove(ref(rtdb, `liveMusic/${gameId}`));
  }

  await update(ref(rtdb, `liveGames/${gameId}`), updates);
  await updateDoc(doc(db, 'games', gameId), { currentGameQuestionId: gq.id });
  await setGameQuestionStatus(gameId, gq.id, 'ACTIVE');
}

export async function markCorrect(
  gameId: string,
  gq: GameQuestion,
  question: Question,
  team: Team,
  actorUid: string,
  actorName: string
): Promise<void> {
  const points = gq.pointsOverride ?? question.points;
  const label =
    question.type === 'MUSIC_GUESS' ? 'Music Round' : question.type === 'PHOTO_ASSOCIATION' ? 'Photo Association' : 'Question';

  // Award FIRST, then close the question. awardPoints is the transactional,
  // genuinely-can-fail step; if it throws after we'd already marked the
  // question complete, the team would be left on zero with the round shut -
  // the worst possible outcome to debug in front of a classroom. Doing it in
  // this order means a failure leaves the question still open and retryable.
  await awardPoints({
    gameId,
    teamId: team.id,
    teamName: team.name,
    amount: points,
    reason: `${label}: correct answer`,
    source: question.type === 'MUSIC_GUESS' ? 'MUSIC_GUESS' : question.type === 'PHOTO_ASSOCIATION' ? 'PHOTO_ASSOCIATION' : 'QUESTION',
    questionId: question.id,
    adminUid: actorUid,
    adminName: actorName,
  });

  await update(ref(rtdb, `liveGames/${gameId}/buzzer/${gq.id}`), {
    [`attempts/${team.id}`]: {
      uid: team.uid,
      teamId: team.id,
      at: estimatedServerNow(),
      result: 'correct',
    },
    open: false,
  });
  await update(ref(rtdb, `liveGames/${gameId}`), {
    'currentQuestion/status': 'COMPLETED',
    'currentQuestion/winningTeamId': team.id,
    'currentQuestion/awardedPoints': points,
    music: null,
  });
  await remove(ref(rtdb, `liveMusic/${gameId}`));
  await setGameQuestionStatus(gameId, gq.id, 'COMPLETED');

  await logAudit({
    gameId,
    action: 'ANSWER_CORRECT',
    actorUid,
    actorName,
    payload: { questionId: question.id, teamId: team.id, points },
  });
}

export async function markWrong(
  gameId: string,
  gq: GameQuestion,
  team: Team,
  actorUid: string,
  actorName: string
): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}/buzzer/${gq.id}`), {
    [`attempts/${team.id}`]: {
      uid: team.uid,
      teamId: team.id,
      at: estimatedServerNow(),
      result: 'wrong',
    },
  });
  await update(ref(rtdb, `liveGames/${gameId}`), { 'currentQuestion/status': 'WRONG_ANSWER' });
  await logAudit({
    gameId,
    action: 'ANSWER_WRONG',
    actorUid,
    actorName,
    payload: { teamId: team.id },
  });
}

/** Clears the current claim so another eligible team can buzz, or music resumes. */
export async function reopenForNextAttempt(gameId: string, gqId: string): Promise<void> {
  await remove(ref(rtdb, `liveGames/${gameId}/buzzer/${gqId}/claim`));
  await update(ref(rtdb, `liveGames/${gameId}`), { 'currentQuestion/status': 'ACTIVE' });
}

export async function endQuestion(
  gameId: string,
  gqId: string,
  finalStatus: 'COMPLETED' | 'TIME_EXPIRED',
  actorUid: string,
  actorName: string
): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}/buzzer/${gqId}`), { open: false });
  await update(ref(rtdb, `liveGames/${gameId}`), {
    'currentQuestion/status': finalStatus,
    music: null,
  });
  await remove(ref(rtdb, `liveMusic/${gameId}`));
  await setGameQuestionStatus(gameId, gqId, finalStatus);
  await logAudit({ gameId, action: 'QUESTION_ENDED', actorUid, actorName, payload: { gqId, finalStatus } });
}

/** Subscribes to the Admin/Spectator-only track identity for the live music round. */
export function listenLiveMusic(
  gameId: string,
  cb: (music: LiveMusicPrivate | null) => void
): () => void {
  return onValue(ref(rtdb, `liveMusic/${gameId}`), (snap) => cb(snap.val()));
}

/**
 * Closes the buzzer when a timed question runs out with nobody holding the
 * floor. The security rules already reject a late buzz using the server's
 * own clock, so this is about the *visible* state catching up: without it,
 * every screen sits at 0:00 with a live-looking buzzer until Admin notices.
 * Safe to call repeatedly - it only acts on a still-ACTIVE question.
 */
export async function expireQuestionIfDue(
  gameId: string,
  gqId: string,
  actorUid: string,
  actorName: string
): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}/buzzer/${gqId}`), { open: false });
  await update(ref(rtdb, `liveGames/${gameId}`), { 'currentQuestion/status': 'TIME_EXPIRED' });
  await setGameQuestionStatus(gameId, gqId, 'TIME_EXPIRED');
  await logAudit({
    gameId,
    action: 'QUESTION_ENDED',
    actorUid,
    actorName,
    payload: { gqId, finalStatus: 'TIME_EXPIRED', reason: 'timer expired' },
  });
}

// ---------------------------------------------------------------------------
// Problem case
// ---------------------------------------------------------------------------

export async function startProblemCase(
  gameId: string,
  gq: GameQuestion,
  question: Extract<Question, { type: 'PROBLEM_CASE' }>,
  actorUid: string,
  actorName: string
): Promise<void> {
  const now = estimatedServerNow();
  const state: LiveProblemCaseState = {
    active: true,
    gameQuestionId: gq.id,
    title: question.title,
    description: question.description,
    fileUrls: question.fileUrls,
    phase: 'prep',
    startedAt: now,
    endsAt: now + question.timeLimitSeconds * 1000,
    presentationOrder: [],
    currentPresentingTeamId: null,
  };
  await update(ref(rtdb, `liveGames/${gameId}`), { problemCase: state, currentQuestion: null });
  await updateDoc(doc(db, 'games', gameId), { currentGameQuestionId: gq.id });
  await setGameQuestionStatus(gameId, gq.id, 'ACTIVE');
  await logAudit({ gameId, action: 'CASE_STARTED', actorUid, actorName, payload: { questionId: question.id } });
}

export async function setCasePresentationOrder(gameId: string, teamIds: string[]): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}/problemCase`), {
    phase: 'presenting',
    presentationOrder: teamIds,
    currentPresentingTeamId: teamIds[0] ?? null,
  });
}

export async function advancePresentation(gameId: string, remainingTeamIds: string[]): Promise<void> {
  if (remainingTeamIds.length === 0) {
    await update(ref(rtdb, `liveGames/${gameId}/problemCase`), {
      phase: 'done',
      currentPresentingTeamId: null,
    });
    return;
  }
  await update(ref(rtdb, `liveGames/${gameId}/problemCase`), {
    currentPresentingTeamId: remainingTeamIds[0],
  });
}

export async function scoreCase(
  gameId: string,
  gqId: string,
  caseTitle: string,
  questionId: string | null,
  team: Team,
  points: number,
  actorUid: string,
  actorName: string
): Promise<void> {
  await awardPoints({
    gameId,
    teamId: team.id,
    teamName: team.name,
    amount: points,
    reason: `Problem Case: ${caseTitle}`,
    source: 'PROBLEM_CASE',
    questionId,
    adminUid: actorUid,
    adminName: actorName,
  });
  await logAudit({
    gameId,
    action: 'CASE_SCORED',
    actorUid,
    actorName,
    payload: { teamId: team.id, points, questionId, gqId },
  });
}

export async function endProblemCase(
  gameId: string,
  gqId: string | null,
  actorUid: string,
  actorName: string
): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}`), { problemCase: null });
  // Without this the case's question stayed ACTIVE forever, so it never left
  // the "next question" queue and the game could never be fully worked through.
  if (gqId) await setGameQuestionStatus(gameId, gqId, 'COMPLETED');
  await logAudit({ gameId, action: 'QUESTION_ENDED', actorUid, actorName, payload: { type: 'PROBLEM_CASE', gqId } });
}

// ---------------------------------------------------------------------------
// Karaoke bonus (independent per team)
// ---------------------------------------------------------------------------

export async function startKaraoke(
  gameId: string,
  team: Team,
  track: MusicTrack,
  startSeconds: number,
  durationSeconds: number,
  actorUid: string,
  actorName: string
): Promise<void> {
  const now = estimatedServerNow();
  await update(ref(rtdb, `liveGames/${gameId}`), {
    karaoke: {
      active: true,
      targetTeamId: team.id,
      targetTeamName: team.name,
      musicTrackId: track.id,
      providerId: track.providerId,
      title: track.title,
      artist: track.artist,
      startSeconds,
      durationSeconds,
      playing: true,
      playbackToken: now,
      playbackStartedAt: now,
    },
  });
  await logAudit({
    gameId,
    action: 'KARAOKE_STARTED',
    actorUid,
    actorName,
    payload: { teamId: team.id, trackId: track.id, startSeconds, durationSeconds },
  });
}

export async function stopKaraoke(gameId: string): Promise<void> {
  await update(ref(rtdb, `liveGames/${gameId}/karaoke`), { active: false, playing: false });
}

export async function scoreKaraoke(
  gameId: string,
  team: Team,
  points: number,
  actorUid: string,
  actorName: string
): Promise<void> {
  await awardPoints({
    gameId,
    teamId: team.id,
    teamName: team.name,
    amount: points,
    reason: 'Karaoke Bonus',
    source: 'KARAOKE_BONUS',
    adminUid: actorUid,
    adminName: actorName,
  });
  await stopKaraoke(gameId);
  await logAudit({
    gameId,
    action: 'KARAOKE_SCORED',
    actorUid,
    actorName,
    payload: { teamId: team.id, points },
  });
}

// ---------------------------------------------------------------------------
// Roster index maintenance (used for RTDB rule checks)
// ---------------------------------------------------------------------------

export async function resetRosterIndexForGame(gameId: string): Promise<void> {
  const usersSnap = await getDocs(query(collection(db, 'users'), where('gameId', '==', gameId)));
  const updates: Record<string, string> = {};
  usersSnap.docs.forEach((d) => {
    const data = d.data();
    if (data.teamId) updates[d.id] = data.teamId as string;
  });
  await set(ref(rtdb, `rosterIndex/${gameId}`), updates);
}
