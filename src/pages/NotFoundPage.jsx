/**
 * NotFoundPage — custom 404 with helpful routes back into the app.
 */

import { ArrowLeft, Home } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks';
import Button from '@/components/common/Button';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  const { isAuthenticated } = useAuth();

  return (
    <div className="not-found-page">
      <div className="not-found-inner">
        <div className="not-found-code" aria-hidden="true">
          404
        </div>
        <h1>This page drifted off the map</h1>
        <p>
          The page you are looking for doesn't exist, may have been moved, or the link is
          outdated. Your notes are still exactly where you left them.
        </p>
        <div className="not-found-actions">
          <Button to="/" icon={<Home size={16} />}>
            Back to home
          </Button>
          {isAuthenticated && (
            <Button to="/dashboard" variant="secondary" icon={<ArrowLeft size={15} />}>
              Go to dashboard
            </Button>
          )}
        </div>
        <div style={{ marginTop: '1.6rem' }}>
          <Link to="/notes">Browse your notes</Link>
        </div>
        <div style={{ marginTop: '1.2rem', display: 'flex', justifyContent: 'center' }}>
          <ThemeToggle withLabel />
        </div>
      </div>
    </div>
  );
}
