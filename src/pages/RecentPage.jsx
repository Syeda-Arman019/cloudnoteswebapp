/**
 * RecentPage — recently accessed files beside recently edited notes.
 * "Accessed" updates whenever a file is downloaded or previewed, so the
 * list reflects real usage, not fabrication.
 */

import { useEffect, useState } from 'react';
import { Clock, FileText, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks';
import useFileActions from '@/hooks/useFileActions';
import { useNotesStore } from '@/context/NotesContext';
import { useNotifications } from '@/context/NotificationContext';
import filesService from '@/services/filesService';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/common/StateViews';
import FileListItem from '@/components/library/FileListItem';
import NoteListItem from '@/components/notes/NoteListItem';

export default function RecentPage() {
  useDocumentTitle('Recent');
  const { recentNotes, getCategory, togglePin, deleteNote } = useNotesStore();
  const { success, error: notifyError } = useNotifications();
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { handlers, dialogs } = useFileActions({
    onChanged: async () => {
      const stats = await filesService.getStats();
      setFiles(stats.recentFiles);
    },
  });

  useEffect(() => {
    let cancelled = false;
    filesService
      .getStats()
      .then((stats) => {
        if (!cancelled) setFiles(stats.recentFiles);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isEmpty = !isLoading && recentNotes.length === 0 && files.length === 0;

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
          <h1 className="page-title">Recent</h1>
          <p className="page-subtitle">
            Files you opened and notes you edited, newest first.
          </p>
        </div>
      </div>

      {isLoading ? (
        <LoadingState label="Loading recent activity…" />
      ) : isEmpty ? (
        <div className="card-cn">
          <EmptyState
            icon={<Clock size={26} />}
            title="Nothing here yet"
            description="Open a file or edit a note and it will show up here."
            action={
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                <Button to="/library" variant="secondary">
                  Open Study Library
                </Button>
                <Button to="/notes/new" variant="secondary" icon={<StickyNote size={15} />}>
                  Write a note
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <>
          {files.length > 0 && (
            <section className="library-section" aria-label="Recent files">
              <h2 className="section-label">
                <FileText size={14} aria-hidden="true" />
                Recently accessed files
                <span className="section-count">{files.length}</span>
              </h2>
              <div className="files-list">
                {files.map((file) => (
                  <FileListItem key={file.id} file={file} {...handlers} />
                ))}
              </div>
            </section>
          )}

          {recentNotes.length > 0 && (
            <section className="library-section" aria-label="Recent notes">
              <h2 className="section-label">
                <StickyNote size={14} aria-hidden="true" />
                Recently edited notes
                <span className="section-count">{recentNotes.length}</span>
              </h2>
              <div className="notes-list">
                {recentNotes.slice(0, 10).map((note) => (
                  <NoteListItem
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

          <p className="pinned-hint">
            Looking for something specific? <Link to="/search">Search everything</Link>.
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
