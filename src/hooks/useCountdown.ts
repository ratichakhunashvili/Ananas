import { useEffect, useState } from 'react';
import { estimatedServerNow } from '../lib/serverTime';

/**
 * Derives remaining milliseconds from a server-authoritative end timestamp.
 * Every client calling this with the same `endsAt` converges on the same
 * remaining time, regardless of local clock drift.
 */
export function useCountdown(endsAt: number | null | undefined): number | null {
  const [remainingMs, setRemainingMs] = useState<number | null>(
    endsAt ? Math.max(0, endsAt - estimatedServerNow()) : null
  );

  useEffect(() => {
    if (!endsAt) {
      setRemainingMs(null);
      return;
    }
    const tick = () => setRemainingMs(Math.max(0, endsAt - estimatedServerNow()));
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return remainingMs;
}

/**
 * The buzzer claim's `at` field is written with serverTimestamp() and, once
 * any client reads it back from a live snapshot, has already been resolved
 * to a plain number by the server - never the raw sentinel object. If a
 * claim exists, freeze the countdown at exactly how much time was left the
 * instant that team buzzed, instead of letting it keep ticking underneath.
 */
export function freezeRemainingMsForClaim(
  endsAt: number | null | undefined,
  claimAt: number | object | null | undefined
): number | null {
  if (!endsAt || typeof claimAt !== 'number') return null;
  return Math.max(0, endsAt - claimAt);
}

export function formatClock(ms: number | null): string {
  if (ms === null) return '--:--';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
