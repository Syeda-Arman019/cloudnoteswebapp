/**
 * FoldersPage — "My Folders": manage the whole hierarchy in one place.
 *
 * Every folder as a card (name, counts, subfolder link), with create,
 * rename, move-to-parent, and the safe two-step delete (non-empty folders
 * confirm with exact counts; files go to the Trash, never destroyed).
 * Clicking a folder opens it in My Study Space.
 */

import { useState } from 'react';
import { FolderOpen, FolderPlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/hooks';
import { useFilesStore } from '@/context/FilesContext';
import { useNotifications } from '@/context/NotificationContext';
import foldersService from '@/services/foldersService';
import Button from '@/components/common/Button';
import { EmptyState } from '@/components/common/StateViews';
import FolderCard from '@/components/library/FolderCard';
import CreateFolderDialog from '@/components/library/CreateFolderDialog';
import DeleteFolderDialog from '@/components/library/DeleteFolderDialog';
import MoveFolderDialog from '@/components/library/MoveFolderDialog';
import RenameDialog from '@/components/library/RenameDialog';

export default function FoldersPage() {
  useDocumentTitle('My folders');
  const navigate = useNavigate();
  const { folders, refreshLibrary } = useFilesStore();
  const { success, error: notifyError } = useNotifications();

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [renameFolder, setRenameFolder] = useState(null);
  const [moveFolder, setMoveFolder] = useState(null);
  const [deleteFolder, setDeleteFolder] = useState(null);
  const [busy, setBusy] = useState(false);

  const openFolder = (folder) => navigate(`/library?folder=${folder.id}`);

  const handleCreate = async (name, parentId) => {
    setCreating(true);
    try {
      const folder = await foldersService.create({ name, parentId });
      success('Folder created', `“${folder.name}” is ready.`);
      setCreateOpen(false);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not create folder', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (name) => {
    setBusy(true);
    try {
      await foldersService.update(renameFolder.id, { name });
      success('Folder renamed', `It is now “${name}”.`);
      setRenameFolder(null);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not rename folder', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (parentId) => {
    setBusy(true);
    try {
      await foldersService.update(moveFolder.id, { parentId });
      success('Folder moved', `“${moveFolder.name}” has a new home.`);
      setMoveFolder(null);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not move folder', err.message);
    } finally {
      setBusy(false);
    }
  };

  // Step 1: plain delete; a 409 with counts opens the confirm dialog.
  const requestDelete = async (folder) => {
    try {
      const result = await foldersService.remove(folder.id, { recursive: false });
      success(
        'Folder deleted',
        result?.trashedFiles
          ? `${result.trashedFiles} file${result.trashedFiles === 1 ? '' : 's'} moved to the Trash.`
          : `“${folder.name}” was removed.`
      );
      await refreshLibrary();
    } catch (err) {
      const details = err?.details?.details || null;
      if (err?.status === 409 && details) {
        setDeleteFolder({ ...folder, contents: details });
      } else {
        notifyError('Could not delete folder', err.message);
      }
    }
  };

  // Step 2: confirmed delete (recursive when the folder has contents).
  const confirmDelete = async (recursive) => {
    setBusy(true);
    try {
      const result = await foldersService.remove(deleteFolder.id, { recursive });
      success(
        'Folder deleted',
        result?.trashedFiles
          ? `${result.trashedFiles} file${result.trashedFiles === 1 ? '' : 's'} moved to the Trash — restore them any time.`
          : `“${deleteFolder.name}” was removed.`
      );
      setDeleteFolder(null);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not delete folder', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My folders</h1>
          <p className="page-subtitle">
            Build any structure you like — Academic Year → Semester → Subject, or your own.
          </p>
        </div>
        <Button icon={<FolderPlus size={16} />} onClick={() => setCreateOpen(true)}>
          New folder
        </Button>
      </div>

      {folders.length === 0 ? (
        <div className="card-cn">
          <EmptyState
            icon={<FolderOpen size={26} />}
            title="No folders yet"
            description="Folders are optional — but they keep semesters, subjects, and topics tidy. Create your first one, or upload files straight to the library root."
            action={
              <Button icon={<FolderPlus size={15} />} onClick={() => setCreateOpen(true)}>
                Create your first folder
              </Button>
            }
          />
        </div>
      ) : (
        <div className="folders-grid folders-grid--all">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              to={`/library?folder=${folder.id}`}
              onRename={setRenameFolder}
              onDelete={requestDelete}
            />
          ))}
        </div>
      )}

      <CreateFolderDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        folders={folders}
        loading={creating}
      />
      <RenameDialog
        open={Boolean(renameFolder)}
        onClose={() => setRenameFolder(null)}
        onConfirm={handleRename}
        item={renameFolder}
        loading={busy}
        title="Rename folder"
      />
      <MoveFolderDialog
        open={Boolean(moveFolder)}
        onClose={() => setMoveFolder(null)}
        onConfirm={handleMove}
        folder={moveFolder}
        folders={folders}
        loading={busy}
      />
      <DeleteFolderDialog
        folder={deleteFolder}
        onClose={() => setDeleteFolder(null)}
        onConfirm={confirmDelete}
        loading={busy}
      />
    </div>
  );
}
