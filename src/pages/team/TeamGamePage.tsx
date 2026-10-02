import { useEffect, useMemo, useState } from 'react';
import { Logo } from '../../components/Logo';
import { TimerDisplay } from '../../components/TimerDisplay';
import { NowPlayingCard } from '../../components/NowPlayingCard';
import { Scoreboard } from '../../components/Scoreboard';
import { freezeRemainingMsForClaim } from '../../hooks/useCountdown';
import { useAuth } from '../../contexts/AuthContext';
import { useGame, useIsConnected, useLiveGame, useTeams } from '../../hooks/dataHooks';
import { pressBuzzer } from '../../services/buzzerService';
import { registerPresence } from '../../services/presenceService';
import { logout } from '../../services/userService';

export default function TeamGamePage() {
  const { profile } = useAuth();
  const game = useGame(profile?.gameId);
  const teams = useTeams(profile?.gameId);
  const live = useLiveGame(profile?.gameId);
  const connected = useIsConnected();
  const [buzzing, setBuzzing] = useState(false);
  const [buzzMessage, setBuzzMessage] = useState<string | null>(null);

  const myTeam = useMemo(() => teams.find((t) => t.id === profile?.teamId) ?? null, [teams, profile]);

  const currentQuestion = live?.currentQuestion ?? null;
  const buzzerWindow = currentQuestion ? live?.buzzer?.[currentQuestion.gameQuestionId] : null;
  const claim = buzzerWindow?.claim ?? null;
  const myAttempt = myTeam ? buzzerWindow?.attempts?.[myTeam.id] : undefined;

  const karaoke = live?.karaoke?.active && live.karaoke.targetTeamId === myTeam?.id ? live.karaoke : null;
  const musicShouldPlay = Boolean(live?.music?.active) && !claim;
  const freezeRemainingMs = freezeRemainingMsForClaim(currentQuestion?.endsAt, claim?.at);

  // Tell Admin this team has a device on the line, and take it down
  // automatically when the phone sleeps or the tab closes.
  const gameId = profile?.gameId ?? null;
  const uid = profile?.uid ?? null;
  const teamId = myTeam?.id ?? null;
  useEffect(() => {
    if (!gameId || !uid || !teamId) return;
    return registerPresence(gameId, uid, teamId);
  }, [gameId, uid, teamId]);

  async function handleBuzz() {
    if (!profile || !myTeam || !currentQuestion) return;
    setBuzzing(true);
    setBuzzMessage(null);
    try {
      const outcome = await pressBuzzer(
        profile.gameId!,
        currentQuestion.gameQuestionId,
        profile.uid,
        myTeam.id,
        myTeam.name
      );
      // A noisy room swallows visual-only feedback; a buzz you can feel is
      // the difference between "did that register?" and knowing.
      if (outcome.status === 'WON') navigator.vibrate?.([40, 30, 90]);
      else navigator.vibrate?.(25);

      if (outcome.status === 'TOO_LATE') setBuzzMessage('Too late - another team buzzed first!');
      if (outcome.status === 'CLOSED') setBuzzMessage('Buzzer is closed.');
    } finally {
      setBuzzing(false);
    }
  }

  if (!profile) return null;

  if (!profile.gameId || !myTeam) {
    return (
      <div className="participant-shell">
        <Logo height={72} />
        <div className="card empty-state">
          You haven't been assigned to a homework yet.
          <br />
          Ask your Admin to add your team.
        </div>
        <button className="btn btn-ghost" onClick={() => logout()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="participant-shell">
      <div className="spread" style={{ width: '100%' }}>
        <Logo height={52} />
        <button className="btn btn-ghost btn-sm" onClick={() => logout()}>
          Sign out
        </button>
      </div>

      {!connected && (
        <div className="card" style={{ width: '100%', textAlign: 'center', borderColor: 'var(--color-danger)' }}>
          <span className="badge badge-live">OFFLINE</span>
          <p className="muted">
            Lost connection - your buzzer won't work until this reconnects. Check your wifi.
          </p>
        </div>
      )}

      <div className="card" style={{ width: '100%', textAlign: 'center' }}>
        <div className="eyebrow">{myTeam.name}</div>
        <div className="title-lg">{myTeam.score} pts</div>
      </div>

      {!game || game.status === 'DRAFT' || game.status === 'LOBBY' ? (
        <div className="card empty-state" style={{ width: '100%' }}>
          Waiting for the homework to start...
        </div>
      ) : game.status === 'PAUSED' ? (
        <div className="card empty-state" style={{ width: '100%' }}>
          <span className="badge badge-warning">PAUSED</span>
          <p>Hang tight, Admin will resume shortly.</p>
        </div>
      ) : game.status === 'FINISHED' ? (
        <div className="stack" style={{ width: '100%' }}>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="title-md">Homework complete!</div>
            <p className="muted">Thanks for playing.</p>
          </div>
          <Scoreboard teams={teams} highlightTeamId={myTeam.id} />
        </div>
      ) : karaoke ? (
        <div className="card" style={{ width: '100%', textAlign: 'center' }}>
          <div className="badge badge-success">KARAOKE BONUS</div>
          <div className="title-lg">Your turn to sing!</div>
          <div style={{ fontSize: '2.4rem' }}>🎤</div>
          <p className="muted">
            {karaoke.title} - {karaoke.artist}
          </p>
        </div>
      ) : live?.problemCase?.active ? (
        <ProblemCaseView
          title={live.problemCase.title}
          description={live.problemCase.description}
          phase={live.problemCase.phase}
          endsAt={live.problemCase.endsAt}
          presenting={live.problemCase.currentPresentingTeamId === myTeam.id}
          fileUrls={live.problemCase.fileUrls}
        />
      ) : currentQuestion ? (
        <div className="stack" style={{ width: '100%' }}>
          <div className="card" style={{ width: '100%' }}>
            <div className="spread">
              <span className="badge badge-primary">{currentQuestion.categoryName ?? 'Question'}</span>
              <span className="badge badge-accent">{currentQuestion.points} pts</span>
            </div>
            <TimerDisplay endsAt={currentQuestion.endsAt} freezeRemainingMs={freezeRemainingMs} />

            {currentQuestion.type === 'MUSIC_GUESS' && live?.music ? (
              <NowPlayingCard music={live.music} shouldPlay={musicShouldPlay} audio="none" />
            ) : (
              <>
                {currentQuestion.text && <p className="title-md">{currentQuestion.text}</p>}
                {currentQuestion.imageUrl && <img src={currentQuestion.imageUrl} alt="" />}
                {currentQuestion.imageUrls && (
                  <div className="image-grid">
                    {currentQuestion.imageUrls.map((url) => (
                      <img key={url} src={url} alt="" />
                    ))}
                  </div>
                )}
                {currentQuestion.answerLength !== null && (
                  <p className="muted">The answer has {currentQuestion.answerLength} letters.</p>
                )}
                {currentQuestion.choices && (
                  <ul>
                    {currentQuestion.choices.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <BuzzerArea
            status={currentQuestion.status}
            claimTeamId={claim?.teamId ?? null}
            myTeamId={myTeam.id}
            myAttemptResult={myAttempt?.result ?? null}
            disabled={buzzing}
            onBuzz={handleBuzz}
            message={buzzMessage}
          />
        </div>
      ) : (
        <div className="card empty-state" style={{ width: '100%' }}>
          Get ready - the next challenge is coming up.
        </div>
      )}
    </div>
  );
}

function BuzzerArea({
  status,
  claimTeamId,
  myTeamId,
  myAttemptResult,
  disabled,
  onBuzz,
  message,
}: {
  status: string;
  claimTeamId: string | null;
  myTeamId: string;
  myAttemptResult: 'pending' | 'correct' | 'wrong' | null;
  disabled: boolean;
  onBuzz: () => void;
  message: string | null;
}) {
  if (myAttemptResult === 'wrong' && claimTeamId !== myTeamId) {
    return (
      <div className="card empty-state">
        <span className="badge badge-live">WRONG ANSWER</span>
        <p>Wait for the next question.</p>
      </div>
    );
  }

  if (claimTeamId === myTeamId) {
    return (
      <div className="card" style={{ textAlign: 'center' }}>
        <span className="badge badge-success">YOUR TEAM IS ANSWERING</span>
        <p className="muted">Tell Admin your answer out loud!</p>
      </div>
    );
  }

  if (claimTeamId) {
    return (
      <div className="card empty-state">
        <span className="badge badge-warning">BUZZER CLOSED</span>
        <p>Another team buzzed in first.</p>
      </div>
    );
  }

  if (status === 'COMPLETED' || status === 'TIME_EXPIRED') {
    return (
      <div className="card empty-state">
        <p>Question complete. Get ready for the next one!</p>
      </div>
    );
  }

  if (status !== 'ACTIVE') {
    return null;
  }

  return (
    <div className="stack" style={{ alignItems: 'center' }}>
      <button className="buzzer-btn" disabled={disabled} onClick={onBuzz}>
        Buzz!
      </button>
      {message && <p className="muted">{message}</p>}
    </div>
  );
}

function ProblemCaseView({
  title,
  description,
  phase,
  endsAt,
  presenting,
  fileUrls,
}: {
  title: string | null;
  description: string | null;
  phase: string;
  endsAt: number | null;
  presenting: boolean;
  fileUrls: string[] | null;
}) {
  return (
    <div className="stack" style={{ width: '100%' }}>
      <div className="card">
        <span className="badge badge-primary">PROBLEM CASE</span>
        <div className="title-md">{title}</div>
        {phase === 'prep' && <TimerDisplay endsAt={endsAt} size="lg" />}
        <p>{description}</p>
        {fileUrls && fileUrls.length > 0 && (
          <div className="image-grid">
            {fileUrls.map((url) => (
              <img key={url} src={url} alt="" />
            ))}
          </div>
        )}
      </div>
      {phase === 'presenting' && (
        <div className="card empty-state">
          {presenting ? (
            <span className="badge badge-success">YOUR TEAM IS PRESENTING</span>
          ) : (
            <p>Another team is presenting their solution.</p>
          )}
        </div>
      )}
      {phase === 'done' && <div className="card empty-state">Presentations complete.</div>}
    </div>
  );
}
