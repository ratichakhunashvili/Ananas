import { useCallback, useRef, useState } from 'react';

/**
 * Wraps an async action so it can't be fired twice.
 *
 * This matters more than it looks: every scoring action (CORRECT, karaoke
 * bonus, problem-case award, manual adjustment) writes a score event and
 * increments the team's total. A double-click on a laggy classroom network
 * - the exact moment an impatient teacher clicks again - would award the
 * points twice, and the only evidence would be two identical rows in the
 * score history. The ref guard rejects the second call synchronously,
 * before React has even re-rendered the disabled state.
 */
export function useBusyAction(): [boolean, (action: () => Promise<unknown>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  return [busy, run];
}
