/**
 * MembersTab — current members with REAL presence (a heartbeat every 30s;
 * the server counts unique users with a fresh heartbeat, so multiple tabs
 * count once and stale sessions expire).
 *
 * Owner controls: remove a member, transfer ownership. Everyone can leave —
 * the backend enforces the safeguards (transfer first / delete instead of
 * leaving an empty class) and those messages are surfaced verbatim.
 */

import { useCallback, useEffect, useState } from 'react';
import { UserMinus, UserCheck, LogOut, CircleDot } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useNotifications } from '@/context/NotificationContext';
import classesService from '@/services/classesService';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';
import { getInitials } from '@/utils/dates';
import { formatDate } from '@/utils/dates';

const PRESENCE_POLL_MS = 30000;

export default function MembersTab({ classId, studyClass, onChangedClass = null, onLeft = null }) {
  const { user } = useAuth();
  const { success, error: notifyError } = useNotifications();

  const [members, setMembers] = useState([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState(null);

  const [confirmAction, setConfirmAction] = useState(null);
  // { type: 'remove' | 'transfer' | 'leave', member }
  const [busy, setBusy] = useState(false);

  const isOwner = studyClass.myRole === 'owner';

  const load = useCallback(async () => {
    try {
      const result = await classesService.members(classId);
      setMembers(result.members);
      setOnlineCount(result.onlineCount);
      setLoadError(null);
      setStatus('ready');
    } catch (err) {
      if (status !== 'ready') {
        setLoadError(err.message);
        setStatus('error');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    setStatus('loading');
    load();
    const timer = window.setInterval(load, PRESENCE_POLL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const runConfirmed = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === 'remove') {
        await classesService.removeMember(classId, confirmAction.member.user.id);
        success(
          'Member removed',
          `${confirmAction.member.user.fullName} no longer has access to this class.`
        );
        await load();
        onChangedClass?.();
      } else if (confirmAction.type === 'transfer') {
        await classesService.transferOwnership(classId, confirmAction.member.user.id);
        success(
          'Ownership transferred',
          `${confirmAction.member.user.fullName} is now the class owner.`
        );
        await load();
        onChangedClass?.();
      } else if (confirmAction.type === 'leave') {
        const result = await classesService.leave(classId);
        if (result?.left) {
          success('You left the class', 'Its materials and chat are no longer visible to you.');
          onLeft?.();
        }
      }
      setConfirmAction(null);
    } catch (err) {
      // Backend safeguard messages (transfer_required / delete_class_instead)
      // are user-facing — show them as-is instead of masking them.
      notifyError('Could not complete that', err.message);
      setConfirmAction(null);
    } finally {
      setBusy(false);
    }
  };

  if (status === 'loading') return <LoadingState label="Loading members…" />;
  if (status === 'error') {
    return <ErrorState title="Could not load members" message={loadError} onRetry={load} />;
  }

  // user.id is normalized to a string; member ids come back numeric — compare as strings.
  const myId = user?.id == null ? null : String(user.id);
  const me = members.find((entry) => String(entry.user.id) === myId);
  const owner = members.find((entry) => entry.role === 'owner');

  const confirmDialogProps = (() => {
    if (!confirmAction) return { open: false };
    if (confirmAction.type === 'remove') {
      return {
        open: true,
        title: 'Remove this member?',
        message: `${confirmAction.member.user.fullName} will immediately lose access to this class's materials, chat and shared resources.`,
        confirmLabel: 'Remove member',
        tone: 'danger',
      };
    }
    if (confirmAction.type === 'transfer') {
      return {
        open: true,
        title: 'Transfer ownership?',
        message: `${confirmAction.member.user.fullName} will become the class owner and can manage settings, invitations and members. You will become a regular member.`,
        confirmLabel: 'Transfer ownership',
        tone: 'neutral',
      };
    }
    return {
      open: true,
      title: 'Leave this class?',
      message:
        'You will lose access to this class’s materials and chat. You can rejoin later with a new invitation.',
      confirmLabel: 'Leave class',
      tone: 'danger',
    };
  })();

  return (
    <div className="members-panel">
      <div className="members-toolbar">
        <h2 className="section-title">
          {members.length} member{members.length === 1 ? '' : 's'}
        </h2>
        <span className={`members-online${onlineCount > 0 ? ' is-online' : ''}`}>
          <CircleDot size={14} aria-hidden="true" />
          {onlineCount} online now
        </span>
      </div>

      {members.length === 0 ? (
        <EmptyState title="No members found" description="That should not happen — try again." />
      ) : (
        <ul className="member-list">
          {members.map((entry) => {
            const isSelf = String(entry.user.id) === myId;
            return (
              <li key={entry.user.id} className="member-row">
                <span className="chat-avatar member-avatar" aria-hidden="true">
                  {entry.user.initials || getInitials(entry.user.fullName)}
                </span>
                <div className="member-info">
                  <span className="member-name">
                    {entry.user.fullName}
                    {isSelf && <em> (you)</em>}
                  </span>
                  <span className="member-joined">Joined {formatDate(entry.joinedAt)}</span>
                </div>
                <span
                  className={`member-presence${entry.isOnline ? ' is-online' : ''}`}
                  title={entry.isOnline ? 'Online now' : 'Offline'}
                >
                  <span className="presence-dot" aria-hidden="true" />
                  {entry.isOnline ? 'Online' : 'Offline'}
                </span>
                <span className={`role-chip role-chip--${entry.role}`}>
                  {entry.role === 'owner' ? 'Owner' : 'Member'}
                </span>

                {isOwner && !isSelf && entry.role !== 'owner' && (
                  <div className="member-actions">
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserCheck size={14} />}
                      onClick={() => setConfirmAction({ type: 'transfer', member: entry })}
                    >
                      Make owner
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<UserMinus size={14} />}
                      onClick={() => setConfirmAction({ type: 'remove', member: entry })}
                    >
                      Remove
                    </Button>
                  </div>
                )}
                {isOwner && entry.role === 'owner' && !isSelf && (
                  <span className="member-note">Owner</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="members-footer">
        {me && me.role !== 'owner' && (
          <Button
            variant="dangerSoft"
            icon={<LogOut size={15} />}
            onClick={() => setConfirmAction({ type: 'leave', member: me })}
          >
            Leave class
          </Button>
        )}
        {me && me.role === 'owner' && (
          <p className="members-owner-note">
            You own this class. To leave, transfer ownership to another member
            first — or delete the class in Settings.
          </p>
        )}
        {!isOwner && owner && (
          <p className="members-owner-note">
            Class owner: {owner.user.fullName}
          </p>
        )}
      </div>

      <ConfirmDialog
        {...confirmDialogProps}
        onClose={() => setConfirmAction(null)}
        onConfirm={runConfirmed}
        loading={busy}
      />
    </div>
  );
}
