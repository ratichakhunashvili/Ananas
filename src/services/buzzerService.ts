import { ref, runTransaction, serverTimestamp } from 'firebase/database';
import { rtdb } from '../lib/firebase';
import type { BuzzerClaim } from '../types/live';

export type BuzzPressOutcome = { status: 'WON' } | { status: 'TOO_LATE' } | { status: 'CLOSED' };

/**
 * The single most important piece of the whole system: deciding, with no
 * ambiguity, which team buzzed in first.
 *
 * A team's shared login only ever writes to this one leaf
 * (`buzzer/{gqId}/claim`), never to sibling state. That keeps the security
 * model simple: the Realtime Database transaction decides "first write wins"
 * on the server (not by comparing client Date.now() timestamps - see the
 * retry semantics of runTransaction), and database.rules.json independently
 * re-checks, on the server, that the buzzer is actually open and that this
 * team hasn't already had its turn on this question (via a sibling lookup at
 * `buzzer/{gqId}/attempts/{myTeamId}`, written by Admin when judging an
 * answer). A client cannot force a win by lying about timing or state.
 */
export async function pressBuzzer(
  gameId: string,
  gameQuestionId: string,
  uid: string,
  teamId: string,
  teamName: string
): Promise<BuzzPressOutcome> {
  const claimRef = ref(rtdb, `liveGames/${gameId}/buzzer/${gameQuestionId}/claim`);

  try {
    const result = await runTransaction(claimRef, (current: BuzzerClaim | null) => {
      if (current !== null) return undefined; // abort: someone already holds the floor
      const claim: BuzzerClaim = { uid, teamId, teamName, at: serverTimestamp() };
      return claim;
    });

    return result.committed ? { status: 'WON' } : { status: 'TOO_LATE' };
  } catch {
    // Denied by security rules: buzzer isn't open, or this team already
    // attempted this question and is locked out.
    return { status: 'CLOSED' };
  }
}
