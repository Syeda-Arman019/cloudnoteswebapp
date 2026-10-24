/**
 * RenameDialog — one small modal for renaming files and folders.
 * For files the extension is shown separately and locked (the backend
 * refuses type changes), so users edit the stem only.
 */

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';

export default function RenameDialog({
  open,
  onClose,
  onConfirm,
  title = 'Rename',
  item = null,
  extension = null,
  loading = false,
}) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open && item) {
      if (extension && item.name.toLowerCase().endsWith(`.${extension.toLowerCase()}`)) {
        setValue(item.name.slice(0, -(extension.length + 1)));
      } else {
        setValue(item.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  if (!item) return null;

  const trimmed = value.trim();
  const cannotSubmit = !trimmed || loading;

  const submit = (event) => {
    event?.preventDefault?.();
    if (cannotSubmit) return;
    onConfirm(extension ? `${trimmed}.${extension}` : trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      icon={
        <span className="modal-icon" aria-hidden="true">
          <Pencil size={19} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading} disabled={cannotSubmit}>
            Rename
          </Button>
        </>
      }
    >
      <form onSubmit={submit}>
        <label className="form-field-cn" htmlFor="rename-input">
          <span>{extension ? 'Name' : 'Folder name'}</span>
          <div className="input-with-suffix">
            <input
              id="rename-input"
              className="form-control-cn"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              maxLength={extension ? 240 : 80}
              autoFocus
              onFocus={(event) => event.target.select()}
            />
            {extension && <span className="input-suffix">.{extension}</span>}
          </div>
        </label>
        {extension && (
          <p className="form-hint-cn">
            The .{extension} extension stays attached — downloads always keep the original format.
          </p>
        )}
      </form>
    </Modal>
  );
}
