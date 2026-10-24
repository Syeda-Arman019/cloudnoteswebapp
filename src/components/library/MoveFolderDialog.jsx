/**
 * MoveFolderDialog — re-home a folder under a different parent (or the
 * library root). The backend refuses moves into itself/its own subtree and
 * enforces the depth limit, surfacing those as toasts.
 */

import { useEffect, useState } from 'react';
import { FolderInput } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';

/** Collect a folder's descendants so we can exclude them from the picker. */
function descendantIds(folders, rootId) {
  const childrenOf = new Map();
  folders.forEach((folder) => {
    const key = folder.parentId || 'root';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key).push(folder.id);
  });
  const result = new Set();
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    (childrenOf.get(current) || []).forEach((childId) => {
      if (!result.has(childId)) {
        result.add(childId);
        stack.push(childId);
      }
    });
  }
  return result;
}

export default function MoveFolderDialog({
  open,
  onClose,
  onConfirm,
  folder = null,
  folders = [],
  loading = false,
}) {
  const [destination, setDestination] = useState('');

  useEffect(() => {
    if (open && folder) setDestination(folder.parentId || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder?.id]);

  if (!folder) return null;

  const blocked = descendantIds(folders, folder.id);
  blocked.add(folder.id);
  const candidates = folders.filter((item) => !blocked.has(item.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Move “${folder.name}”`}
      size="sm"
      icon={
        <span className="modal-icon modal-icon--info" aria-hidden="true">
          <FolderInput size={20} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(destination === '' ? null : destination)} loading={loading}>
            Move folder
          </Button>
        </>
      }
    >
      <label className="form-field-cn" htmlFor="move-folder-destination">
        <span>New parent folder</span>
        <select
          id="move-folder-destination"
          className="form-control-cn"
          value={destination}
          onChange={(event) => setDestination(event.target.value)}
        >
          <option value="">Study Library root</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="form-hint-cn">
        A folder can’t be moved inside itself or one of its own subfolders.
      </p>
    </Modal>
  );
}
