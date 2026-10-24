/**
 * NoteEditorPage — shared page for creating (/notes/new) and editing
 * (/notes/:id/edit) notes. All persistence goes through the data store, which
 * delegates to the notes service.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useNotesStore } from '@/context/NotesContext';
import { useFilesStore } from '@/context/FilesContext';
import { useNotifications } from '@/context/NotificationContext';
import { useDocumentTitle } from '@/hooks';
import NoteEditorForm from '@/components/notes/NoteEditorForm';
import { ErrorState, LoadingState } from '@/components/common/StateViews';
import Button from '@/components/common/Button';

export default function NoteEditorPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { getNote, createNote, updateNote, categories, isLoading, hasLoaded, error, reload } =
    useNotesStore();
  const { folders } = useFilesStore();
  const { success, error: notifyError, info } = useNotifications();
  const [saving, setSaving] = useState(false);

  useDocumentTitle(isEditing ? 'Edit note' : 'New note');

  const note = isEditing ? getNote(id) : null;
  const noteMissing = isEditing && hasLoaded && !note;

  // One-time notice when the requested note does not exist.
  useEffect(() => {
    if (noteMissing) {
      info('Note not found', 'That note does not exist or has been deleted.');
    }
  }, [noteMissing, info]);

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      if (isEditing) {
        const updated = await updateNote(id, values);
        success('Changes saved', `“${updated.title}” is up to date.`);
        navigate(`/notes/${id}`);
      } else {
        const created = await createNote(values);
        success('Note created', `“${created.title}” was added to your notes.`);
        navigate(`/notes/${created.id}`);
      }
    } catch (err) {
      notifyError(isEditing ? 'Could not save changes' : 'Could not create note', err.message);
      setSaving(false);
    }
  };

  // Editing while the store is still hydrating.
  if (isEditing && !hasLoaded) {
    return (
      <div className="page-container">
        <LoadingState label="Loading your note…" />
      </div>
    );
  }

  if (isEditing && error && !note) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load the note" message={error} onRetry={reload} />
      </div>
    );
  }

  if (noteMissing) {
    return (
      <div className="page-container">
        <ErrorState
          title="Note not found"
          message="The note you are trying to edit does not exist, or it has been deleted."
        />
        <div style={{ textAlign: 'center', marginTop: '-1.5rem' }}>
          <Link to="/notes">Back to all notes</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link to={isEditing ? `/notes/${id}` : '/notes'} className="detail-back">
            <ArrowLeft size={15} aria-hidden="true" />
            {isEditing ? 'Back to note' : 'Back to notes'}
          </Link>
          <h1 className="page-title">{isEditing ? 'Edit note' : 'Create a note'}</h1>
          <p className="page-subtitle">
            {isEditing
              ? 'Update the title, content, category, or tags.'
              : 'Capture the thought first — organize it with a category and tags.'}
          </p>
        </div>
        {isEditing && (
          <span className="badge-cn badge-success">
            <CheckCircle2 size={13} aria-hidden="true" />
            Editing
          </span>
        )}
      </div>

      <NoteEditorForm
        note={isEditing ? note : null}
        categories={categories}
        folders={folders}
        onSubmit={handleSubmit}
        onCancel={() => navigate(isEditing ? `/notes/${id}` : '/notes')}
        busy={saving}
      />

      {isEditing && (
        <div style={{ marginTop: '1.2rem' }}>
          <Button variant="ghost" size="sm" to="/notes">
            Discard and browse notes
          </Button>
        </div>
      )}
    </div>
  );
}
