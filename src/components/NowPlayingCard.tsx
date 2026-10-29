import { MusicPlayer } from './MusicPlayer';
import type { LiveMusicPrivate, LiveMusicState } from '../types/live';

/**
 * `audio` controls whether THIS client actually plays sound:
 * - 'visible': mounts a real, visible YouTube player (Admin control room).
 * - 'hidden': mounts a real but invisible player, audio only (Spectator
 *   screen, which is the one connected to the room's speakers).
 * - 'none': no player is mounted at all - just a synced visual indicator.
 *   Every team's own phone uses this: if every phone played the track at
 *   once the room would turn into an out-of-sync echo chamber, so teams
 *   only ever watch the shared state, never play audio locally.
 *
 * `track` is the Admin/Spectator-only identity of the song and is simply
 * absent for teams - their security rules don't grant read access to it, so
 * the answer to a guessing round can't be pulled out of the database even
 * with devtools open. `revealTrackInfo` additionally gates *displaying* the
 * title, which only Admin does (they need it to judge answers).
 */
export function NowPlayingCard({
  music,
  track,
  shouldPlay,
  audio = 'none',
  revealTrackInfo = false,
}: {
  music: LiveMusicState;
  track?: LiveMusicPrivate | null;
  shouldPlay: boolean;
  audio?: 'visible' | 'hidden' | 'none';
  revealTrackInfo?: boolean;
}) {
  // Nothing actually plays until Admin turns the music on (see
  // gameService.startMusicPlayback) - before that, playbackStartedAt is
  // still null and this just shows the round is armed and waiting. RTDB
  // drops a key written as null rather than storing it, so it comes back
  // here as undefined, not null - check for a real number, not just "not
  // null".
  const started = typeof music.playbackStartedAt === 'number';
  const canPlay = audio !== 'none' && !!track?.providerId && started;

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="eyebrow">Music round</div>
      {revealTrackInfo && track && (
        <div className="title-md">
          {track.title} {track.artist ? `- ${track.artist}` : ''}
        </div>
      )}
      {audio === 'visible' && canPlay ? (
        <MusicPlayer
          key={music.playbackToken}
          providerId={track!.providerId!}
          startSeconds={track!.startSeconds}
          playbackDurationSeconds={music.playbackDurationSeconds}
          shouldPlay={shouldPlay}
          visible
        />
      ) : (
        <div style={{ fontSize: '3rem', margin: '14px 0' }}>
          {!started ? '🎵' : shouldPlay ? '🔊' : '⏸️'}
        </div>
      )}
      {audio === 'hidden' && canPlay && (
        <MusicPlayer
          key={music.playbackToken}
          providerId={track!.providerId!}
          startSeconds={track!.startSeconds}
          playbackDurationSeconds={music.playbackDurationSeconds}
          shouldPlay={shouldPlay}
          showPlayButton={audio === 'hidden'}
        />
      )}
      <p className="muted">{!started ? 'Waiting for music to start...' : shouldPlay ? 'Listen carefully...' : 'Paused'}</p>
    </div>
  );
}
