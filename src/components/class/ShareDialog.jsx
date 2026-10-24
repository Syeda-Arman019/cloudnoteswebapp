/**
 * ShareDialog — share one owned resource (file | folder | note) with a class
 * the user belongs to, or revoke an existing share.
 *
 * The resource arrives with its current `sharedClassId`/`sharedClassName`
 * (all three serializers expose them), so the dialog can show the current
 * state truthfully. Sharing is explicit per resource: nothing else in the
 * owner's library becomes visible, and unsharing makes it private again.
 */

import { useEffect, useState } from 'react';
import { Globe, Share2, Users } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { useNotifications } from '@/context/NotificationContext';
import { useClasses } from '@/context/ClassesContext';
import classesService from '@/services/classesService';

const TYPE_LABELS = { file: 'file', folder: 'folder', note: 'note' };

export default function ShareDialog({ open, onClose, resource, resourceType, onChanged = null }) {
  const { success, error: notifyError } = useNotifications();
  const { classes, status, reload } = useClasses();
  const [busy, setBusy] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState('');

  const sharedClassId = resource?.sharedClassId ?? null;

  useEffect(() => {
    if (open) {
      setSelectedClassId(sharedClassId ? String(sharedClassId) : '');
    }
  }, [open, sharedClassId]);

  if (!open || !resource) return null;

  const label = TYPE_LABELS[resourceType] || 'resource';
  const displayName = resource.name || resource.title || `#${resource.id}`;

  const handleShare = async () => {
    if (!selectedClassId) return;
    setBusy(true);
    try {
      await classesService.share({
        resourceType,
        resourceId: Number(resource.id),
        classId: Number(selectedClassId),
      });
      const target = classes.find((entry) => String(entry.id) === selectedClassId);
      success(
        'Shared with class',
        `“${displayName}” is now visible to ${target?.name || 'the class'}.`
      );
      onChanged?.();
      onClose();
    } catch (err) {
      notifyError('Could not share', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnshare = async () => {
    setBusy(true);
    try {
      await classesService.unshare({ resourceType, resourceId: Number(resource.id) });
      success('Share revoked', `“${displayName}” is private again.`);
      onChanged?.();
      onClose();
    } catch (err) {
      notifyError('Could not update sharing', err.message);
    } finally {
      setBusy(false);
    }
  };

  const empty = status === 'ready' && classes.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Share ${label}`}
      size="sm"
      icon={
        <span className="modal-icon modal-icon--info" aria-hidden="true">
          <Share2 size={20} />
        </span>
      }
      footer={
        sharedClassId ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="dangerSoft" onClick={handleUnshare} loading={busy}>
              Stop sharing
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleShare} loading={busy} disabled={!selectedClassId}>
              Share
            </Button>
          </>
        )
      }
    >
      <div className="share-dialog-body">
        <p className="share-resource-line">
          <strong>{displayName}</strong>
        </p>

        {sharedClassId ? (
          <div className="share-current">
            <Globe size={16} aria-hidden="true" />
            <span>
              Shared with <strong>{resource.sharedClassName || 'a class'}</strong>.
              Current members can view it; it stays private to everyone else.
            </span>
          </div>
        ) : (
          <>
            <p className="share-hint">
              Choose a class. Only current members of that class will be able to
              view this {label} — your notes and files stay private by default.
            </p>
            {status === 'loading' ? (
              <p className="share-hint">Loading your classes…</p>
            ) : empty ? (
              <div className="share-empty-classes">
                <Users size={18} aria-hidden="true" />
                <span>
                  You have not joined any classes yet. Create or join one first.
                </span>
              </div>
            ) : (
              <label className="field-cn">
                <span className="field-label">Class</span>
                <select
                  className="input-cn"
                  value={selectedClassId}
                  onChange={(event) => setSelectedClassId(event.target.value)}
                >
                  <option value="">Select a class…</option>
                  {classes.map((entry) => (
                    <option key={entry.id} value={String(entry.id)}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <p className="share-note-fineprint">
          Sharing never sends the file itself — members open it through the
          class. Revoking access, removing a member, or leaving the class
          always revokes it.
        </p>
      </div>
    </Modal>
  );
}
