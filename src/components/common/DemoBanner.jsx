/**
 * DemoBanner — clearly marks the app as running on local demo data.
 * Shown only when no backend API is configured (VITE_API_URL is empty).
 */

import { Sparkles } from 'lucide-react';

export default function DemoBanner({ compact = false }) {
  return (
    <span
      className="demo-banner"
      title="The backend API is not connected yet. All data lives in your browser."
    >
      <Sparkles size={12} aria-hidden="true" />
      {compact ? 'Demo mode' : 'Demo mode — backend not connected'}
    </span>
  );
}
