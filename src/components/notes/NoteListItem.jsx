/**
 * NoteListItem — compact list-view row with inline actions.
 */

import { Clock3, MoreHorizontal, Pin, PinOff, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRelative } from '@/utils/dates';
import { excerpt } from '@/utils/markdown';
import CategoryBadge from '@/components/common/CategoryBadge';
import Dropdown from '@/components/common/Dropdown';
import { ExportMenuItems } from './ExportMenu';

export default function NoteListItem({ note, category, onTogglePin, onDelete }) {
  const preview = excerpt(note.content, 240);

  return (
    <article className={`note-list-item${note.isPinned ? ' is-pinned' : ''}`}>
      <div className="note-list-body">
        <h3>
          <Link to={`/notes/${note.id}`}>{note.title}</Link>
        </h3>
        <p className="note-list-preview">{preview || 'No content yet.'}</p>
        <div className="note-list-meta">
          <CategoryBadge category={category} />
          {note.tags.slice(0, 4).map((tag) => (
            <span className="tag-pill" key={tag}>
              #{tag}
            </span>
          ))}
          <span className="foot-date" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
            <Clock3 size={13} aria-hidden="true" />
            Updated {formatRelative(note.updatedAt)}
          </span>
          {note.isPinned && (
            <span className="pin-flag">
              <Pin size={12} aria-hidden="true" />
              Pinned
            </span>
          )}
        </div>
      </div>

      <div className="note-list-actions">
        <button
          type="button"
          className="btn-icon"
          onClick={() => onTogglePin(note)}
          aria-label={note.isPinned ? `Unpin ${note.title}` : `Pin ${note.title}`}
          title={note.isPinned ? 'Unpin note' : 'Pin note'}
        >
          {note.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
        </button>
        <Link
          to={`/notes/${note.id}/edit`}
          className="btn-icon"
          aria-label={`Edit ${note.title}`}
          title="Edit note"
        >
          <Pencil size={16} />
        </Link>

        <Dropdown
          menuLabel={`More actions for ${note.title}`}
          trigger={({ toggle, props }) => (
            <button
              type="button"
              className="btn-icon"
              onClick={toggle}
              {...props}
              aria-label={`More actions for ${note.title}`}
            >
              <MoreHorizontal size={17} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <ExportMenuItems note={note} onChosen={close} />
              <div className="dropdown-divider-cn" />
              <button
                type="button"
                className="dropdown-item-cn is-danger"
                role="menuitem"
                onClick={() => {
                  close();
                  onDelete(note);
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
            </>
          )}
        </Dropdown>
      </div>
    </article>
  );
}
