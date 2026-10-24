/**
 * ClassesPage — "My classes": every class the signed-in student belongs to.
 *
 * Cards show name, description, role, member count and the REAL unread
 * message count from the API (never fabricated). Creating a class or
 * joining with an invite code are the two entry points; opening a card
 * goes to the class workspace.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, Plus, UserPlus, Users, MessageSquare, GraduationCap } from 'lucide-react';
import { useDocumentTitle } from '@/hooks';
import { useNotifications } from '@/context/NotificationContext';
import { useClasses } from '@/context/ClassesContext';
import classesService from '@/services/classesService';
import Button from '@/components/common/Button';
import Modal from '@/components/common/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { formatDate } from '@/utils/dates';

const MAX_NAME = 120;
const MAX_DESC = 400;

function CreateClassModal({ open, onClose, onCreated }) {
  const { success, error: notifyError } = useNotifications();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (event) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      const created = await classesService.create({
        name: name.trim(),
        description: description.trim(),
      });
      success('Class created', `“${created.name}” is ready. Invite classmates from Settings.`);
      onCreated(created);
    } catch (err) {
      notifyError('Could not create class', err.message);
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a class"
      icon={
        <span className="modal-icon" aria-hidden="true">
          <GraduationCap size={22} />
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={!name.trim()}>
            Create class
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="form-stack">
        <label className="field-cn">
          <span className="field-label">Class name *</span>
          <input
            className="input-cn"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. 23 Batch"
            maxLength={MAX_NAME}
            autoFocus
            required
          />
        </label>
        <label className="field-cn">
          <span className="field-label">Description (optional)</span>
          <textarea
            className="input-cn"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="e.g. Computer Science, Section B — 2023 intake"
            rows={3}
            maxLength={MAX_DESC}
          />
          <span className="field-hint">{description.length}/{MAX_DESC}</span>
        </label>
        <p className="form-note">
          You become the owner: you can invite classmates, share materials and
          manage the class chat.
        </p>
      </form>
    </Modal>
  );
}

export default function ClassesPage() {
  useDocumentTitle('My classes');
  const navigate = useNavigate();
  const { classes, status, error, reload } = useClasses();
  const [creating, setCreating] = useState(false);

  // Refresh once on entry so unread counts are current.
  useEffect(() => {
    reload().catch(() => {
      /* error state is rendered from context */
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreated = (created) => {
    setCreating(false);
    navigate(`/classes/${created.id}`);
  };

  let body;
  if (status === 'loading' && classes.length === 0) {
    body = <LoadingState label="Loading your classes…" />;
  } else if (status === 'error' && classes.length === 0) {
    body = (
      <ErrorState
        title="Could not load your classes"
        message={error}
        onRetry={() => reload().catch(() => {})}
      />
    );
  } else if (classes.length === 0) {
    body = (
      <div className="card-cn">
        <EmptyState
          icon={<GraduationCap size={26} />}
          title="No classes yet"
          description="Create a class for your batch, or join one with an invitation link from a classmate."
          action={
            <div className="empty-actions">
              <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
                Create a class
              </Button>
              <Button variant="secondary" to="/classes/join" icon={<UserPlus size={16} />}>
                Join a class
              </Button>
            </div>
          }
        />
      </div>
    );
  } else {
    body = (
      <div className="class-grid">
        {classes.map((entry) => (
          <Link key={entry.id} to={`/classes/${entry.id}`} className="class-card">
            <div className="class-card-head">
              <span className="class-card-mark" aria-hidden="true">
                <GraduationCap size={18} />
              </span>
              {entry.unreadCount > 0 && (
                <span
                  className="class-unread-badge"
                  aria-label={`${entry.unreadCount} unread messages`}
                >
                  {entry.unreadCount > 99 ? '99+' : entry.unreadCount}
                </span>
              )}
            </div>
            <h3 className="class-card-name">{entry.name}</h3>
            {entry.description && <p className="class-card-desc">{entry.description}</p>}
            <div className="class-card-meta">
              <span className={`role-chip role-chip--${entry.myRole}`}>
                {entry.myRole === 'owner' ? 'Owner' : 'Member'}
              </span>
              <span title="Members">
                <Users size={13} aria-hidden="true" /> {entry.memberCount}
              </span>
              <span title="Unread messages">
                <MessageSquare size={13} aria-hidden="true" /> {entry.unreadCount || 0}
              </span>
              <span title="Joined">
                <CalendarClock size={13} aria-hidden="true" />{' '}
                {formatDate(entry.joinedAt)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My classes</h1>
          <p className="page-subtitle">
            Classes you own or belong to — materials, members and chat in one place.
          </p>
        </div>
        <div className="page-header-actions">
          <Button
            variant="secondary"
            to="/classes/join"
            icon={<UserPlus size={16} />}
          >
            Join a class
          </Button>
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            Create class
          </Button>
        </div>
      </div>

      {body}

      <CreateClassModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={openCreated}
      />
    </div>
  );
}
