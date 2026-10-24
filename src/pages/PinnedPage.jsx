/**
 * PinnedPage — everything the user pinned, files and notes together.
 * Unpinning works inline; clicking a note opens it, clicking a file
 * previews it.
 */

import { useEffect, useState } from 'react';
import { FileText, Pin, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks';
import useFileActions from '@/hooks/useFileActions';
import { useNotesStore } from '@/context/NotesContext';
import { useFilesStore } from '@/context/FilesContext';
import filesService from '@/services/filesService';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import FileCard from '@/components/library/FileCard';
import NoteCard from '@/components/notes/NoteCard';
import { useNotifications } from '@/context/NotificationContext';

export default function PinnedPage() {
  useDocumentTitle('Pinned');
  const { notes, getCategory, togglePin, deleteNote } = useNotesStore();
  const { success, error: notifyError } = useNotifications();
  const { handlers, dialogs } = useFileActions({ onChanged: loadPinned });
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const pinnedNotes = notes.filter((note) => note.isPinned);

  async function loadPinned() {
    setIsLoading(true);
    try {
      const result = await filesService.list({ pinned: 'true', per_page: 50 });
      setFiles(result.files);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadPinned();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isEmpty = !isLoading && pinnedNotes.length === 0 && files.length === 0;

  const confirmDeleteNote = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteNote(pendingDelete.id);
      success('Note deleted', `“${pendingDelete.title}” was removed.`);
      setPendingDelete(null);
    } catch (err) {
      notifyError('Could not delete note', err.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pinned</h1>
          <p className="page-subtitle">
            The notes and files you reach for most, kept within arm’s reach.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading pinned items…" />
      ) : isEmpty ? (
        <div className="card-cn">
          <EmptyState
            icon={<Pin size={26} />}
            title="Nothing pinned yet"
            description="Pin important notes and study files from their action menus and they’ll gather here."
            action={
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button to="/notes" variant="secondary" icon={<StickyNote size={15} />}>
                  Browse notes
                </Button>
                <Button to="/files" variant="secondary" icon={<FileText size={15} />}>
                  Browse files
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <section className="library-section" aria-label="Pinned notes">
              <h2 className="section-label">
                <StickyNote size={14} aria-hidden="true" />
                Notes
                <span className="section-count">{pinnedNotes.length}</span>
              </h2>
              <div className="notes-grid">
                {pinnedNotes.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    category={getCategory(note.categoryId)}
                    onTogglePin={togglePin}
                    onDelete={setPendingDelete}
                  />
                ))}
              </div>
            </section>
          )}

          {files.length > 0 && (
            <section className="library-section" aria-label="Pinned files">
              <h2 className="section-label">
                <FileText size={14} aria-hidden="true" />
                Files
                <span className="section-count">{files.length}</span>
              </h2>
              <div className="files-grid">
                {files.map((file) => (
                  <FileCard key={file.id} file={file} {...handlers} />
                ))}
              </div>
            </section>
          )}

          <p className="pinned-hint">
            Need something else? <Link to="/files">Browse all files</Link> or{' '}
            <Link to="/notes">all notes</Link>.
          </p>
        </>
      )}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDeleteNote}
        loading={deleting}
        title="Delete this note?"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will be permanently deleted. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete note"
      />
      {dialogs}
    </div>
  );
}
