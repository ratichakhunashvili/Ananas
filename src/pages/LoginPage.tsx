import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';
import { login } from '../services/userService';

export default function LoginPage() {
  const { user, profile, loading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user && profile) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="full-center">
      <div className="card" style={{ width: 360, maxWidth: '90vw' }}>
        <div className="stack" style={{ alignItems: 'center', marginBottom: 20 }}>
          <Logo height={104} />
          <p className="muted" style={{ textAlign: 'center' }}>
            Sign in to join the competition.
          </p>
        </div>
        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Username or admin email</label>
            <input
              id="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. rati or admin@yourschool.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <div className="badge badge-live" style={{ justifyContent: 'center' }}>
              {error}
            </div>
          )}
          <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={submitting}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
