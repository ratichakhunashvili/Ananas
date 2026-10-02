import { useCountdown, formatClock } from '../hooks/useCountdown';

export function TimerDisplay({
  endsAt,
  freezeRemainingMs,
  size = 'md',
}: {
  endsAt: number | null | undefined;
  /** When set (not null/undefined), the display stops ticking and shows this
   *  fixed value instead - used the instant a team buzzes, so everyone sees
   *  the countdown visibly stop rather than keep running underneath. */
  freezeRemainingMs?: number | null;
  size?: 'md' | 'lg';
}) {
  const isFrozen = freezeRemainingMs !== undefined && freezeRemainingMs !== null;
  const ticking = useCountdown(isFrozen ? null : endsAt);
  const remaining = isFrozen ? freezeRemainingMs : ticking;

  if (endsAt === null || endsAt === undefined) return null;
  const danger = remaining !== null && remaining < 10000;
  return (
    <div className={`timer${size === 'lg' ? ' timer-lg' : ''}${danger ? ' timer-danger' : ''}`}>
      {formatClock(remaining)}
    </div>
  );
}
