import { onDisconnect, onValue, ref, remove, serverTimestamp, set } from 'firebase/database';
import { rtdb } from '../lib/firebase';

export interface PresenceEntry {
  teamId: string;
  at: number | object;
}

/**
 * Registers this device as "connected" for its team and tears the entry down
 * automatically if the tab closes, the phone sleeps, or the wifi drops -
 * `onDisconnect` is resolved by the Firebase server, so it still fires when
 * the client vanishes without a clean exit (the normal case in a classroom).
 *
 * Multiple devices on the same team share one uid, so this answers "is at
 * least one device for this team reachable right now", which is exactly the
 * question the teacher needs answered before starting.
 */
export function registerPresence(gameId: string, uid: string, teamId: string): () => void {
  const entryRef = ref(rtdb, `presence/${gameId}/${uid}`);
  const connectedRef = ref(rtdb, '.info/connected');

  const unsubscribe = onValue(connectedRef, (snap) => {
    if (snap.val() !== true) return;
    // Re-arm on every reconnect: onDisconnect registrations are consumed
    // when they fire, so a flaky connection would otherwise stop reporting.
    onDisconnect(entryRef)
      .remove()
      .then(() => set(entryRef, { teamId, at: serverTimestamp() }))
      .catch(() => undefined);
  });

  return () => {
    unsubscribe();
    remove(entryRef).catch(() => undefined);
  };
}

/**
 * Firebase's own view of whether this client currently has a live socket.
 * Distinct from navigator.onLine, which only knows about the network
 * interface and happily reports "online" on classroom wifi that has
 * silently stopped forwarding packets.
 */
export function listenConnection(cb: (connected: boolean) => void): () => void {
  return onValue(ref(rtdb, '.info/connected'), (snap) => cb(snap.val() === true));
}

export function listenPresence(
  gameId: string,
  cb: (byTeamId: Record<string, boolean>) => void
): () => void {
  return onValue(ref(rtdb, `presence/${gameId}`), (snap) => {
    const value = (snap.val() ?? {}) as Record<string, PresenceEntry>;
    const byTeamId: Record<string, boolean> = {};
    Object.values(value).forEach((entry) => {
      if (entry?.teamId) byTeamId[entry.teamId] = true;
    });
    cb(byTeamId);
  });
}
