/**
 * SettingsTab — class settings.
 *
 * Owner: rename/describe the class, create/revoke invitations (expiry +
 * optional usage limits; the raw token appears exactly once at creation and
 * is only ever stored hashed on the server), and delete the class.
 * Members: read-only info + leave. Everyone sees honest permission notes —
 * hidden controls are never the security boundary (the API re-checks).
 */

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Trash2, XCircle } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import classesService from '@/services/classesService';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { formatDate } from '@/utils/dates';

const MAX_NAME = 120;
const MAX_DESC = 400;

const EXPIRY_OPTIONS = [
  { value: 24, label: 'Expires in 24 hours' },
  { value: 168, label: 'Expires in 7 days' },
  { value: 720, label: 'Expires in 30 days' },
  { value: '', label: 'No expiry' },
];

function statusLabel(status) {
  return {
    active: 'Active',
    expired: 'Expired',
    revoked: 'Revoked',
    exhausted: 'Fully used',
  }[status] || status;
}

function InvitationsPanel({ classId }) {
  const { success, error: notifyError } = useNotifications();
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState(168);
  const [maxUses, setMaxUses] = useState('');
  const [freshToken, setFreshToken] = useState(null); // shown once
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

  const load = async () => {
    try {
      const list = await classesService.invitations(classId);
      setInvitations(list);
    } catch (err) {
      notifyError('Could not load invitations', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  const inviteLink = freshToken
    ? `${window.location.origin}/classes/join?token=${encodeURIComponent(freshToken)}`
    : '';

  const create = async () => {
    setCreating(true);
    try {
      const invitation = await classesService.createInvitation(classId, {
        expiresInHours: expiresInHours === '' ? undefined : Number(expiresInHours),
        maxUses: maxUses === '' ? undefined : Number(maxUses),
      });
      setFreshToken(invitation.token);
      setCopied(false);
      await load();
      success('Invitation created', 'Copy the link and send it to your classmate.');
    } catch (err) {
      notifyError('Could not create invitation', err.message);
    } finally {
      setCreating(false);
    }
  };

  const revoke = async (invitation) => {
    setRevokingId(invitation.id);
    try {
      await classesService.revokeInvitation(classId, invitation.id);
      await load();
      success('Invitation revoked', 'That link will no longer work.');
    } catch (err) {
      notifyError('Could not revoke invitation', err.message);
    } finally {
      setRevokingId(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      notifyError('Copy failed', 'Select the link and copy it manually.');
    }
  };

  return (
    <section className="card-cn settings-card">
      <h2 className="section-title">Invitations</h2>
      <p className="settings-hint">
        Invitation links are single-purpose and secret: only a hash is stored
        server-side, and the raw link appears here once. You can set an expiry
        and a usage limit, and revoke a link at any time.
      </p>

      <div className="invite-create-row">
        <label className="field-cn">
          <span className="field-label">Expiry</span>
          <select
            className="input-cn"
            value={expiresInHours}
            onChange={(event) =>
              setExpiresInHours(event.target.value === '' ? '' : Number(event.target.value))
            }
          >
            {EXPIRY_OPTIONS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field-cn">
          <span className="field-label">Max uses (optional)</span>
          <input
            className="input-cn"
            type="number"
            min="1"
            max="500"
            placeholder="Unlimited"
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
        </label>
        <Button
          onClick={create}
          loading={creating}
          icon={<Link2 size={15} />}
          className="invite-create-btn"
        >
          Create invitation
        </Button>
      </div>

      {freshToken && (
        <div className="invite-fresh" role="status">
          <p>
            <strong>New invitation link</strong> — copy it now; it will not be
            shown again.
          </p>
          <div className="invite-fresh-row">
            <input
              className="input-cn invite-link-input"
              readOnly
              value={inviteLink}
              onFocus={(event) => event.target.select()}
              aria-label="Invitation link"
            />
            <Button
              variant="secondary"
              icon={copied ? <Check size={15} /> : <Copy size={15} />}
              onClick={copyLink}
            >
              {copied ? 'Copied' : 'Copy'}
            </Button>
            <Button variant="ghost" onClick={() => setFreshToken(null)}>
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="settings-hint">Loading invitations…</p>
      ) : invitations.length === 0 ? (
        <p className="settings-hint">No invitations yet — create one above.</p>
      ) : (
        <ul className="invite-list">
          {invitations.map((invitation) => (
            <li key={invitation.id} className="invite-row">
              <span className={`invite-status invite-status--${invitation.status}`}>
                {statusLabel(invitation.status)}
              </span>
              <span className="invite-meta">
                {invitation.expiresAt
                  ? `Expires ${formatDate(invitation.expiresAt)}`
                  : 'Never expires'}
                {' · '}
                {invitation.maxUses
                  ? `${invitation.useCount}/${invitation.maxUses} used`
                  : `${invitation.useCount} used`}
                {' · '}
                Created {formatDate(invitation.createdAt)}
              </span>
              {invitation.status === 'active' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<XCircle size={14} />}
                  onClick={() => revoke(invitation)}
                  loading={revokingId === invitation.id}
                >
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function SettingsTab({ classId, studyClass, onChangedClass = null, onDeleted = null }) {
  const { success, error: notifyError } = useNotifications();
  const isOwner = studyClass.myRole === 'owner';

  const [name, setName] = useState(studyClass.name);
  const [description, setDescription] = useState(studyClass.description || '');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(studyClass.name);
    setDescription(studyClass.description || '');
  }, [studyClass]);

  const save = async (event) => {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await classesService.update(classId, {
        name: name.trim(),
        description: description.trim(),
      });
      success('Class updated');
      onChangedClass?.();
    } catch (err) {
      notifyError('Could not update class', err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteClass = async () => {
    setDeleting(true);
    try {
      await classesService.remove(classId);
      success('Class deleted', 'Members, chat and invitations were removed. Shared resources went back to private.');
      onDeleted?.();
    } catch (err) {
      notifyError('Could not delete class', err.message);
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (!isOwner) {
    return (
      <div className="settings-stack">
        <section className="card-cn settings-card">
          <h2 className="section-title">Class settings</h2>
          <p className="settings-hint">
            Only the class owner can change the name, description and
            invitations. You can leave the class from the Members tab.
          </p>
          <dl className="overview-facts">
            <div>
              <dt>Class name</dt>
              <dd>{studyClass.name}</dd>
            </div>
            <div>
              <dt>Your role</dt>
              <dd>Member</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  return (
    <div className="settings-stack">
      <section className="card-cn settings-card">
        <h2 className="section-title">Class details</h2>
        <form onSubmit={save} className="form-stack">
          <label className="field-cn">
            <span className="field-label">Class name *</span>
            <input
              className="input-cn"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={MAX_NAME}
              required
            />
          </label>
          <label className="field-cn">
            <span className="field-label">Description</span>
            <textarea
              className="input-cn"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={MAX_DESC}
              placeholder="What is this class about?"
            />
            <span className="field-hint">{description.length}/{MAX_DESC}</span>
          </label>
          <div>
            <Button type="submit" loading={saving} disabled={!name.trim()}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <InvitationsPanel classId={classId} />

      <section className="card-cn settings-card settings-card--danger">
        <h2 className="section-title">Danger zone</h2>
        <p className="settings-hint">
          Deleting the class removes its members, invitations and chat history.
          Files and notes you shared become private again — your personal data
          is never deleted.
        </p>
        <Button
          variant="danger"
          icon={<Trash2 size={15} />}
          onClick={() => setConfirmDelete(true)}
        >
          Delete this class
        </Button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={deleteClass}
        loading={deleting}
        title="Delete this class?"
        message={`“${studyClass.name}” and its chat history will be permanently removed for every member. Shared resources return to private ownership.`}
        confirmLabel="Delete class"
      />
    </div>
  );
}
