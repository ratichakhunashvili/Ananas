import { ref, onValue } from 'firebase/database';
import { rtdb } from './firebase';

// Firebase keeps a running clock-skew estimate at this special path. We cache
// it once and reuse it everywhere so every client computes "now" relative to
// the same server clock instead of trusting its own system clock - this is
// what keeps question/case timers in sync across devices.
let cachedOffsetMs = 0;

onValue(ref(rtdb, '.info/serverTimeOffset'), (snapshot) => {
  const value = snapshot.val();
  cachedOffsetMs = typeof value === 'number' ? value : 0;
});

export function estimatedServerNow(): number {
  return Date.now() + cachedOffsetMs;
}
