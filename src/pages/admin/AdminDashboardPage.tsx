import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useGames } from '../../hooks/dataHooks';
import { createGame, deleteGame } from '../../services/gameService';
import type { GameStatus } from '../../types';

const STATUS_BADGE: Record<GameStatus, string> = {
  DRAFT: 'badge-warning',
  LOBBY: 'badge-warning',
  LIVE: 'badge-live',
  PAUSED: 'badge-warning',
  FINISHED: 'badge-primary',
};

export default function AdminDashboardPage() {
  const { profile } = useAuth();
  const games = useGames();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name.trim() || !profile) return;
    setCreating(true);
    try {
      const id = await createGame(name.trim(), profile.uid, profile.displayName);
      setName('');
      navigate(`/admin/games/${id}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <div className="spread">
        <h1 className="title-lg">Homework</h1>
      </div>

      <div className="card">
        <div className="title-md" style={{ marginBottom: 12 }}>
          Create new homework
        </div>
        <div className="row-wrap">
          <input
            placeholder="Homework name, e.g. Chapter 4 Review"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <button className="btn btn-primary" disabled={!name.trim() || creating} onClick={handleCreate}>
            Create homework
          </button>
        </div>
      </div>

      <div className="grid grid-3">
        {games.map((game) => (
          <div
            key={game.id}
            className="card"
            style={{ textAlign: 'left', cursor: 'pointer' }}
            onClick={() => navigate(`/admin/games/${game.id}`)}
          >
            <div className="spread">
              <span className={`badge ${STATUS_BADGE[game.status]}`}>{game.status}</span>
              {game.status === 'DRAFT' && (
                <button
                  className="icon-btn"
                  title="Delete homework"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete draft homework "${game.name}"? This cannot be undone.`)) {
                      deleteGame(game.id);
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="title-md" style={{ marginTop: 10 }}>
              {game.name}
            </div>
            <div className="muted">{new Date(game.createdAt).toLocaleString()}</div>
          </div>
        ))}
        {games.length === 0 && <div className="empty-state">No homework yet. Create your first one above.</div>}
      </div>
    </div>
  );
}
