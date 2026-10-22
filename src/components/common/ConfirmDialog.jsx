/**
 * ConfirmDialog — a consistent confirmation step for destructive actions.
 */

import { AlertTriangle, Info } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  loading = false,
  confirmDisabled = false,
}) {
  const isDanger = tone === 'danger';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      icon={
        <span className={`modal-icon${isDanger ? '' : ' modal-icon--info'}`} aria-hidden="true">
          {isDanger ? <AlertTriangle size={22} /> : <Info size={22} />}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={isDanger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </>
      }
      closeOnBackdrop={!loading}
    >
      <div className="confirm-message">{message}</div>
    </Modal>
  );
}
