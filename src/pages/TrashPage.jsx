/**
 * TrashPage — recoverable deletion for files.
 *
 * Lists every trashed file with restore (back to the library, root if its
 * folder is gone), permanent deletion (with confirmation), and "empty
 * trash". Nothing here deletes silently: purge always confirms first.
 */

import { useCallback, useEffect, useState } from 'react';
import { RotateCcw, Trash2, XCircle } from 'lucide-react';
import { useDocumentTitle } from '@/hooks';
import { useFilesStore } from '@/context/FilesContext';
import { useNotifications } from '@/context/NotificationContext';
import filesService from '@/services/filesService';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import FileListItem from '@/components/library/FileListItem';
import { formatRelative } from '@/utils/dates';

export default function TrashPage() {
  useDocumentTitle('Trash');
  const { refreshLibrary } = useFilesStore();
  const { success, error: notifyError } = useNotifications();

  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [purgeTarget, setPurgeTarget] = useState(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await filesService.listTrash({ per_page: 100 });
      setFiles(data.files);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleRestore = async (file) => {
    try {
      await filesService.restore(file.id);
      success('File restored', `“${file.name}” is back in your library.`);
      await Promise.all([reload(), refreshLibrary()]);
    } catch (err) {
      notifyError('Could not restore file', err.message);
    }
  };

  const handlePurge = async () => {
    if (!purgeTarget) return;
    setBusy(true);
    try {
      await filesService.purge(purgeTarget.id);
      success('Deleted permanently', `“${purgeTarget.name}” was removed for good.`);
      setPurgeTarget(null);
      await Promise.all([reload(), refreshLibrary()]);
    } catch (err) {
      notifyError('Could not delete file', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEmptyTrash = async () => {
    setBusy(true);
    try {
      const result = await filesService.emptyTrash();
      success('Trash emptied', `${result?.removed ?? 0} file(s) deleted permanently.`);
      setEmptyOpen(false);
      await Promise.all([reload(), refreshLibrary()]);
    } catch (err) {
      notifyError('Could not empty the trash', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loadError && !files.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load the trash" message={loadError} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trash</h1>
          <p className="page-subtitle">
            Deleted files stay here until you restore them or delete them permanently.
          </p>
        </div>
        {files.length > 0 && (
          <Button variant="dangerSoft" icon={<Trash2 size={15} />} onClick={() => setEmptyOpen(true)}>
            Empty trash
          </Button>
        )}
      </div>

      {isLoading && !files.length ? (
        <LoadingState label="Loading trash…" />
      ) : files.length === 0 ? (
        <div className="card-cn">
          <EmptyState
            icon={<Trash2 size={26} />}
            title="The trash is empty"
            description="Files you delete land here first, so a mistake is always fixable."
          />
        </div>
      ) : (
        <>
          <p className="notes-count-label" role="status">
            {files.length} file{files.length === 1 ? '' : 's'} in the trash
          </p>
          <div className="files-list">
            {files.map((file) => (
              <div key={file.id} className="trash-row">
                <FileListItem
                  file={file}
                  onOpen={() => {}}
                  onRestore={handleRestore}
                  onPurge={setPurgeTarget}
                  showFolder={false}
                />
                <div className="trash-actions">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<RotateCcw size={14} />}
                    onClick={() => handleRestore(file)}
                  >
                    Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="dangerSoft"
                    icon={<XCircle size={14} />}
                    onClick={() => setPurgeTarget(file)}
                  >
                    Delete forever
                  </Button>
                </div>
                <p className="trash-deleted-at">Trashed {formatRelative(file.deletedAt)}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(purgeTarget)}
        onClose={() => setPurgeTarget(null)}
        onConfirm={handlePurge}
        loading={busy}
        title="Delete this file permanently?"
        message={
          purgeTarget
            ? `“${purgeTarget.name}” and its stored copy will be destroyed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete permanently"
      />
      <ConfirmDialog
        open={emptyOpen}
        onClose={() => setEmptyOpen(false)}
        onConfirm={handleEmptyTrash}
        loading={busy}
        title="Empty the trash?"
        message={`All ${files.length} file(s) in the trash will be deleted permanently, along with their stored copies. This cannot be undone.`}
        confirmLabel="Empty trash"
      />
    </div>
  );
}
