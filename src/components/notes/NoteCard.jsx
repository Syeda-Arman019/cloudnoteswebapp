/**
 * NoteCard — grid-view card with title, preview, category, tags and the
 * standard note actions (view, edit, pin, export, delete).
 */

import { Clock3, MoreHorizontal, Pin, PinOff, Pencil, Trash2, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatRelative } from '@/utils/dates';
import { excerpt } from '@/utils/markdown';
import CategoryBadge from '@/components/common/CategoryBadge';
import Dropdown from '@/components/common/Dropdown';
import { ExportMenuItems } from './ExportMenu';

export default function NoteCard({ note, category, onTogglePin, onDelete }) {
  const preview = excerpt(note.content, 190);

  return (
    <article className={`note-card${note.isPinned ? ' is-pinned' : ''}`}>
      <div className="note-card-head">
        <h3 className="note-card-title">
          <Link to={`/notes/${note.id}`}>{note.title}</Link>
        </h3>

        <Dropdown
          menuLabel={`Actions for ${note.title}`}
          trigger={({ toggle, props }) => (
            <button
              type="button"
              className="btn-icon"
              onClick={toggle}
              {...props}
              aria-label={`Actions for ${note.title}`}
            >
              <MoreHorizontal size={17} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <Link to={`/notes/${note.id}`} className="dropdown-item-cn" role="menuitem" onClick={close}>
                <ArrowRight size={15} aria-hidden="true" />
                View note
              </Link>
              <Link
                to={`/notes/${note.id}/edit`}
                className="dropdown-item-cn"
                role="menuitem"
                onClick={close}
              >
                <Pencil size={15} aria-hidden="true" />
                Edit
              </Link>
              <button
                type="button"
                className="dropdown-item-cn"
                role="menuitem"
                onClick={async () => {
                  close();
                  await onTogglePin(note);
                }}
              >
                {note.isPinned ? (
                  <PinOff size={15} aria-hidden="true" />
                ) : (
                  <Pin size={15} aria-hidden="true" />
                )}
                {note.isPinned ? 'Unpin note' : 'Pin note'}
              </button>

              <div className="dropdown-divider-cn" />
              <ExportMenuItems note={note} compact />
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

      <p className="note-card-preview">{preview || 'No content yet.'}</p>

      <div className="note-card-tags">
        <CategoryBadge category={category} />
        {note.tags.slice(0, 3).map((tag) => (
          <span className="tag-pill" key={tag}>
            #{tag}
          </span>
        ))}
        {note.tags.length > 3 && <span className="tag-pill">+{note.tags.length - 3}</span>}
      </div>

      <div className="note-card-foot">
        <span className="foot-date">
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
    </article>
  );
}
