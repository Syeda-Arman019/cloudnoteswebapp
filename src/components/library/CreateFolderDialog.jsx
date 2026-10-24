/**
 * CreateFolderDialog — create one folder, optionally inside a parent.
 * The parent picker uses the flat folder list with simple name prefixes so
 * students can build Year → Semester → Subject without extra complexity.
 */

import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';

export default function CreateFolderDialog({
  open,
  onClose,
  onConfirm,
  folders = [],
  defaultParentId = null,
  loading = false,
}) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setParentId(defaultParentId || '');
    }
  }, [open, defaultParentId]);

  const trimmed = name.trim();
  const cannotSubmit = !trimmed || loading;

  const submit = (event) => {
    event?.preventDefault?.();
    if (cannotSubmit) return;
    onConfirm(trimmed, parentId === '' ? null : parentId);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New folder"
      size="sm"
      icon={
        <span className="modal-icon" aria-hidden="true">
          <FolderPlus size={19} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={cannotSubmit}>
            Create folder
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="form-field-cn" htmlFor="folder-name">
          <span>Folder name</span>
          <input
            id="folder-name"
            className="form-control-cn"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Semester 5, Cyber Security, Past Papers…"
            maxLength={80}
            autoFocus
          />
        </label>

        <label className="form-field-cn" htmlFor="folder-parent">
          <span>Inside (optional)</span>
          <select
            id="folder-parent"
            className="form-control-cn"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Study Library root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <p className="form-hint-cn">
          Folders are completely optional — uploads without one appear in All Files.
        </p>
      </form>
    </Modal>
  );
}
