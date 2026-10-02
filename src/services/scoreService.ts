import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { ScoreEvent, ScoreSource } from '../types';
import { logAudit } from './auditService';

export interface AwardPointsInput {
  gameId: string;
  teamId: string;
  teamName: string;
  amount: number;
  reason: string;
  source: ScoreSource;
  questionId?: string | null;
  adminUid: string;
  adminName: string;
}

/**
 * Atomically bumps the team's running score and appends an immutable score
 * event in a single Firestore transaction, so the scoreboard total and the
 * audit trail can never drift apart.
 */
export async function awardPoints(input: AwardPointsInput): Promise<void> {
  const teamRef = doc(db, 'games', input.gameId, 'teams', input.teamId);
  const eventRef = doc(collection(db, 'games', input.gameId, 'scoreEvents'));

  await runTransaction(db, async (tx) => {
    const teamSnap = await tx.get(teamRef);
    if (!teamSnap.exists()) throw new Error('Team not found.');
    const currentScore = (teamSnap.data().score as number) ?? 0;

    const event: Omit<ScoreEvent, 'id'> = {
      gameId: input.gameId,
      teamId: input.teamId,
      teamName: input.teamName,
      amount: input.amount,
      reason: input.reason,
      source: input.source,
      questionId: input.questionId ?? null,
      adminUid: input.adminUid,
      adminName: input.adminName,
      timestamp: Date.now(),
    };

    tx.update(teamRef, { score: currentScore + input.amount });
    tx.set(eventRef, event);
  });

  await logAudit({
    gameId: input.gameId,
    action: input.amount >= 0 ? 'POINTS_ADDED' : 'POINTS_REMOVED',
    actorUid: input.adminUid,
    actorName: input.adminName,
    payload: { teamId: input.teamId, amount: input.amount, reason: input.reason, source: input.source },
  });
}

export function listenScoreHistory(gameId: string, cb: (events: ScoreEvent[]) => void): () => void {
  const q = query(collection(db, 'games', gameId, 'scoreEvents'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScoreEvent, 'id'>) })));
  });
}

export function listenTeamScoreHistory(
  gameId: string,
  teamId: string,
  cb: (events: ScoreEvent[]) => void
): () => void {
  const q = query(
    collection(db, 'games', gameId, 'scoreEvents'),
    where('teamId', '==', teamId),
    orderBy('timestamp', 'desc')
  );
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ScoreEvent, 'id'>) })));
  });
}
