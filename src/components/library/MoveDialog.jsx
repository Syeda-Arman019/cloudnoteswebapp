/**
 * MoveDialog — pick a destination folder for one file (or fail loudly).
 * Built from the shared folder list; root is always an option.
 */

import { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';

export default function MoveDialog({
  open,
  onClose,
  onConfirm,
  folders = [],
  file = null,
  loading = false,
}) {
  const [destination, setDestination] = useState('');

  useEffect(() => {
    if (open) setDestination(file?.folderId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, file?.id]);

  if (!file) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move “${file.name}”`}
      size="sm"
      icon={
        <span className="modal-icon modal-icon--info" aria-hidden="true">
          <FolderOpen size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(destination === '' ? null : destination)}
            loading={loading}
          >
            Move file
          </Button>
        </>
      }
    >
      <label className="form-field-cn" htmlFor="move-destination">
        <span>Destination folder</span>
        <select
          id="move-destination"
          className="form-control-cn"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        >
          <option value="">Study Library root (no folder)</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.name}
            </option>
          ))}
        </select>
      </label>
      {file.folderId && destination === '' && (
        <p className="form-hint-cn">The file will be moved out of “{file.folderName}”.</p>
      )}
    </Modal>
  );
}
