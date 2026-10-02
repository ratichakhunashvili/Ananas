import { useState } from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { usePresence, useTeams } from '../../../hooks/dataHooks';
import { createTeamWithLogin, deleteTeam, updateTeam } from '../../../services/teamService';
import { awardPoints } from '../../../services/scoreService';
import { useBusyAction } from '../../../hooks/useBusyAction';

/** Ambiguity-free alphabet: no O/0, l/1/I - these get read aloud and typed on phones. */
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(length = 6): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]).join('');
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20);
}

interface IssuedCredential {
  teamName: string;
  username: string;
  password: string;
}

export function TeamsTab({ gameId }: { gameId: string }) {
  const { profile } = useAuth();
  const teams = useTeams(gameId);
  const presence = usePresence(gameId);

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Firebase never gives a password back, so the only chance to record it is
  // the moment it's set. Keeping the issued list on screen (until the teacher
  // dismisses it) is what makes handing out logins to a room actually workable.
  const [issued, setIssued] = useState<IssuedCredential[]>([]);
  const [copied, setCopied] = useState(false);

  const [busy, run] = useBusyAction();
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');

  const effectiveUsername = username.trim() || slugify(name);

  async function handleCreate() {
    if (!name.trim() || !profile) return;
    if (!effectiveUsername) {
      setError('Give the team a name with at least one letter or number, or set a username.');
      return;
    }
    if (password.trim().length < 6) {
      setError('Firebase requires passwords of at least 6 characters.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await createTeamWithLogin({
        gameId,
        name: name.trim(),
        username: effectiveUsername,
        password: password.trim(),
        actorUid: profile.uid,
        actorName: profile.displayName,
      });
      setIssued((prev) => [
        ...prev,
        { teamName: name.trim(), username: effectiveUsername, password: password.trim() },
      ]);
      setName('');
      setUsername('');
      setPassword(generatePassword());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create team.');
    } finally {
      setCreating(false);
    }
  }

  async function copyAll() {
    const text = issued
      .map((c) => `${c.teamName}\n  username: ${c.username}\n  password: ${c.password}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy - select the text and copy it manually.');
    }
  }

  function handleAdjust(teamId: string, teamName: string) {
    if (!profile) return;
    run(async () => {
      await awardPoints({
        gameId,
        teamId,
        teamName,
        amount: adjustAmount,
        reason: adjustReason || 'Manual adjustment',
        source: 'MANUAL_ADJUSTMENT',
        adminUid: profile.uid,
        adminName: profile.displayName,
      });
      setAdjustingId(null);
      setAdjustReason('');
      setAdjustAmount(1);
    });
  }

  return (
    <div className="stack">
      <div className="card">
        <div className="title-md" style={{ marginBottom: 10 }}>
          Add a team
        </div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Each team gets one shared login. Give the username and password to the whole team - anyone
          on it can sign in from their own phone.
        </p>
        <div className="grid grid-3">
          <div className="field">
            <label>Team name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Team Atlas"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="field">
            <label>Username {!username.trim() && effectiveUsername && `(auto: ${effectiveUsername})`}</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={effectiveUsername || 'atlas'}
            />
          </div>
          <div className="field">
            <label>Password</label>
            <div className="row">
              <input value={password} onChange={(e) => setPassword(e.target.value)} />
              <button className="btn btn-sm btn-outline" type="button" onClick={() => setPassword(generatePassword())}>
                New
              </button>
            </div>
          </div>
        </div>
        {error && (
          <p className="badge badge-live" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 10 }}
          onClick={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating ? 'Creating...' : 'Add team'}
        </button>
      </div>

      {issued.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--color-accent)' }}>
          <div className="spread" style={{ marginBottom: 8 }}>
            <div className="title-md">Logins created this session</div>
            <div className="row">
              <button className="btn btn-sm btn-accent" onClick={copyAll}>
                {copied ? 'Copied!' : 'Copy all'}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setIssued([])}>
                Dismiss
              </button>
            </div>
          </div>
          <p className="muted" style={{ marginBottom: 10 }}>
            Write these down or copy them now - passwords cannot be shown again after you leave this page.
          </p>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Username</th>
                <th>Password</th>
              </tr>
            </thead>
            <tbody>
              {issued.map((c) => (
                <tr key={c.username}>
                  <td>{c.teamName}</td>
                  <td style={{ fontFamily: 'monospace' }}>{c.username}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-2">
        {teams.map((team) => (
          <div key={team.id} className="card">
            <div className="spread">
              <div className="row">
                <span
                  title={presence[team.id] ? 'Online now' : 'Not connected'}
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: presence[team.id] ? 'var(--color-success)' : 'var(--color-border)',
                  }}
                />
                <div className="title-md">{team.name}</div>
              </div>
              <div className="title-md">{team.score} pts</div>
            </div>
            <div className="muted">Login: {team.username}</div>

            {adjustingId === team.id ? (
              <div className="stack" style={{ marginTop: 10 }}>
                <div className="row">
                  <input
                    type="number"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(Number(e.target.value))}
                    style={{ width: 90 }}
                  />
                  <input placeholder="Reason" value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} />
                </div>
                <div className="row">
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={busy}
                    onClick={() => handleAdjust(team.id, team.name)}
                  >
                    Apply
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setAdjustingId(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn btn-sm btn-outline" onClick={() => setAdjustingId(team.id)}>
                  Adjust score
                </button>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => {
                    const n = prompt('Rename team', team.name);
                    if (n && profile) updateTeam(gameId, team.id, { name: n }, profile.uid, profile.displayName);
                  }}
                >
                  Rename
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={() =>
                    profile &&
                    confirm(`Delete "${team.name}"? Their login stops working immediately.`) &&
                    deleteTeam(gameId, team.id, profile.uid, profile.displayName)
                  }
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {teams.length === 0 && <div className="empty-state">No teams yet. Add your first team above.</div>}
      </div>
    </div>
  );
}
