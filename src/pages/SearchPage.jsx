/**
 * SearchPage — one search box for everything: notes (client-side over the
 * loaded store) and files (server-side, privacy-scoped to the user).
 * `?q=` keeps results shareable and lets the header search land here.
 */

import { useEffect, useState } from 'react';
import { FileText, Search, StickyNote } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
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

export default function SearchPage() {
  useDocumentTitle('Search');
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();

  const { notes, getCategory, togglePin, deleteNote } = useNotesStore();
  const { success, error: notifyError } = useNotifications();
  const [files, setFiles] = useState([]);
  const [isSearching, setIsSearching] = useState(Boolean(query));
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { handlers, dialogs } = useFileActions({
    onChanged: () => runSearch(query),
  });

  async function runSearch(term) {
    if (!term) {
      setFiles([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    try {
      const result = await filesService.list({ q: term, per_page: 50 });
      setFiles(result.files);
    } catch {
      setFiles([]);
    } finally {
      setIsSearching(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => runSearch(query), 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const needle = query.toLowerCase();
  const matchedNotes = needle
    ? notes.filter(
        (note) =>
          note.title.toLowerCase().includes(needle) ||
          note.content.toLowerCase().includes(needle)
      )
    : [];

  const nothing = !isSearching && query && matchedNotes.length === 0 && files.length === 0;

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
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">Find notes and files across your entire library.</p>
        </div>
      </div>

      <div className="search-field search-page-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="form-control-cn"
          placeholder="Search notes and files…"
          defaultValue={query}
          onChange={(event) => {
            const value = event.target.value;
            const params = value ? { q: value } : {};
            setSearchParams(params, { replace: true });
          }}
          aria-label="Search everything"
          autoFocus
        />
      </div>

      {!query ? (
        <div className="card-cn">
          <EmptyState
            icon={<Search size={26} />}
            title="Search across CloudNotes"
            description="Type a file name, note title, or any word inside a note. Results only include your own data."
          />
        </div>
      ) : isSearching ? (
        <LoadingState label="Searching…" />
      ) : nothing ? (
        <div className="card-cn">
          <EmptyState
            icon={<Search size={26} />}
            title={`No results for “${query}”`}
            description="Check the spelling or try a shorter term."
            action={
              <Button to="/files" variant="secondary" icon={<FileText size={15} />}>
                Browse all files
              </Button>
            }
          />
        </div>
      ) : (
        <>
          {files.length > 0 && (
            <section className="library-section" aria-label="Matching files">
              <h2 className="section-label">
                <FileText size={14} aria-hidden="true" />
                Files
                <span className="section-count">{files.length}</span>
              </h2>
              <div className="files-list">
                {files.map((file) => (
                  <FileListItem key={file.id} file={file} {...handlers} />
                ))}
              </div>
            </section>
          )}

          {matchedNotes.length > 0 && (
            <section className="library-section" aria-label="Matching notes">
              <h2 className="section-label">
                <StickyNote size={14} aria-hidden="true" />
                Notes
                <span className="section-count">{matchedNotes.length}</span>
              </h2>
              <div className="notes-list">
                {matchedNotes.slice(0, 20).map((note) => (
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
            Can’t see a private file from a classmate? Sharing arrives with Class Materials in
            Part 2. <Link to="/files">Browse all your files</Link> meanwhile.
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
