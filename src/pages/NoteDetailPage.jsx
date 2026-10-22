/**
 * NoteDetailPage — full read view of a single note with edit, pin, delete,
 * and the export menu.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Clock3, FolderOpen, Pencil, Pin, PinOff, Tags, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotesStore } from '@/context/NotesContext';
import { useNotifications } from '@/context/NotificationContext';
import { useDocumentTitle } from '@/hooks';
import { formatDate, formatDateTime } from '@/utils/dates';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CategoryBadge from '@/components/common/CategoryBadge';
import NoteContent from '@/components/notes/NoteContent';
import ExportMenu from '@/components/notes/ExportMenu';
import { ErrorState, LoadingState } from '@/components/common/StateViews';

export default function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getNote, getCategory, togglePin, deleteNote, hasLoaded, error, reload } =
    useNotesStore();
  const { success, error: notifyError, info } = useNotifications();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const note = getNote(id);
  useDocumentTitle(note ? note.title : 'Note');

  const noteMissing = hasLoaded && !note;

  useEffect(() => {
    if (noteMissing) {
      info('Note not found', 'That note does not exist or has been deleted.');
    }
  }, [noteMissing, info]);

  const handleTogglePin = async () => {
    try {
      const updated = await togglePin(note.id);
      success(updated.isPinned ? 'Note pinned' : 'Note unpinned', `“${note.title}” updated.`);
    } catch (err) {
      notifyError('Could not update note', err.message);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteNote(note.id);
      success('Note deleted', `“${note.title}” was removed.`);
      navigate('/notes', { replace: true });
    } catch (err) {
      notifyError('Could not delete note', err.message);
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  if (!hasLoaded) {
    return (
      <div className="page-container detail-layout">
        <LoadingState label="Loading note…" />
      </div>
    );
  }

  if (error && !note) {
    return (
      <div className="page-container detail-layout">
        <ErrorState title="Could not load the note" message={error} onRetry={reload} />
      </div>
    );
  }

  if (noteMissing) {
    return (
      <div className="page-container detail-layout">
        <ErrorState
          title="Note not found"
          message="This note does not exist, or it may have been deleted."
        />
        <div style={{ textAlign: 'center', marginTop: '-1.5rem' }}>
          <Button to="/notes" variant="secondary" icon={<ArrowLeft size={15} />}>
            Back to all notes
          </Button>
        </div>
      </div>
    );
  }

  const category = getCategory(note.categoryId);

  return (
    <div className="page-container detail-layout">
      <div className="detail-head">
        <Link to="/notes" className="detail-back">
          <ArrowLeft size={15} aria-hidden="true" />
          All notes
        </Link>

        <div className="detail-title-row">
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <CategoryBadge category={category} />
              {note.isPinned && (
                <span className="badge-cn badge-primary">
                  <Pin size={11} aria-hidden="true" />
                  Pinned
                </span>
              )}
            </div>
            <h1>{note.title}</h1>
          </div>

          <div className="detail-actions">
            <ExportMenu note={note} />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleTogglePin}
              icon={note.isPinned ? <PinOff size={15} /> : <Pin size={15} />}
            >
              {note.isPinned ? 'Unpin' : 'Pin'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              to={`/notes/${note.id}/edit`}
              icon={<Pencil size={15} />}
            >
              Edit
            </Button>
            <Button
              variant="danger-soft"
              size="sm"
              onClick={() => setConfirmOpen(true)}
              icon={<Trash2 size={15} />}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="detail-meta">
          <span className="meta-item">
            <Calendar size={14} aria-hidden="true" />
            Created {formatDate(note.createdAt)}
          </span>
          <span className="meta-item">
            <Clock3 size={14} aria-hidden="true" />
            Last updated {formatDateTime(note.updatedAt)}
          </span>
          <span className="meta-item">
            <FolderOpen size={14} aria-hidden="true" />
            {category ? category.name : 'Uncategorized'}
          </span>
        </div>
      </div>

      <article className="detail-body">
        <NoteContent content={note.content} />

        {note.tags.length > 0 && (
          <div className="detail-tags">
            <span
              className="meta-item"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}
            >
              <Tags size={14} aria-hidden="true" />
              Tags
            </span>
            {note.tags.map((tag) => (
              <span className="tag-pill" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </article>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete this note?"
        message={`“${note.title}” will be permanently deleted. This action cannot be undone.`}
        confirmLabel="Delete note"
      />
    </div>
  );
}
