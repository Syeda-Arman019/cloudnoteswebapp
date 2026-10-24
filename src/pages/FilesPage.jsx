/**
 * FilesPage — "All Files": every active file regardless of folder.
 *
 * Server-side search/type/date/sort filters, grid or list layout,
 * multi-select with ZIP download (folder structure preserved), and the
 * full action set (preview, download, rename, move, pin, trash).
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, FilePlus2, Files as FilesIcon } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks';
import useFileActions from '@/hooks/useFileActions';
import { useFilesStore } from '@/context/FilesContext';
import filesService from '@/services/filesService';
import { LIBRARY_VIEWS } from '@/utils/files';
import { STORAGE_KEYS } from '@/utils/constants';
import Button from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import FileCard from '@/components/library/FileCard';
import FileListItem from '@/components/library/FileListItem';
import FilesToolbar from '@/components/library/FilesToolbar';

function getInitialView() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEYS.LIBRARY_VIEW);
    if (stored === LIBRARY_VIEWS.GRID || stored === LIBRARY_VIEWS.LIST) return stored;
  } catch {
    /* storage unavailable */
  }
  return LIBRARY_VIEWS.LIST;
}

export default function FilesPage() {
  useDocumentTitle('All files');
  const [searchParams, setSearchParams] = useSearchParams();
  const { folders, openUpload } = useFilesStore();

  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [type, setType] = useState('all');
  const [folder, setFolder] = useState('all');
  const [uploaded, setUploaded] = useState('any');
  const [sort, setSort] = useState('newest');
  const [view, setView] = useState(getInitialView);

  const [selected, setSelected] = useState(new Set());
  const [zipping, setZipping] = useState(false);

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await filesService.list({
        q: search,
        type,
        folder,
        uploaded,
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
  }, [search, type, folder, uploaded, sort, page]);

  const { handlers, dialogs } = useFileActions({ onChanged: loadFiles });

  // Debounced search + URL sync.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const timer = window.setTimeout(() => loadFiles(), 250);
    return () => window.clearTimeout(timer);
  }, [loadFiles]);

  useEffect(() => {
    setPage(1);
  }, [type, folder, uploaded, sort]);

  useEffect(() => {
    const params = {};
    if (search) params.q = search;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const changeView = (nextView) => {
    setView(nextView);
    try {
      window.localStorage.setItem(STORAGE_KEYS.LIBRARY_VIEW, nextView);
    } catch {
      /* storage unavailable */
    }
  };

  const toggleSelect = (file) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(file.id)) next.delete(file.id);
      else next.add(file.id);
      return next;
    });
  };

  const selectedFiles = files.filter((file) => selected.has(file.id));

  const downloadSelected = async () => {
    setZipping(true);
    try {
      await handlers.onDownloadSelected(selectedFiles);
      setSelected(new Set());
    } finally {
      setZipping(false);
    }
  };

  const hasActiveFilters =
    Boolean(search) || type !== 'all' || folder !== 'all' || uploaded !== 'any';

  const clearFilters = () => {
    setSearch('');
    setType('all');
    setFolder('all');
    setUploaded('any');
  };

  if (loadError && !files.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load files" message={loadError} onRetry={loadFiles} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">All files</h1>
          <p className="page-subtitle">
            Everything you’ve uploaded, wherever it lives in your folders.
          </p>
        </div>
        <Button icon={<FilePlus2 size={16} />} onClick={() => openUpload()}>
          Upload files
        </Button>
      </div>

      <FilesToolbar
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        uploaded={uploaded}
        onUploadedChange={setUploaded}
        sort={sort}
        onSortChange={setSort}
        view={view}
        onViewChange={changeView}
        folders={folders}
        folder={folder}
        onFolderChange={setFolder}
        hasActiveFilters={hasActiveFilters}
        onClear={clearFilters}
      />

      {selected.size > 0 && (
        <div className="selection-bar" role="status">
          <span>
            {selected.size} file{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="selection-actions">
            <Button
              size="sm"
              variant="secondary"
              icon={<Download size={14} />}
              onClick={downloadSelected}
              loading={zipping}
            >
              Download as ZIP
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
          </div>
        </div>
      )}

      <p className="notes-count-label" role="status">
        {total} file{total === 1 ? '' : 's'}
        {hasActiveFilters ? ' match your filters' : ' in your library'}
      </p>

      {isLoading && !files.length ? (
        <LoadingState label="Loading files…" />
      ) : files.length === 0 ? (
        <div className="card-cn">
          <EmptyState
            icon={<FilesIcon size={26} />}
            title={hasActiveFilters ? 'No files match your filters' : 'No files yet'}
            description={
              hasActiveFilters
                ? 'Try a different search term, file type, folder, or upload date.'
                : 'Upload PDFs, Word/PowerPoint/Excel documents, text, Markdown, and images — with or without a folder.'
            }
            action={
              hasActiveFilters ? (
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : (
                <Button icon={<FilePlus2 size={15} />} onClick={() => openUpload()}>
                  Upload your first file
                </Button>
              )
            }
          />
        </div>
      ) : view === LIBRARY_VIEWS.GRID ? (
        <div className="files-grid">
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              {...handlers}
              selected={selected.has(file.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      ) : (
        <div className="files-list">
          {files.map((file) => (
            <FileListItem
              key={file.id}
              file={file}
              {...handlers}
              selected={selected.has(file.id)}
              onToggleSelect={toggleSelect}
            />
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

      {dialogs}
    </div>
  );
}
