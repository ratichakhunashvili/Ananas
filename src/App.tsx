import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { Logo } from './components/Logo';

import LoginPage from './pages/LoginPage';
import TeamGamePage from './pages/team/TeamGamePage';

// The team view is what 20-50 phones on classroom wifi actually load, so the
// admin console and spectator screen - which those phones never open - are
// split out instead of being shipped in the same bundle.
const SpectatorPage = lazy(() => import('./pages/spectator/SpectatorPage'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage'));
const GameWorkspacePage = lazy(() => import('./pages/admin/GameWorkspacePage'));
const LiveControlPage = lazy(() => import('./pages/admin/LiveControlPage'));
const QuestionBankPage = lazy(() => import('./pages/admin/QuestionBankPage'));
const MusicLibraryPage = lazy(() => import('./pages/admin/MusicLibraryPage'));
const SpectatorsPage = lazy(() => import('./pages/admin/SpectatorsPage'));

function Loading() {
  return (
    <div className="full-center">
      <Logo height={88} />
    </div>
  );
}

function RootRedirect() {
  const { user, profile, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user || !profile) return <Navigate to="/login" replace />;
  return <Navigate to={`/${profile.role}`} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />

        <Route
          path="/team"
          element={
            <ProtectedRoute allow={['team']}>
              <TeamGamePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/spectator"
          element={
            <ProtectedRoute allow={['spectator']}>
              <SpectatorPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allow={['admin']}>
              <AdminLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="questions" element={<QuestionBankPage />} />
          <Route path="music" element={<MusicLibraryPage />} />
          <Route path="spectators" element={<SpectatorsPage />} />
          <Route path="games/:gameId" element={<GameWorkspacePage />} />
          <Route path="games/:gameId/live" element={<LiveControlPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
