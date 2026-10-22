/**
 * ProtectedRoute — gates authenticated routes.
 * Shows a loading state while the session is restored, then either renders the
 * app or redirects to /login remembering where the user was headed.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Cloud } from 'lucide-react';

export default function ProtectedRoute() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.9rem',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
        }}
        role="status"
        aria-live="polite"
      >
        <span className="brand-mark" aria-hidden="true">
          <Cloud size={20} />
        </span>
        <span className="spinner-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span style={{ fontSize: '0.9rem' }}>Restoring your session…</span>
      </div>
    );
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <Outlet />;
}
