import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  useGame,
  useGameQuestions,
  useLiveGame,
  useLiveMusic,
  useMusicLibrary,
  usePresence,
  useQuestions,
  useTeams,
} from '../../hooks/dataHooks';
import { TimerDisplay } from '../../components/TimerDisplay';
import { NowPlayingCard } from '../../components/NowPlayingCard';
import { freezeRemainingMsForClaim } from '../../hooks/useCountdown';
import { useBusyAction } from '../../hooks/useBusyAction';
import { estimatedServerNow } from '../../lib/serverTime';
import * as gameService from '../../services/gameService';
import { pauseGame, resumeGame } from '../../services/gameService';
import { awardPoints } from '../../services/scoreService';
import { logAudit } from '../../services/auditService';
import type { GameQuestion, MusicTrack, Question, QuestionType, Team } from '../../types';
import type {
  BuzzerWindow,
  LiveGameMeta,
  LiveMusicPrivate,
  LiveMusicState,
  LiveQuestionState,
} from '../../types/live';

const TYPE_LABEL: Record<QuestionType, string> = {
  TEXT: 'Normal',
  MULTIPLE_CHOICE: 'Multiple Choice',
  PHOTO_ASSOCIATION: 'Photo Association',
  MUSIC_GUESS: 'Music',
  PROBLEM_CASE: 'Problem Case',
};

export default function LiveControlPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { profile } = useAuth();
  const game = useGame(gameId);
  const teams = useTeams(gameId);
  const gameQuestions = useGameQuestions(gameId);
  const allQuestions = useQuestions();
  const musicTracks = useMusicLibrary();
  const live = useLiveGame(gameId);
  const musicTrack = useLiveMusic(gameId);
  const presence = usePresence(gameId);
  const [error, setError] = useState<string | null>(null);

  const questionsById = useMemo(() => new Map(allQuestions.map((q) => [q.id, q])), [allQuestions]);
  const tracksById = useMemo(() => new Map(musicTracks.map((t) => [t.id, t])), [musicTracks]);

  const currentGq = gameQuestions.find((gq) => gq.id === game?.currentGameQuestionId) ?? null;
  const currentQuestion = currentGq ? questionsById.get(currentGq.questionId) ?? null : null;
  const buzzer = currentGq ? live?.buzzer?.[currentGq.id] : undefined;
  const claim = buzzer?.claim ?? null;
  const liveQuestion = live?.currentQuestion ?? null;

  // --- Auto-expire a timed question once the clock runs out -----------------
  // The security rules already refuse a late buzz using the server's own
  // clock; this makes the *visible* state agree, instead of leaving every
  // screen at 0:00 with a buzzer that still looks live.
  const expiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId || !profile || !liveQuestion || !currentGq) return;
    if (liveQuestion.status !== 'ACTIVE' || !liveQuestion.endsAt || claim) return;
    if (expiredRef.current === currentGq.id) return;

    const fire = () => {
      if (expiredRef.current === currentGq.id) return;
      expiredRef.current = currentGq.id;
      gameService
        .expireQuestionIfDue(gameId, currentGq.id, profile.uid, profile.displayName)
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not expire question.'));
    };

    const remaining = liveQuestion.endsAt - estimatedServerNow();
    if (remaining <= 0) {
      fire();
      return;
    }
    const t = window.setTimeout(fire, remaining + 250);
    return () => window.clearTimeout(t);
  }, [gameId, profile, liveQuestion, currentGq, claim]);

  // Reset the expiry latch whenever a different question becomes current.
  useEffect(() => {
    if (currentGq && expiredRef.current !== currentGq.id) expiredRef.current = null;
  }, [currentGq?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Audit every buzz (spec §37) -----------------------------------------
  // The team's own client can't write the audit log (admin-only by design),
  // so Admin records it on observing the claim land.
  const loggedBuzzRef = useRef<string | null>(null);
  useEffect(() => {
    if (!gameId || !claim || !currentGq) return;
    const key = `${currentGq.id}:${claim.teamId}:${String(claim.at)}`;
    if (loggedBuzzRef.current === key) return;
    loggedBuzzRef.current = key;
    const team = teams.find((t) => t.id === claim.teamId);
    logAudit({
      gameId,
      action: 'TEAM_BUZZED',
      actorUid: claim.uid,
      actorName: team?.name ?? claim.teamName ?? 'Team',
      payload: { teamId: claim.teamId, gqId: currentGq.id },
    }).catch(() => undefined);
  }, [gameId, claim, currentGq, teams]);

  if (!gameId || !game || !profile) return <div className="empty-state">Loading...</div>;

  const connectedCount = teams.filter((t) => presence[t.id]).length;
  const nextWaiting = gameQuestions.find((gq) => gq.status === 'WAITING') ?? null;

  async function startGameQuestion(gq: GameQuestion) {
    const question = questionsById.get(gq.questionId);
    if (!question) {
      setError('That question no longer exists in the question bank.');
      return;
    }
    setError(null);
    try {
      if (question.type === 'PROBLEM_CASE') {
        await gameService.startProblemCase(gameId!, gq, question, profile!.uid, profile!.displayName);
      } else {
        const track = question.type === 'MUSIC_GUESS' ? tracksById.get(question.musicTrackId) : null;
        if (question.type === 'MUSIC_GUESS' && !track) {
          setError('That music question points at a track that is no longer in the library.');
          return;
        }
        await gameService.startQuestion(gameId!, gq, question, null, track);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start that question.');
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 className="title-lg">{game.name} - Live Control</h1>
        <div className="row-wrap">
          <span className={`badge ${connectedCount === teams.length ? 'badge-success' : 'badge-warning'}`}>
            {connectedCount}/{teams.length} teams online
          </span>
          <span className={`badge ${game.status === 'LIVE' ? 'badge-live' : 'badge-warning'}`}>{game.status}</span>
          <button
            className="btn btn-outline btn-sm"
            onClick={() =>
              game.status === 'PAUSED' && game.pausedAt
                ? resumeGame(gameId!, game.pausedAt, profile.uid, profile.displayName)
                : pauseGame(gameId!, profile.uid, profile.displayName)
            }
          >
            {game.status === 'PAUSED' ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
          <div className="spread">
            <span className="badge badge-live">{error}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="live-grid">
        <aside className="stack live-queue">
          <div className="title-md">Questions</div>
          {gameQuestions.map((gq) => {
            const q = questionsById.get(gq.questionId);
            const isCurrent = gq.id === game.currentGameQuestionId;
            const isLiveNow = isCurrent && (liveQuestion?.status === 'ACTIVE' || !!claim);
            return (
              <div
                key={gq.id}
                className="card"
                style={{ padding: 12, borderColor: isCurrent ? 'var(--color-accent)' : undefined }}
              >
                <div className="muted" style={{ fontSize: '0.75rem' }}>
                  {q ? TYPE_LABEL[q.type] : 'Missing question'}
                </div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                  {q && 'text' in q ? q.text : q && 'title' in q ? q.title : '(round)'}
                </div>
                <div className="spread" style={{ marginTop: 6 }}>
                  <span className="badge badge-primary">{gq.status}</span>
                  <button
                    className="btn btn-sm btn-outline"
                    onClick={() => {
                      // Restarting a live question wipes its buzzer history.
                      // One stray click mid-round would erase who already tried.
                      if (isLiveNow && !confirm('Restart this question? All buzzes so far are cleared.')) return;
                      startGameQuestion(gq);
                    }}
                  >
                    {isCurrent ? 'Restart' : 'Start'}
                  </button>
                </div>
              </div>
            );
          })}
          {gameQuestions.length === 0 && <div className="empty-state">No questions added yet.</div>}
        </aside>

        <main className="stack">
          {live?.problemCase?.active ? (
            <ProblemCaseControl
              gameId={gameId}
              teams={teams}
              gameQuestions={gameQuestions}
              caseState={live.problemCase}
            />
          ) : currentQuestion && currentGq && liveQuestion ? (
            <QuestionControl
              gameId={gameId}
              gq={currentGq}
              question={currentQuestion}
              teams={teams}
              liveQuestion={liveQuestion}
              music={live?.music ?? null}
              musicTrack={musicTrack}
              buzzer={buzzer}
              actorUid={profile.uid}
              actorName={profile.displayName}
              onError={setError}
            />
          ) : (
            <div className="card empty-state">Start a question from the list on the left.</div>
          )}

          {nextWaiting && (
            <button className="btn btn-accent btn-lg" onClick={() => startGameQuestion(nextWaiting)}>
              Next question →
            </button>
          )}
        </main>

        <aside className="stack">
          <LiveScorePanel
            gameId={gameId}
            teams={teams}
            presence={presence}
            actorUid={profile.uid}
            actorName={profile.displayName}
          />
          <KaraokeControl
            gameId={gameId}
            teams={teams}
            musicTracks={musicTracks}
            karaoke={live?.karaoke ?? null}
            actorUid={profile.uid}
            actorName={profile.displayName}
          />
        </aside>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function QuestionControl({
  gameId,
  gq,
  question,
  teams,
  liveQuestion,
  music,
  musicTrack,
  buzzer,
  actorUid,
  actorName,
  onError,
}: {
  gameId: string;
  gq: GameQuestion;
  question: Question;
  teams: Team[];
  liveQuestion: LiveQuestionState | null;
  music: LiveMusicState | null;
  musicTrack: LiveMusicPrivate | null;
  buzzer: BuzzerWindow | undefined;
  actorUid: string;
  actorName: string;
  onError: (message: string) => void;
}) {
  const [busy, run] = useBusyAction();
  const claim = buzzer?.claim ?? null;
  const claimTeam = claim ? teams.find((t) => t.id === claim.teamId) : null;
  const attempts = buzzer?.attempts ?? {};
  const claimAttempt = claim ? attempts[claim.teamId] : null;
  const attemptedCount = Object.keys(attempts).length;
  const noTeamsRemain = teams.length > 0 && attemptedCount >= teams.length;
  const musicShouldPlay = question.type === 'MUSIC_GUESS' && !claim;
  const isResolved = liveQuestion?.status === 'COMPLETED' || liveQuestion?.status === 'TIME_EXPIRED';

  const guarded = (fn: () => Promise<unknown>) => () =>
    run(async () => {
      try {
        await fn();
      } catch (e) {
        onError(e instanceof Error ? e.message : 'That action failed. Nothing was changed.');
      }
    });

  return (
    <div className="card stack">
      <div className="spread">
        <span className="badge badge-primary">{TYPE_LABEL[question.type]}</span>
        <span className="badge badge-accent">{gq.pointsOverride ?? question.points} PTS</span>
      </div>
      <TimerDisplay
        endsAt={liveQuestion?.endsAt ?? null}
        freezeRemainingMs={freezeRemainingMsForClaim(liveQuestion?.endsAt, claim?.at)}
        size="lg"
      />

      {question.type === 'MUSIC_GUESS' && music ? (
        <NowPlayingCard
          music={music}
          track={musicTrack}
          shouldPlay={musicShouldPlay}
          audio="none"
          revealTrackInfo
        />
      ) : (
        <>
          {'text' in question && question.text && <p className="title-md">{question.text}</p>}
          {'title' in question && <p className="title-md">{question.title}</p>}
          {'correctAnswer' in question && (
            <p className="badge badge-success" style={{ display: 'inline-block' }}>
              Answer: {question.correctAnswer}
            </p>
          )}
          {'imageUrls' in question && (
            <div className="image-grid">
              {question.imageUrls.map((url) => (
                <img key={url} src={url} alt="" />
              ))}
            </div>
          )}
        </>
      )}

      <hr className="divider" />

      {isResolved ? (
        <div className="row">
          <span className={`badge ${liveQuestion?.status === 'COMPLETED' ? 'badge-success' : 'badge-warning'}`}>
            {liveQuestion?.status === 'COMPLETED' ? 'Answered correctly' : "Time expired"}
          </span>
          <span className="muted">Use "Next question" below to move on.</span>
        </div>
      ) : claim && claimTeam ? (
        <div className="surface">
          <div className="eyebrow">First buzz</div>
          <div className="title-md">{claimTeam.name}</div>
          {claimAttempt?.result === 'wrong' ? (
            <>
              <span className="badge badge-live">WRONG</span>
              <div className="row" style={{ marginTop: 10 }}>
                {!noTeamsRemain ? (
                  <button
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={guarded(() => gameService.reopenForNextAttempt(gameId, gq.id))}
                  >
                    {question.type === 'MUSIC_GUESS' ? 'Continue Music' : 'Next Buzzer'}
                  </button>
                ) : (
                  <span className="muted">Every team has had a turn.</span>
                )}
                <button
                  className="btn btn-outline"
                  disabled={busy}
                  onClick={guarded(() =>
                    gameService.endQuestion(gameId, gq.id, 'COMPLETED', actorUid, actorName)
                  )}
                >
                  End Question
                </button>
              </div>
            </>
          ) : (
            <div className="row" style={{ marginTop: 10 }}>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={guarded(() =>
                  gameService.markCorrect(gameId, gq, question, claimTeam, actorUid, actorName)
                )}
              >
                {busy ? 'Saving...' : '✓ Correct'}
              </button>
              <button
                className="btn btn-danger"
                disabled={busy}
                onClick={guarded(() => gameService.markWrong(gameId, gq, claimTeam, actorUid, actorName))}
              >
                ✕ Wrong
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="row">
          <span className="badge badge-warning">Waiting for a team to buzz...</span>
          <button
            className="btn btn-outline btn-sm"
            disabled={busy}
            onClick={guarded(() =>
              gameService.endQuestion(gameId, gq.id, 'TIME_EXPIRED', actorUid, actorName)
            )}
          >
            End Question
          </button>
        </div>
      )}

      <div>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Attempt history
        </div>
        {Object.values(attempts).length === 0 && <span className="muted">No attempts yet.</span>}
        {Object.values(attempts).map((a) => {
          const t = teams.find((team) => team.id === a.teamId);
          return (
            <div key={a.teamId} className="row" style={{ fontSize: '0.85rem' }}>
              <span
                className={`badge ${a.result === 'correct' ? 'badge-success' : a.result === 'wrong' ? 'badge-live' : 'badge-warning'}`}
              >
                {a.result}
              </span>
              <span>{t?.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LiveScorePanel({
  gameId,
  teams,
  presence,
  actorUid,
  actorName,
}: {
  gameId: string;
  teams: Team[];
  presence: Record<string, boolean>;
  actorUid: string;
  actorName: string;
}) {
  const [busy, run] = useBusyAction();
  const sorted = [...teams].sort((a, b) => b.score - a.score);

  // Correcting a mis-scored question used to mean leaving the live screen for
  // the Teams tab mid-round. Every adjustment still writes a score event, so
  // the history stays a complete record of what happened.
  function adjust(team: Team, amount: number) {
    run(() =>
      awardPoints({
        gameId,
        teamId: team.id,
        teamName: team.name,
        amount,
        reason: 'Manual correction',
        source: 'MANUAL_ADJUSTMENT',
        adminUid: actorUid,
        adminName: actorName,
      })
    );
  }

  return (
    <div className="card">
      <div className="title-md" style={{ marginBottom: 10 }}>
        Live Score
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {sorted.map((team, i) => (
          <div key={team.id} className="row" style={{ gap: 8 }}>
            <span className="score-rank" style={{ width: 18 }}>
              {i + 1}
            </span>
            <span
              title={presence[team.id] ? 'Online' : 'Offline'}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                flexShrink: 0,
                background: presence[team.id] ? 'var(--color-success)' : 'var(--color-border)',
              }}
            />
            <span style={{ flex: 1, fontWeight: 700, fontSize: '0.9rem', minWidth: 0 }}>{team.name}</span>
            <span style={{ fontWeight: 800 }}>{team.score}</span>
            <button className="icon-btn" disabled={busy} title="-1" onClick={() => adjust(team, -1)}>
              −
            </button>
            <button className="icon-btn" disabled={busy} title="+1" onClick={() => adjust(team, 1)}>
              +
            </button>
          </div>
        ))}
        {teams.length === 0 && <div className="empty-state">No teams.</div>}
      </div>
    </div>
  );
}

function ProblemCaseControl({
  gameId,
  teams,
  gameQuestions,
  caseState,
}: {
  gameId: string;
  teams: Team[];
  gameQuestions: GameQuestion[];
  caseState: NonNullable<LiveGameMeta['problemCase']>;
}) {
  const { profile } = useAuth();
  const [busy, run] = useBusyAction();
  const [customOrder, setCustomOrder] = useState<string[] | null>(null);
  const [points, setPoints] = useState<Record<string, number>>({});
  const [awarded, setAwarded] = useState<Record<string, number>>({});

  // Derive from the live team list rather than snapshotting it once at mount.
  // Previously an admin refresh during a case (teams still loading) latched in
  // an empty array, so "Begin Presentations" wrote an empty order.
  const order = useMemo(() => {
    const live = teams.map((t) => t.id);
    if (!customOrder) return live;
    const kept = customOrder.filter((id) => live.includes(id));
    const added = live.filter((id) => !kept.includes(id));
    return [...kept, ...added];
  }, [teams, customOrder]);

  function moveTeam(index: number, dir: -1 | 1) {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setCustomOrder(next);
  }

  function scoreTeam(teamId: string) {
    const team = teams.find((t) => t.id === teamId);
    if (!team || !profile) return;
    const amount = points[teamId] ?? 0;
    const gq = gameQuestions.find((g) => g.id === caseState.gameQuestionId);
    run(async () => {
      await gameService.scoreCase(
        gameId,
        caseState.gameQuestionId ?? '',
        caseState.title ?? 'Problem Case',
        gq?.questionId ?? null,
        team,
        amount,
        profile.uid,
        profile.displayName
      );
      setAwarded((prev) => ({ ...prev, [teamId]: (prev[teamId] ?? 0) + amount }));
    });
  }

  const presentingIndex = order.indexOf(caseState.currentPresentingTeamId ?? '');

  return (
    <div className="card stack">
      <span className="badge badge-primary">PROBLEM CASE</span>
      <div className="title-md">{caseState.title}</div>
      <p>{caseState.description}</p>

      {caseState.phase === 'prep' && (
        <>
          <TimerDisplay endsAt={caseState.endsAt} size="lg" />
          <div className="eyebrow">Presentation order</div>
          {order.map((id, i) => {
            const t = teams.find((team) => team.id === id);
            return (
              <div key={id} className="row surface">
                <span>{i + 1}.</span>
                <span style={{ flex: 1 }}>{t?.name}</span>
                <button className="icon-btn" onClick={() => moveTeam(i, -1)}>
                  ↑
                </button>
                <button className="icon-btn" onClick={() => moveTeam(i, 1)}>
                  ↓
                </button>
              </div>
            );
          })}
          <button
            className="btn btn-primary"
            disabled={busy || order.length === 0}
            onClick={() => run(() => gameService.setCasePresentationOrder(gameId, order))}
          >
            Begin Presentations
          </button>
        </>
      )}

      {caseState.phase === 'presenting' && (
        <>
          <div className="eyebrow">Now presenting</div>
          <div className="title-md">
            {teams.find((t) => t.id === caseState.currentPresentingTeamId)?.name ?? 'All done'}
          </div>
          <div className="stack">
            {order.map((id) => {
              const t = teams.find((team) => team.id === id);
              if (!t) return null;
              const already = awarded[t.id];
              return (
                <div
                  key={t.id}
                  className="row surface"
                  style={{
                    outline: caseState.currentPresentingTeamId === t.id ? '2px solid var(--color-accent)' : undefined,
                  }}
                >
                  <span style={{ flex: 1 }}>{t.name}</span>
                  {already !== undefined && <span className="badge badge-success">+{already}</span>}
                  <input
                    type="number"
                    style={{ width: 80 }}
                    value={points[t.id] ?? ''}
                    onChange={(e) => setPoints({ ...points, [t.id]: Number(e.target.value) })}
                    placeholder="pts"
                  />
                  <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => scoreTeam(t.id)}>
                    {already !== undefined ? 'Award again' : 'Award'}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="row">
            <button
              className="btn btn-outline"
              disabled={busy}
              onClick={() =>
                run(() => gameService.advancePresentation(gameId, order.slice(presentingIndex + 1)))
              }
            >
              Next Team
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                profile &&
                run(() =>
                  gameService.endProblemCase(
                    gameId,
                    caseState.gameQuestionId ?? null,
                    profile.uid,
                    profile.displayName
                  )
                )
              }
            >
              End Case
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function KaraokeControl({
  gameId,
  teams,
  musicTracks,
  karaoke,
  actorUid,
  actorName,
}: {
  gameId: string;
  teams: Team[];
  musicTracks: MusicTrack[];
  karaoke: LiveGameMeta['karaoke'] | null | undefined;
  actorUid: string;
  actorName: string;
}) {
  const [busy, run] = useBusyAction();
  const [teamId, setTeamId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [startSeconds, setStartSeconds] = useState(0);
  const [durationSeconds, setDurationSeconds] = useState(30);
  const [bonusPoints, setBonusPoints] = useState(2);

  return (
    <div className="card stack">
      <div className="title-md">Karaoke Bonus</div>
      {karaoke?.active ? (
        <>
          <div className="surface">
            <div className="eyebrow">Now performing</div>
            <div className="title-md">{karaoke.targetTeamName}</div>
            <div className="muted">
              {karaoke.title} - {karaoke.artist}
            </div>
            {karaoke.playbackStartedAt && (
              <TimerDisplay endsAt={karaoke.playbackStartedAt + karaoke.durationSeconds * 1000} />
            )}
          </div>
          <div className="row-wrap">
            {[0, 1, 2, 3].map((n) => (
              <button
                key={n}
                className={`btn btn-sm ${bonusPoints === n ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setBonusPoints(n)}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              style={{ width: 70 }}
              value={bonusPoints}
              onChange={(e) => setBonusPoints(Number(e.target.value))}
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => {
              const team = teams.find((t) => t.id === karaoke.targetTeamId);
              if (team) run(() => gameService.scoreKaraoke(gameId, team, bonusPoints, actorUid, actorName));
            }}
          >
            Award &amp; finish
          </button>
        </>
      ) : (
        <>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Select team...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select value={trackId} onChange={(e) => setTrackId(e.target.value)}>
            <option value="">Select track...</option>
            {musicTracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} - {t.artist}
              </option>
            ))}
          </select>
          <div className="row">
            <input
              type="number"
              style={{ width: 80 }}
              value={startSeconds}
              onChange={(e) => setStartSeconds(Number(e.target.value))}
              placeholder="start (s)"
            />
            <input
              type="number"
              style={{ width: 80 }}
              value={durationSeconds}
              onChange={(e) => setDurationSeconds(Number(e.target.value))}
              placeholder="duration (s)"
            />
          </div>
          <button
            className="btn btn-primary btn-sm"
            disabled={busy || !teamId || !trackId}
            onClick={() => {
              const team = teams.find((t) => t.id === teamId);
              const track = musicTracks.find((t) => t.id === trackId);
              if (team && track)
                run(() =>
                  gameService.startKaraoke(
                    gameId,
                    team,
                    track,
                    startSeconds,
                    durationSeconds,
                    actorUid,
                    actorName
                  )
                );
            }}
          >
            Start Karaoke
          </button>
        </>
      )}
    </div>
  );
}
