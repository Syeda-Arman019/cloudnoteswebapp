/**
 * DeleteFolderDialog — safe folder deletion in two steps.
 *
 * Step 1: the page attempts a plain delete. An empty folder simply goes
 * away; a non-empty folder answers 409 with exact counts, and this dialog
 * opens listing what would be affected.
 *
 * Step 2: the user confirms, and the recursive delete runs — every file
 * inside moves to the Trash (recoverable), never destroyed outright.
 */

import { AlertTriangle } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';

export default function DeleteFolderDialog({ folder, onClose, onConfirm, loading = false }) {
  if (!folder) return null;

  const { fileCount = 0, subfolderCount = 0 } = folder.contents || {};
  const hasContents = fileCount > 0 || subfolderCount > 0;

  return (
    <Modal
      open={Boolean(folder)}
      onClose={onClose}
      title={`Delete “${folder.name}”?`}
      size="sm"
      icon={
        <span className="modal-icon" aria-hidden="true">
          <AlertTriangle size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => onConfirm(hasContents)}
            loading={loading}
          >
            {hasContents ? 'Delete folder & trash contents' : 'Delete folder'}
          </Button>
        </>
      }
      closeOnBackdrop={!loading}
    >
      {hasContents ? (
        <>
          <p className="confirm-message">
            This folder isn’t empty. Deleting it will:
          </p>
          <ul className="delete-folder-list">
            {subfolderCount > 0 && (
              <li>
                Remove <strong>{subfolderCount}</strong> subfolder
                {subfolderCount === 1 ? '' : 's'} (files inside them move to the Trash too).
              </li>
            )}
            {fileCount > 0 && (
              <li>
                Move <strong>{fileCount}</strong> file
                {fileCount === 1 ? '' : 's'} to the Trash — you can restore every one of them
                from the Trash page.
              </li>
            )}
          </ul>
          <p className="form-hint-cn">
            Nothing is permanently deleted at this step.
          </p>
        </>
      ) : (
        <p className="confirm-message">
          This folder is empty and will be removed. This cannot be undone.
        </p>
      )}
    </Modal>
  );
}
