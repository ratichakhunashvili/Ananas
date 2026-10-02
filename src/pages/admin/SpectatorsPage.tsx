import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSpectators } from '../../hooks/dataHooks';
import { createSpectator, disableSpectator } from '../../services/userService';

export default function SpectatorsPage() {
  const { profile } = useAuth();
  const spectators = useSpectators();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!profile || !username.trim() || !password.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createSpectator({
        username,
        password,
        displayName: displayName || username,
        actorUid: profile.uid,
      });
      setUsername('');
      setPassword('');
      setDisplayName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create spectator.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="stack">
      <h1 className="title-lg">Spectators</h1>
      <p className="muted">
        Read-only logins for the projector / big-screen view. A spectator automatically follows
        whichever homework is currently live.
      </p>

      <div className="card">
        <div className="grid grid-3">
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>Display name</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={username} />
          </div>
        </div>
        {error && <p className="muted">{error}</p>}
        <button
          className="btn btn-primary"
          style={{ marginTop: 10 }}
          onClick={handleCreate}
          disabled={creating || !username.trim() || !password.trim()}
        >
          Create spectator
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {spectators.map((s) => (
              <tr key={s.uid}>
                <td>{s.displayName}</td>
                <td>{s.username}</td>
                <td>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => confirm(`Remove ${s.displayName}?`) && disableSpectator(s.uid, s.username)}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {spectators.length === 0 && (
              <tr>
                <td colSpan={3} className="empty-state">
                  No spectator accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
