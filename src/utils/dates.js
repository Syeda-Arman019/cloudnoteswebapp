/**
 * Date formatting helpers. All inputs are ISO date strings from the API/demo store.
 */

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Oct 21, 2026" */
export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Oct 21, 2026, 2:14 PM" */
export function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return '—';
  return `${formatDate(date)}, ${date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

/** "Tuesday, October 21, 2026" */
export function formatLongDate(value) {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "just now", "12 min ago", "3 hours ago", "yesterday", "Oct 3, 2026" */
export function formatRelative(value) {
  const date = toDate(value);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 45) return 'just now';
  if (diffSec < 3600) {
    const mins = Math.round(diffSec / 60);
    return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  }
  if (diffSec < 86400) {
    const hours = Math.round(diffSec / 3600);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  if (diffSec < 172800) return 'yesterday';
  if (diffSec < 604800) {
    const days = Math.round(diffSec / 86400);
    return `${days} days ago`;
  }
  return formatDate(date);
}

/** Greeting matched to the time of day. */
export function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Initials for avatar chips — "Alex Morgan" => "AM". */
export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
