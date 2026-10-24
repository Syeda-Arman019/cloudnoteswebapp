/**
 * useFileActions — one place for every file interaction, reused by the
 * Library, All Files, Pinned, Recent and Dashboard pages so behaviour is
 * identical everywhere:
 *
 *   open → preview modal (or direct download for office formats)
 *   download → authenticated blob fetch + browser save
 *   rename → modal (extension preserved & locked)
 *   move → folder picker modal
 *   pin → toggles the pinned flag
 *   trash → confirm → soft delete (recoverable)
 *   restore / purge → trash-only actions
 *   downloadSelected → ZIP archive of many files
 *
 * Returns `{ handlers, dialogs }` — render `dialogs` once inside the page.
 */

import { useCallback, useState } from 'react';
import { useNotifications } from '@/context/NotificationContext';
import { useFilesStore } from '@/context/FilesContext';
import filesService, { saveBlob } from '@/services/filesService';
import { isPreviewable } from '@/utils/files';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import PreviewModal from '@/components/library/PreviewModal';
import RenameDialog from '@/components/library/RenameDialog';
import MoveDialog from '@/components/library/MoveDialog';
import ShareDialog from '@/components/class/ShareDialog';

export default function useFileActions({ onChanged = null } = {}) {
  const { success, error: notifyError } = useNotifications();
  const { folders, refreshLibrary } = useFilesStore();

  const [previewFile, setPreviewFile] = useState(null);
  const [renameFile, setRenameFile] = useState(null);
  const [moveFile, setMoveFile] = useState(null);
  const [trashFile, setTrashFile] = useState(null);
  const [purgeFile, setPurgeFile] = useState(null);
  const [shareFile, setShareFile] = useState(null);
  const [busy, setBusy] = useState(false);

  const changed = useCallback(async () => {
    await refreshLibrary();
    onChanged?.();
  }, [onChanged, refreshLibrary]);

  const handleDownload = useCallback(async (file) => {
    try {
      const blob = await filesService.fetchBlob(file.id, { kind: 'download' });
      saveBlob(blob, file.name);
      success('Download started', `“${file.name}” is being saved.`);
    } catch (err) {
      notifyError('Download failed', err.message);
    }
  }, [notifyError, success]);

  const handleOpen = useCallback(
    (file) => {
      if (isPreviewable(file)) {
        setPreviewFile(file);
      } else {
        // Office formats: download directly rather than fake a preview.
        handleDownload(file);
      }
    },
    [handleDownload]
  );

  const handleRename = useCallback(
    async (name) => {
      setBusy(true);
      try {
        await filesService.update(renameFile.id, { name });
        success('File renamed', `It is now “${name}”.`);
        setRenameFile(null);
        await changed();
      } catch (err) {
        notifyError('Could not rename file', err.message);
      } finally {
        setBusy(false);
      }
    },
    [changed, notifyError, renameFile, success]
  );

  const handleMove = useCallback(
    async (folderId) => {
      setBusy(true);
      try {
        const updated = await filesService.update(moveFile.id, { folderId });
        success('File moved', updated.folderName ? `Moved to “${updated.folderName}”.` : 'Moved to the library root.');
        setMoveFile(null);
        await changed();
      } catch (err) {
        notifyError('Could not move file', err.message);
      } finally {
        setBusy(false);
      }
    },
    [changed, moveFile, notifyError, success]
  );

  const handleTogglePin = useCallback(
    async (file) => {
      try {
        const updated = await filesService.update(file.id, { isPinned: !file.isPinned });
        success(updated.isPinned ? 'Pinned' : 'Unpinned', `“${file.name}” ${updated.isPinned ? 'will stay within reach' : 'is back to regular order'}.`);
        await changed();
      } catch (err) {
        notifyError('Could not update pin', err.message);
      }
    },
    [changed, notifyError, success]
  );

  const confirmTrash = useCallback(async () => {
    if (!trashFile) return;
    setBusy(true);
    try {
      await filesService.trash(trashFile.id);
      success('Moved to trash', `“${trashFile.name}” can be restored from the Trash.`);
      setTrashFile(null);
      setPreviewFile(null);
      await changed();
    } catch (err) {
      notifyError('Could not delete file', err.message);
    } finally {
      setBusy(false);
    }
  }, [changed, notifyError, success, trashFile]);

  const confirmPurge = useCallback(async () => {
    if (!purgeFile) return;
    setBusy(true);
    try {
      await filesService.purge(purgeFile.id);
      success('Deleted permanently', `“${purgeFile.name}” was removed for good.`);
      setPurgeFile(null);
      await changed();
    } catch (err) {
      notifyError('Could not delete file', err.message);
    } finally {
      setBusy(false);
    }
  }, [changed, notifyError, purgeFile, success]);

  const handleRestore = useCallback(
    async (file) => {
      try {
        await filesService.restore(file.id);
        success('File restored', `“${file.name}” is back in your library.`);
        await changed();
      } catch (err) {
        notifyError('Could not restore file', err.message);
      }
    },
    [changed, notifyError, success]
  );

  const handleDownloadSelected = useCallback(
    async (files) => {
      if (!files.length) return;
      try {
        const blob = await filesService.downloadZip(files.map((file) => file.id));
        saveBlob(blob, 'cloudnotes-files.zip');
        success(
          'ZIP download started',
          `${files.length} file${files.length === 1 ? '' : 's'} archived, folder structure preserved.`
        );
      } catch (err) {
        notifyError('Could not build the ZIP', err.message);
      }
    },
    [notifyError, success]
  );

  const handlers = {
    onOpen: handleOpen,
    onDownload: handleDownload,
    onRename: setRenameFile,
    onMove: setMoveFile,
    onTogglePin: handleTogglePin,
    onTrash: setTrashFile,
    onRestore: handleRestore,
    onPurge: setPurgeFile,
    onShare: setShareFile,
    onDownloadSelected: handleDownloadSelected,
  };

  const dialogs = (
    <>
      <PreviewModal
        open={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
        onDownload={handleDownload}
      />
      <RenameDialog
        open={Boolean(renameFile)}
        onClose={() => setRenameFile(null)}
        onConfirm={handleRename}
        item={renameFile}
        extension={renameFile?.extension || null}
        loading={busy}
        title="Rename file"
      />
      <MoveDialog
        open={Boolean(moveFile)}
        onClose={() => setMoveFile(null)}
        onConfirm={handleMove}
        file={moveFile}
        folders={folders}
        loading={busy}
      />
      <ShareDialog
        open={Boolean(shareFile)}
        onClose={() => setShareFile(null)}
        resource={shareFile}
        resourceType="file"
        onChanged={changed}
      />
      <ConfirmDialog
        open={Boolean(trashFile)}
        onClose={() => setTrashFile(null)}
        onConfirm={confirmTrash}
        loading={busy}
        title="Move this file to the trash?"
        message={
          trashFile
            ? `“${trashFile.name}” will leave your library but stay recoverable in the Trash until you delete it permanently.`
            : ''
        }
        confirmLabel="Move to trash"
      />
      <ConfirmDialog
        open={Boolean(purgeFile)}
        onClose={() => setPurgeFile(null)}
        onConfirm={confirmPurge}
        loading={busy}
        title="Delete this file permanently?"
        message={
          purgeFile
            ? `“${purgeFile.name}” and its stored copy will be destroyed. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete permanently"
      />
    </>
  );

  return { handlers, dialogs };
}
