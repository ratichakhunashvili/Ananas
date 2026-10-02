import { useMemo, useState } from 'react';
import { Logo } from '../../components/Logo';
import { TimerDisplay } from '../../components/TimerDisplay';
import { NowPlayingCard } from '../../components/NowPlayingCard';
import { MusicPlayer } from '../../components/MusicPlayer';
import { Scoreboard } from '../../components/Scoreboard';
import { freezeRemainingMsForClaim } from '../../hooks/useCountdown';
import { useGames, useLiveGame, useLiveMusic, useTeams } from '../../hooks/dataHooks';
import { logout } from '../../services/userService';
import type { Game } from '../../types';

function pickFeaturedGame(games: Game[]): Game | null {
  return (
    games.find((g) => g.status === 'LIVE' || g.status === 'PAUSED') ??
    games.find((g) => g.status === 'LOBBY') ??
    games[0] ??
    null
  );
}

export default function SpectatorPage() {
  const games = useGames();
  const [manualGameId, setManualGameId] = useState<string | null>(null);
  const featured = useMemo(() => pickFeaturedGame(games), [games]);
  const gameId = manualGameId ?? featured?.id ?? null;
  const game = games.find((g) => g.id === gameId) ?? null;
  const teams = useTeams(gameId);
  const live = useLiveGame(gameId);
  const musicTrack = useLiveMusic(gameId);

  const currentQuestion = live?.currentQuestion ?? null;
  const buzzerWindow = currentQuestion ? live?.buzzer?.[currentQuestion.gameQuestionId] : null;
  const claim = buzzerWindow?.claim ?? null;
  const claimTeam = claim ? teams.find((t) => t.id === claim.teamId) : null;
  const musicShouldPlay = Boolean(live?.music?.active) && !claim;
  const freezeRemainingMs = freezeRemainingMsForClaim(currentQuestion?.endsAt, claim?.at);

  if (!game) {
    return (
      <div className="spectator-shell">
        <Logo height={92} onDark />
        <div className="empty-state">No homework to display yet.</div>
      </div>
    );
  }

  return (
    <div className="spectator-shell">
      <div className="spread">
        <Logo height={92} onDark />
        <div className="row">
          {games.length > 1 && (
            <select
              value={gameId ?? ''}
              onChange={(e) => setManualGameId(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
            >
              {games.map((g) => (
                <option key={g.id} value={g.id} style={{ color: 'black' }}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <span className={`badge ${game.status === 'LIVE' ? 'badge-live' : 'badge-warning'}`}>{game.status}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => logout()} style={{ color: 'white' }}>
            Exit
          </button>
        </div>
      </div>

      <div className="grid grid-2" style={{ flex: 1, alignItems: 'start' }}>
        <div className="stack">
          {live?.karaoke?.active ? (
            <div className="spectator-card" style={{ textAlign: 'center' }}>
              <div className="badge badge-success">KARAOKE BONUS</div>
              <h1 style={{ fontSize: '3rem', margin: '10px 0' }}>{live.karaoke.targetTeamName}</h1>
              <p style={{ fontSize: '1.4rem' }}>
                {live.karaoke.title} - {live.karaoke.artist}
              </p>
              <div style={{ fontSize: '4rem' }}>🎤</div>
              {live.karaoke.playbackStartedAt && (
                <TimerDisplay
                  endsAt={live.karaoke.playbackStartedAt + live.karaoke.durationSeconds * 1000}
                  size="lg"
                />
              )}
              {/* The spectator screen is the room's speakers - this is where the
                  karaoke track has to actually come out. The song title is not a
                  secret here (unlike a guessing round), so it stays public. */}
              {live.karaoke.providerId && (
                <MusicPlayer
                  key={live.karaoke.playbackToken}
                  providerId={live.karaoke.providerId}
                  startSeconds={live.karaoke.startSeconds}
                  playbackDurationSeconds={live.karaoke.durationSeconds}
                  shouldPlay={live.karaoke.playing}
                />
              )}
            </div>
          ) : live?.problemCase?.active ? (
            <div className="spectator-card">
              <div className="badge badge-primary">PROBLEM CASE</div>
              <h1 style={{ fontSize: '2.4rem' }}>{live.problemCase.title}</h1>
              {live.problemCase.phase === 'prep' && (
                <TimerDisplay endsAt={live.problemCase.endsAt} size="lg" />
              )}
              {live.problemCase.phase === 'presenting' && (
                <p style={{ fontSize: '1.6rem' }}>
                  Presenting:{' '}
                  {teams.find((t) => t.id === live.problemCase?.currentPresentingTeamId)?.name ?? '-'}
                </p>
              )}
            </div>
          ) : currentQuestion ? (
            <div className="spectator-card">
              <div className="spread">
                <span className="badge badge-primary">{currentQuestion.categoryName ?? 'Question'}</span>
                <span className="badge badge-accent">{currentQuestion.points} PTS</span>
              </div>
              <TimerDisplay endsAt={currentQuestion.endsAt} freezeRemainingMs={freezeRemainingMs} size="lg" />

              {currentQuestion.type === 'MUSIC_GUESS' && live?.music ? (
                <NowPlayingCard
                  music={live.music}
                  track={musicTrack}
                  shouldPlay={musicShouldPlay}
                  audio="hidden"
                />
              ) : (
                <>
                  {currentQuestion.text && <h1 style={{ fontSize: '2.2rem' }}>{currentQuestion.text}</h1>}
                  {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" style={{ borderRadius: 16 }} />}
                  {currentQuestion.imageUrls && (
                    <div className="image-grid">
                      {currentQuestion.imageUrls.map((url) => (
                        <img key={url} src={url} alt="" />
                      ))}
                    </div>
                  )}
                  {currentQuestion.answerLength !== null && (
                    <p style={{ fontSize: '1.4rem' }}>The answer has {currentQuestion.answerLength} letters.</p>
                  )}
                </>
              )}

              <div style={{ marginTop: 18 }}>
                {currentQuestion.status === 'COMPLETED' && currentQuestion.winningTeamId ? (
                  <h2 style={{ fontSize: '2.4rem', color: 'var(--color-accent)' }}>
                    {teams.find((t) => t.id === currentQuestion.winningTeamId)?.name ?? 'Correct'}
                    {currentQuestion.awardedPoints !== null && ` +${currentQuestion.awardedPoints} POINTS`}
                  </h2>
                ) : currentQuestion.status === 'TIME_EXPIRED' ? (
                  <h2 style={{ fontSize: '2rem', color: '#ff9b9b' }}>TIME'S UP</h2>
                ) : claimTeam ? (
                  <h2 style={{ fontSize: '2rem' }}>
                    {claim && buzzerWindow?.attempts?.[claim.teamId]?.result === 'wrong' ? (
                      <span style={{ color: '#ff9b9b' }}>{claimTeam.name} - WRONG ANSWER</span>
                    ) : (
                      <span style={{ color: 'var(--color-accent)' }}>{claimTeam.name} BUZZED FIRST</span>
                    )}
                  </h2>
                ) : (
                  <p style={{ fontSize: '1.3rem', color: 'rgba(255,255,255,0.75)' }}>
                    Waiting for a team to buzz in...
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="spectator-card empty-state">Get ready for the next challenge...</div>
          )}
        </div>

        <div className="spectator-card">
          <h2 style={{ marginBottom: 14 }}>Leaderboard</h2>
          <Scoreboard teams={teams} highlightTeamId={claimTeam?.id} />
        </div>
      </div>
    </div>
  );
}
