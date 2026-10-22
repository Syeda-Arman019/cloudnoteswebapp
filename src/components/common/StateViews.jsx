/**
 * Shared loading / error / empty state views so every screen communicates
 * status the same way.
 */

import { Inbox, RotateCw, TriangleAlert } from 'lucide-react';
import Button from './Button';

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="loading-block" role="status" aria-live="polite">
      <span className="spinner-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = null, title, description, action = null }) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon" aria-hidden="true">
        {icon || <Inbox size={28} />}
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry = null }) {
  return (
    <div className="empty-state" role="alert">
      <span
        className="empty-state-icon"
        aria-hidden="true"
        style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}
      >
        <TriangleAlert size={28} />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {onRetry && (
        <Button variant="secondary" icon={<RotateCw size={15} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
