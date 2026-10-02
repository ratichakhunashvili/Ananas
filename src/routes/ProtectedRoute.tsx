import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Role } from '../types';
import { Logo } from '../components/Logo';

export function ProtectedRoute({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="full-center">
        <Logo height={88} />
      </div>
    );
  }

  if (!user || !profile) {
    return <Navigate to="/login" replace />;
  }

  if (!allow.includes(profile.role)) {
    return <Navigate to={`/${profile.role}`} replace />;
  }

  return <>{children}</>;
}
