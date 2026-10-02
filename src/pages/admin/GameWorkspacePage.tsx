import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGame, useGameQuestions, usePresence, useTeams } from '../../hooks/dataHooks';
import { endGame, pauseGame, resetRosterIndexForGame, resumeGame, startGame, updateGameName } from '../../services/gameService';
import { TeamsTab } from './tabs/TeamsTab';
import { QuestionsTab } from './tabs/QuestionsTab';
import { ScoreHistoryTab } from './tabs/ScoreHistoryTab';
import { AuditLogTab } from './tabs/AuditLogTab';

type Tab = 'teams' | 'questions' | 'scores' | 'audit';

export default function GameWorkspacePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const game = useGame(gameId);
  const teams = useTeams(gameId);
  const gameQuestions = useGameQuestions(gameId);
  const presence = usePresence(gameId);
  const [tab, setTab] = useState<Tab>('teams');
  const [busy, setBusy] = useState(false);

  if (!gameId || !game || !profile) return <div className="empty-state">Loading...</div>;

  const canStart = teams.length > 0 && gameQuestions.length > 0;
  const onlineTeams = teams.filter((t) => presence[t.id]);
  const offlineTeams = teams.filter((t) => !presence[t.id]);

  async function handleStart() {
    if (!profile) return;
    setBusy(true);
    try {
      await resetRosterIndexForGame(gameId!);
      await startGame(gameId!, profile.uid, profile.displayName);
      navigate(`/admin/games/${gameId}/live`);
    } finally {
      setBusy(false);
    }
  }

  async function handlePauseResume() {
    if (!profile || !game) return;
    setBusy(true);
    try {
      if (game.status === 'PAUSED' && game.pausedAt) {
        await resumeGame(gameId!, game.pausedAt, profile.uid, profile.displayName);
      } else {
        await pauseGame(gameId!, profile.uid, profile.displayName);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleEnd() {
    if (!profile || !confirm('End this homework? Final scores will be locked in.')) return;
    setBusy(true);
    try {
      await endGame(gameId!, profile.uid, profile.displayName);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <div className="eyebrow">Homework</div>
          <h1
            className="title-lg"
            onDoubleClick={() => {
              const n = prompt('Rename homework', game.name);
              if (n) updateGameName(gameId!, n);
            }}
          >
            {game.name}
          </h1>
        </div>
        <div className="row">
          <span className={`badge ${game.status === 'LIVE' ? 'badge-live' : 'badge-warning'}`}>{game.status}</span>
          {(game.status === 'DRAFT' || game.status === 'LOBBY') && (
            <button className="btn btn-primary" onClick={handleStart} disabled={!canStart || busy}>
              Run homework
            </button>
          )}
          {(game.status === 'LIVE' || game.status === 'PAUSED') && (
            <>
              <button className="btn btn-accent" onClick={() => navigate(`/admin/games/${gameId}/live`)}>
                Live control
              </button>
              <button className="btn btn-outline" onClick={handlePauseResume} disabled={busy}>
                {game.status === 'PAUSED' ? 'Resume' : 'Pause'}
              </button>
              <button className="btn btn-danger" onClick={handleEnd} disabled={busy}>
                End homework
              </button>
            </>
          )}
        </div>
      </div>

      {!canStart && (game.status === 'DRAFT' || game.status === 'LOBBY') && (
        <div className="badge badge-warning">Add at least one team and one question before running.</div>
      )}

      {teams.length > 0 && game.status !== 'FINISHED' && (
        <div className="card">
          <div className="spread" style={{ marginBottom: 8 }}>
            <div className="title-md">Who's ready</div>
            <span className={`badge ${offlineTeams.length === 0 ? 'badge-success' : 'badge-warning'}`}>
              {onlineTeams.length} of {teams.length} teams signed in
            </span>
          </div>
          <div className="row-wrap">
            {teams.map((t) => (
              <span key={t.id} className={`badge ${presence[t.id] ? 'badge-success' : 'badge'}`}>
                {presence[t.id] ? '●' : '○'} {t.name}
              </span>
            ))}
          </div>
          {offlineTeams.length > 0 && (
            <p className="muted" style={{ marginTop: 8 }}>
              Not signed in yet: {offlineTeams.map((t) => t.name).join(', ')}. They can still join after you start.
            </p>
          )}
        </div>
      )}

      <div className="row-wrap">
        {(
          [
            ['teams', 'Teams'],
            ['questions', 'Questions'],
            ['scores', 'Score History'],
            ['audit', 'Audit Log'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            className={`btn btn-sm ${tab === value ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'teams' && <TeamsTab gameId={gameId} />}
      {tab === 'questions' && <QuestionsTab gameId={gameId} />}
      {tab === 'scores' && <ScoreHistoryTab gameId={gameId} />}
      {tab === 'audit' && <AuditLogTab gameId={gameId} />}
    </div>
  );
}
