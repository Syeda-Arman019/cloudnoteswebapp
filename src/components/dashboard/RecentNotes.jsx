/**
 * RecentNotes — "recently updated" panel for the dashboard.
 */

import { ChevronRight, Pin, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRelative } from '@/utils/dates';
import { excerpt } from '@/utils/markdown';
import CategoryBadge from '@/components/common/CategoryBadge';
import { EmptyState } from '@/components/common/StateViews';
import Button from '@/components/common/Button';

export default function RecentNotes({ notes, getCategory }) {
  if (!notes.length) {
    return (
      <div className="card-cn">
        <EmptyState
          icon={<StickyNote size={26} />}
          title="No notes yet"
          description="Create your first note and it will show up here."
          action={<Button to="/notes/new" size="sm">New note</Button>}
        />
      </div>
    );
  }

  return (
    <div className="card-cn">
      <div className="card-header-cn">
        <h2>Recently updated</h2>
        <Link to="/notes" className="link-button" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          View all
        </Link>
      </div>

      <div className="recent-list">
        {notes.map((note) => (
          <div className="recent-row" key={note.id}>
            <span className="recent-icon" aria-hidden="true">
              <StickyNote size={17} />
            </span>
            <div className="recent-body">
              <div className="recent-title">
                <Link to={`/notes/${note.id}`}>{note.title}</Link>
                {note.isPinned && <Pin size={12} aria-hidden="true" style={{ color: 'var(--primary)' }} />}
              </div>
              <div className="recent-meta">
                {excerpt(note.content, 80) || 'No content'} · Updated {formatRelative(note.updatedAt)}
              </div>
            </div>
            <CategoryBadge category={getCategory(note.categoryId)} />
            <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-faint)' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
