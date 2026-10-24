/**
 * MaterialsTab — everything CURRENTLY shared with this class (files, folders
 * and notes), searchable. Read-only by design: ownership never changes, so
 * members download/view while the owner manages sharing from their library.
 * Unshared private items can never appear here — the backend filters by the
 * explicit sharing relationship on every request.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Download,
  FileText,
  Folder,
  Search,
  Share2,
  StickyNote,
} from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import classesService from '@/services/classesService';
import filesService, { saveBlob } from '@/services/filesService';
import Button from '@/components/common/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { formatBytes } from '@/utils/files';
import { formatDate } from '@/utils/dates';

export default function MaterialsTab({ classId }) {
  const { success, error: notifyError } = useNotifications();
  const [data, setData] = useState({ files: [], folders: [], notes: [] });
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);
  const [query, setQuery] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  const load = useCallback(
    async (search = '') => {
      setStatus((current) => (current === 'ready' ? current : 'loading'));
      try {
        const result = await classesService.materials(classId, search);
        setData({
          files: result.files || [],
          folders: result.folders || [],
          notes: result.notes || [],
        });
        setLoadError(null);
        setStatus('ready');
      } catch (err) {
        setLoadError(err.message);
        setStatus('error');
      }
    },
    [classId]
  );

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search against the backend.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (status === 'ready') load(query);
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const handleDownload = async (file) => {
    setDownloadingId(file.id);
    try {
      const blob = await filesService.fetchBlob(file.id, { kind: 'download' });
      saveBlob(blob, file.name);
      success('Download started', `“${file.name}” is being saved.`);
    } catch (err) {
      notifyError('Download failed', err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  const total = useMemo(
    () => data.files.length + data.folders.length + data.notes.length,
    [data]
  );

  if (status === 'loading' && total === 0) {
    return <LoadingState label="Loading class materials…" />;
  }

  if (status === 'error') {
    return (
      <ErrorState
        title="Could not load materials"
        message={loadError}
        onRetry={() => load(query)}
      />
    );
  }

  return (
    <div className="materials">
      <div className="materials-toolbar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            className="input-cn"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search shared materials…"
            aria-label="Search class materials"
          />
        </label>
        <span className="materials-count" role="status">
          {total} shared item{total === 1 ? '' : 's'}
        </span>
      </div>

      {total === 0 ? (
        <div className="card-cn">
          <EmptyState
            icon={<Share2 size={26} />}
            title={query ? 'No materials match your search' : 'Nothing shared yet'}
            description={
              query
                ? 'Try a different search term.'
                : 'Members share files, folders or notes from their own library — shared items appear here for the whole class.'
            }
          />
        </div>
      ) : (
        <div className="materials-groups">
          {data.folders.length > 0 && (
            <section>
              <h3 className="materials-group-title">Folders</h3>
              <ul className="materials-list">
                {data.folders.map((folder) => (
                  <li key={`folder-${folder.id}`} className="materials-item">
                    <span className="materials-icon" aria-hidden="true">
                      <Folder size={16} />
                    </span>
                    <span className="materials-name" title={folder.name}>
                      {folder.name}
                    </span>
                    <span className="materials-meta">
                      Shared folder — its contents are visible to this class
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.files.length > 0 && (
            <section>
              <h3 className="materials-group-title">Files</h3>
              <ul className="materials-list">
                {data.files.map((file) => (
                  <li key={`file-${file.id}`} className="materials-item">
                    <span className="materials-icon" aria-hidden="true">
                      <FileText size={16} />
                    </span>
                    <span className="materials-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="materials-meta">
                      {formatBytes(file.sizeBytes)} · {formatDate(file.createdAt)}
                    </span>
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => handleDownload(file)}
                      disabled={downloadingId === file.id}
                      aria-label={`Download ${file.name}`}
                      title="Download"
                    >
                      <Download size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.notes.length > 0 && (
            <section>
              <h3 className="materials-group-title">Notes</h3>
              <ul className="materials-list">
                {data.notes.map((note) => (
                  <li key={`note-${note.id}`} className="materials-item">
                    <span className="materials-icon" aria-hidden="true">
                      <StickyNote size={16} />
                    </span>
                    <Link
                      className="materials-name"
                      to={`/notes/${note.id}`}
                      title={note.title}
                    >
                      {note.title}
                    </Link>
                    <span className="materials-meta">Updated {formatDate(note.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <p className="materials-fineprint">
        Only items explicitly shared with this class appear here. Your other
        files and notes stay private.
      </p>
    </div>
  );
}
