/**
 * NotesPage — the full notes management interface.
 *
 * Search, category/pin filters, sorting, grid/list layout, pin toggling and
 * deletion all work against the data store, which delegates to the service
 * layer (demo store today, Flask API tomorrow). URL params (?q=, ?category=)
 * let links from the dashboard and sidebar land on a pre-filtered view.
 */

import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Plus, StickyNote } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useNotesStore } from '@/context/NotesContext';
import { useNotifications } from '@/context/NotificationContext';
import { useDocumentTitle } from '@/hooks';
import { NOTE_SORT_OPTIONS, NOTE_VIEWS, STORAGE_KEYS } from '@/utils/constants';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import NotesToolbar from '@/components/notes/NotesToolbar';
import NoteCard from '@/components/notes/NoteCard';
import NoteListItem from '@/components/notes/NoteListItem';

function matchesSearch(note, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  return (
    note.title.toLowerCase().includes(needle) || note.content.toLowerCase().includes(needle)
  );
}

function sortNotes(notes, sort) {
  const copy = [...notes];
  if (sort === 'oldest') {
    return copy.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }
  if (sort === 'updated') {
    return copy.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  return copy.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest
}

function getInitialView() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.NOTE_VIEW);
    if (stored === NOTE_VIEWS.GRID || stored === NOTE_VIEWS.LIST) return stored;
  } catch {
    /* storage unavailable */
  }
  return NOTE_VIEWS.GRID;
}

export default function NotesPage() {
  useDocumentTitle('All notes');
  const {
    notes,
    categories,
    getCategory,
    togglePin,
    deleteNote,
    isLoading,
    error,
    reload,
  } = useNotesStore();
  const { success, error: notifyError } = useNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [categoryFilter, setCategoryFilter] = useState(
    () => searchParams.get('category') || 'all'
  );
  const [pinnedFilter, setPinnedFilter] = useState('all');
  const [sort, setSort] = useState(NOTE_SORT_OPTIONS[0].value);
  const [view, setView] = useState(getInitialView);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Keep the URL shareable: reflect search/category in query params.
  useEffect(() => {
    const params = {};
    if (search) params.q = search;
    if (categoryFilter !== 'all') params.category = categoryFilter;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter]);

  // Adopt params changed externally (sidebar / dashboard links).
  useEffect(() => {
    const urlQuery = searchParams.get('q') || '';
    const urlCategory = searchParams.get('category') || 'all';
    const urlView = searchParams.get('view');
    if (urlQuery !== search) setSearch(urlQuery);
    if (urlCategory !== categoryFilter) setCategoryFilter(urlCategory);
    if (urlView === NOTE_VIEWS.GRID || urlView === NOTE_VIEWS.LIST) changeView(urlView);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const changeView = (nextView) => {
    setView(nextView);
    try {
      window.localStorage.setItem(STORAGE_KEYS.NOTE_VIEW, nextView);
    } catch {
      /* storage unavailable */
    }
  };

  const filteredNotes = useMemo(() => {
    let result = notes.filter((note) => matchesSearch(note, search));

    if (categoryFilter === 'uncategorized') {
      result = result.filter((note) => !note.categoryId);
    } else if (categoryFilter !== 'all') {
      result = result.filter((note) => note.categoryId === categoryFilter);
    }

    if (pinnedFilter === 'pinned') result = result.filter((note) => note.isPinned);
    if (pinnedFilter === 'unpinned') result = result.filter((note) => !note.isPinned);

    return sortNotes(result, sort);
  }, [notes, search, categoryFilter, pinnedFilter, sort]);

  const hasActiveFilters = Boolean(search) || categoryFilter !== 'all' || pinnedFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setPinnedFilter('all');
  };

  const handleTogglePin = async (note) => {
    try {
      const updated = await togglePin(note.id);
      success(updated.isPinned ? 'Note pinned' : 'Note unpinned', `“${note.title}” updated.`);
    } catch (err) {
      notifyError('Could not update note', err.message);
    }
  };

  const confirmDelete = async () => {
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

  if (isLoading && !notes.length) {
    return (
      <div className="page-container">
        <LoadingState label="Loading your notes…" />
      </div>
    );
  }

  if (error && !notes.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load notes" message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">All notes</h1>
          <p className="page-subtitle">
            Search, filter, sort, pin, and organize everything in one place.
          </p>
        </div>
        <Button to="/notes/new" icon={<Plus size={16} />}>
          New note
        </Button>
      </div>

      <NotesToolbar
        search={search}
        onSearchChange={setSearch}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        pinned={pinnedFilter}
        onPinnedChange={setPinnedFilter}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={changeView}
        categories={categories}
        onClear={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <p className="notes-count-label" role="status">
        {filteredNotes.length === notes.length
          ? `${notes.length} note${notes.length === 1 ? '' : 's'}`
          : `${filteredNotes.length} of ${notes.length} notes`}
        {search && ` matching “${search}”`}
      </p>

      {filteredNotes.length === 0 ? (
        notes.length === 0 ? (
          <div className="card-cn">
            <EmptyState
              icon={<StickyNote size={26} />}
              title="No notes yet"
              description="Create your first note — add a category and tags so it is easy to find later."
              action={
                <Button to="/notes/new" icon={<Plus size={16} />}>
                  Create your first note
                </Button>
              }
            />
          </div>
        ) : (
          <div className="card-cn">
            <EmptyState
              icon={<FolderOpen size={26} />}
              title="No notes match your filters"
              description="Try a different search term, category, or pinned filter — or clear everything to start fresh."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          </div>
        )
      ) : view === NOTE_VIEWS.GRID ? (
        <div className="notes-grid">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              category={getCategory(note.categoryId)}
              onTogglePin={handleTogglePin}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      ) : (
        <div className="notes-list">
          {filteredNotes.map((note) => (
            <NoteListItem
              key={note.id}
              note={note}
              category={getCategory(note.categoryId)}
              onTogglePin={handleTogglePin}
              onDelete={setPendingDelete}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this note?"
        message={
          pendingDelete
            ? `“${pendingDelete.title}” will be permanently deleted. This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete note"
      />
    </div>
  );
}
