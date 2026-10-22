/**
 * DashboardPage — personalized productivity overview.
 *
 * Every statistic is computed from the notes actually loaded through the data
 * store (real API data in Part 2, isolated demo data meanwhile) — nothing is
 * hard-coded.
 */

import {
  FolderOpen,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  StickyNote,
  Timer,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNotesStore } from '@/context/NotesContext';
import { useDocumentTitle } from '@/hooks';
import { formatLongDate, getTimeBasedGreeting } from '@/utils/dates';
import Button from '@/components/common/Button';
import StatCard from '@/components/dashboard/StatCard';
import RecentNotes from '@/components/dashboard/RecentNotes';
import CategoryShortcuts from '@/components/dashboard/CategoryShortcuts';
import { LoadingState, ErrorState, EmptyState } from '@/components/common/StateViews';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { notes, categories, stats, recentNotes, notesByCategory, getCategory, isLoading, error, reload } =
    useNotesStore();

  const updatedThisWeek = notes.filter(
    (note) => Date.now() - new Date(note.updatedAt).getTime() < WEEK_MS
  ).length;

  const firstName = (user?.fullName || 'there').split(' ')[0];

  const handleSearch = (event) => {
    event.preventDefault();
    const query = event.currentTarget.elements.dashboardSearch.value.trim();
    navigate(query ? `/notes?q=${encodeURIComponent(query)}` : '/notes');
  };

  if (isLoading && !notes.length) {
    return (
      <div className="page-container">
        <LoadingState label="Loading your dashboard…" />
      </div>
    );
  }

  if (error && !notes.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load your dashboard" message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <section className="welcome-banner">
        <div>
          <h1>
            {getTimeBasedGreeting()}, {firstName}
          </h1>
          <p>
            {formatLongDate(new Date().toISOString())} — here's the state of your notes.
          </p>
        </div>
        <div className="welcome-actions">
          <form onSubmit={handleSearch} className="search-field" style={{ minWidth: 220 }}>
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              name="dashboardSearch"
              className="form-control-cn"
              placeholder="Search notes…"
              aria-label="Search notes"
            />
          </form>
          <Button to="/notes/new" icon={<Plus size={16} />}>
            Quick add note
          </Button>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard icon={StickyNote} value={stats.total} label="Total notes" />
        <StatCard icon={Pin} value={stats.pinned} label="Pinned notes" tone="cyan" />
        <StatCard icon={FolderOpen} value={stats.categories} label="Categories" tone="violet" />
        <StatCard icon={Timer} value={updatedThisWeek} label="Updated this week" tone="green" />
      </div>

      {notes.length === 0 ? (
        <div className="card-cn" style={{ marginBottom: '1.4rem' }}>
          <EmptyState
            icon={<StickyNote size={26} />}
            title="Welcome to CloudNotes — your canvas is empty"
            description="Create your first note to get started. Organize it with a category and tags, pin what matters, and find it later with search."
            action={
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button to="/notes/new" icon={<Plus size={16} />}>
                  Create your first note
                </Button>
                <Button to="/categories" variant="secondary" icon={<FolderOpen size={15} />}>
                  Browse categories
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="dashboard-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
            <RecentNotes notes={recentNotes.slice(0, 5)} getCategory={getCategory} />

            <div className="card-cn">
              <div className="card-header-cn">
                <h2>Quick actions</h2>
              </div>
              <div className="card-body-cn quick-actions">
                <Link to="/notes/new" className="quick-action">
                  <span className="qa-icon" aria-hidden="true">
                    <Plus size={16} />
                  </span>
                  Write a new note
                </Link>
                <Link to="/notes" className="quick-action">
                  <span className="qa-icon" aria-hidden="true">
                    <StickyNote size={16} />
                  </span>
                  Browse all {stats.total} note{stats.total === 1 ? '' : 's'}
                </Link>
                <Link to="/categories" className="quick-action">
                  <span className="qa-icon" aria-hidden="true">
                    <FolderOpen size={16} />
                  </span>
                  Manage categories
                </Link>
                <Link to="/settings" className="quick-action">
                  <span className="qa-icon" aria-hidden="true">
                    <Settings size={16} />
                  </span>
                  Profile &amp; settings
                </Link>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
            <CategoryShortcuts
              categories={categories}
              notesByCategory={notesByCategory}
              total={stats.total}
            />

            <div className="card-cn card--pad" style={{ padding: '1.3rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' }}>
                <span className="stat-icon cyan" aria-hidden="true">
                  <Pencil size={19} />
                </span>
                <h3 style={{ fontSize: '1rem' }}>Keep writing</h3>
              </div>
              <p style={{ fontSize: '0.87rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                {stats.pinned > 0
                  ? `You have ${stats.pinned} pinned note${stats.pinned === 1 ? '' : 's'} keeping your priorities in sight.`
                  : 'Pin the notes you reach for most and they will stay within arm’s reach.'}
              </p>
              <Button to="/notes?view=list" variant="soft" size="sm" block>
                Review my notes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
