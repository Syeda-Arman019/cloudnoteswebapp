/**
 * LibraryPage — "My Study Space": browse the folder hierarchy.
 *
 * `?folder=<id>` selects the current folder. Shows breadcrumbs, subfolders,
 * and files (paginated) for that folder, with upload, rename/move/delete,
 * and a drag-and-drop target that files straight into the open folder.
 * Root shows every file and every top-level folder — nothing is ever
 * hidden behind a required structure.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FilePlus2,
  FolderPlus,
  FolderOpen,
  Files as FilesIcon,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks';
import { useFilesStore } from '@/context/FilesContext';
import { useNotifications } from '@/context/NotificationContext';
import filesService from '@/services/filesService';
import foldersService from '@/services/foldersService';
import { LIBRARY_VIEWS } from '@/utils/files';
import { STORAGE_KEYS } from '@/utils/constants';
import Button from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import Breadcrumbs from '@/components/library/Breadcrumbs';
import FileCard from '@/components/library/FileCard';
import FileListItem from '@/components/library/FileListItem';
import FolderCard from '@/components/library/FolderCard';
import FilesToolbar from '@/components/library/FilesToolbar';
import RenameDialog from '@/components/library/RenameDialog';
import CreateFolderDialog from '@/components/library/CreateFolderDialog';
import DeleteFolderDialog from '@/components/library/DeleteFolderDialog';
import useFileActions from '@/hooks/useFileActions';

function getInitialView() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.LIBRARY_VIEW);
    if (stored === LIBRARY_VIEWS.GRID || stored === LIBRARY_VIEWS.LIST) return stored;
  } catch {
    /* storage unavailable */
  }
  return LIBRARY_VIEWS.GRID;
}

export default function LibraryPage() {
  useDocumentTitle('My Study Space');
  const [searchParams, setSearchParams] = useSearchParams();
  const folderId = searchParams.get('folder');

  const { folders, pathOf, openUpload, refreshLibrary, startUpload } = useFilesStore();
  const { success, error: notifyError } = useNotifications();

  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(getInitialView);
  const [isDropping, setIsDropping] = useState(false);

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renameFolder, setRenameFolder] = useState(null);
  const [deleteFolder, setDeleteFolder] = useState(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const path = useMemo(() => pathOf(folderId), [pathOf, folderId]);
  const currentFolder = folderId ? folders.find((folder) => folder.id === folderId) : null;
  const subfolders = useMemo(() => {
    if (!folderId) return folders.filter((folder) => !folder.parentId);
    return folders.filter((folder) => folder.parentId === folderId);
  }, [folders, folderId]);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await filesService.list({
        folder: folderId || 'root',
        q: search,
        type,
        sort,
        page,
        per_page: 50,
      });
      setFiles(result.files);
      setTotal(result.pagination.total);
      setTotalPages(result.pagination.totalPages);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [folderId, search, type, sort, page]);

  const { handlers, dialogs } = useFileActions({
    onChanged: loadFiles,
  });

  // Debounce typing into the search box so we don't hammer the API.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setTimeout(() => loadFiles(), 250);
    return () => window.clearTimeout(timer);
  }, [loadFiles]);

  useEffect(() => {
    setPage(1);
  }, [folderId, type, sort]);

  const changeView = (nextView) => {
    setView(nextView);
    try {
      window.localStorage.setItem(STORAGE_KEYS.LIBRARY_VIEW, nextView);
    } catch {
      /* storage unavailable */
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDropping(false);
    if (event.dataTransfer.files?.length) {
      // Same global queue the header button uses; opens the modal with
      // per-file progress targeting this folder.
      startUpload(event.dataTransfer.files, { folderId });
    }
  };

  const handleCreateFolder = async (name, parentId) => {
    setCreatingFolder(true);
    try {
      const folder = await foldersService.create({ name, parentId: parentId ?? null });
      success('Folder created', `“${folder.name}” is ready.`);
      setNewFolderOpen(false);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not create folder', err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = async (name) => {
    setFolderBusy(true);
    try {
      await foldersService.update(renameFolder.id, { name });
      success('Folder renamed', `It is now “${name}”.`);
      setRenameFolder(null);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not rename folder', err.message);
    } finally {
      setFolderBusy(false);
    }
  };

  const requestDeleteFolder = async (folder) => {
    // Step 1: try a plain delete. Empty folders go straight away; non-empty
    // folders answer 409 with counts, which populate the confirm dialog.
    try {
      const result = await foldersService.remove(folder.id, { recursive: false });
      success(
        'Folder deleted',
        result?.trashedFiles
          ? `${result.trashedFiles} file${result.trashedFiles === 1 ? '' : 's'} moved to the Trash.`
          : `“${folder.name}” was removed.`
      );
      if (folderId === String(folder.id)) setSearchParams({});
      await refreshLibrary();
      await loadFiles();
    } catch (err) {
      const details = err?.details?.details || null;
      if (err?.status === 409 && details) {
        setDeleteFolder({ ...folder, contents: details });
      } else {
        notifyError('Could not delete folder', err.message);
      }
    }
  };

  const handleDeleteFolder = async (recursive) => {
    setFolderBusy(true);
    try {
      const result = await foldersService.remove(deleteFolder.id, { recursive });
      success(
        'Folder deleted',
        result?.trashedFiles
          ? `${result.trashedFiles} file${result.trashedFiles === 1 ? '' : 's'} moved to the Trash — restore them any time.`
          : `“${deleteFolder.name}” was removed.`
      );
      setDeleteFolder(null);
      if (folderId === deleteFolder.id) setSearchParams({});
      await refreshLibrary();
      await loadFiles();
    } catch (err) {
      notifyError('Could not delete folder', err.message);
    } finally {
      setFolderBusy(false);
    }
  };

  if (loadError && !files.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load your Study Library" message={loadError} onRetry={loadFiles} />
      </div>
    );
  }

  const showRootEverything = !folderId;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Study Space</h1>
          <p className="page-subtitle">
            Organize by semester, subject, or any structure you like — folders are always optional.
          </p>
        </div>
        <div className="page-header-actions">
          <Button variant="secondary" icon={<FolderPlus size={16} />} onClick={() => setNewFolderOpen(true)}>
            New folder
          </Button>
          <Button icon={<FilePlus2 size={16} />} onClick={() => openUpload(folderId)}>
            Upload files
          </Button>
        </div>
      </div>

      <Breadcrumbs path={path} />

      <div
        className={`library-dropzone${isDropping ? ' is-dropping' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDropping(true);
        }}
        onDragLeave={() => setIsDropping(false)}
        onDrop={handleDrop}
      >
        {isDropping && <span>Drop to upload{currentFolder ? ` into ${currentFolder.name}` : ' to the library root'}</span>}
      </div>

      <FilesToolbar
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={changeView}
      />

      {isLoading && !files.length ? (
        <LoadingState label="Loading folder…" />
      ) : (
        <>
          {subfolders.length > 0 && (
            <section className="library-section" aria-label="Subfolders">
              <h2 className="section-label">
                {showRootEverything ? 'Top-level folders' : 'Subfolders'}
              </h2>
              <div className="folders-grid">
                {subfolders.map((folder) => (
                  <FolderCard
                    key={folder.id}
                    folder={folder}
                    onRename={setRenameFolder}
                    onDelete={requestDeleteFolder}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="library-section" aria-label="Files">
            <h2 className="section-label">
              <FilesIcon size={14} aria-hidden="true" />
              {showRootEverything ? 'Files at the library root' : 'Files in this folder'}
              <span className="section-count">{total}</span>
            </h2>

            {files.length === 0 ? (
              <div className="card-cn">
                <EmptyState
                  icon={<FolderOpen size={26} />}
                  title={search || type !== 'all' ? 'No files match your filters' : 'This folder is empty'}
                  description={
                    search || type !== 'all'
                      ? 'Try a different search term or file type.'
                      : 'Upload study materials here, or move existing files in from All Files. You can also drag files onto this page.'
                  }
                  action={
                    <Button icon={<FilePlus2 size={15} />} onClick={() => openUpload(folderId)}>
                      Upload files
                    </Button>
                  }
                />
              </div>
            ) : view === LIBRARY_VIEWS.GRID ? (
              <div className="files-grid">
                {files.map((file) => (
                  <FileCard key={file.id} file={file} {...handlers} />
                ))}
              </div>
            ) : (
              <div className="files-list">
                {files.map((file) => (
                  <FileListItem key={file.id} file={file} showFolder={showRootEverything} {...handlers} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="pagination-row">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="pagination-label">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </section>
        </>
      )}

      <CreateFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onConfirm={handleCreateFolder}
        folders={folders}
        defaultParentId={folderId}
        loading={creatingFolder}
      />
      <RenameDialog
        open={Boolean(renameFolder)}
        onClose={() => setRenameFolder(null)}
        onConfirm={handleRenameFolder}
        item={renameFolder}
        loading={folderBusy}
        title="Rename folder"
      />
      <DeleteFolderDialog
        folder={deleteFolder}
        onClose={() => setDeleteFolder(null)}
        onConfirm={handleDeleteFolder}
        loading={folderBusy}
      />
      {dialogs}
    </div>
  );
}
