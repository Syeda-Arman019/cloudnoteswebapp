/**
 * OverviewTab — at-a-glance class facts: description, your role, member
 * count, when you joined, and quick jumps to chat/materials. Every number
 * comes from the API; nothing is estimated.
 *
 * Layout: an "About" card with structured metadata tiles, three separate
 * "Jump back in" action cards, and a Sharing section that states the
 * personal-vs-class rule plainly.
 */

import {
  CalendarClock,
  CheckCircle2,
  FolderOpen,
  Info,
  MessageSquare,
  Share2,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import Button from '@/components/common/Button';
import { formatDate } from '@/utils/dates';

export default function OverviewTab({ studyClass, onOpenTab = null }) {
  return (
    <div className="overview-grid">
      <section className="card-cn overview-card" aria-labelledby="about-class-title">
        <div className="overview-card-head">
          <span className="overview-card-icon" aria-hidden="true">
            <Info size={19} />
          </span>
          <h2 className="section-title" id="about-class-title">
            About this class
          </h2>
        </div>

        <p className="overview-description">
          {studyClass.description ||
            'No description yet — the owner can add one in Settings.'}
        </p>

        <dl className="overview-facts">
          <div className="overview-fact">
            <dt>
              <Users size={13} aria-hidden="true" /> Members
            </dt>
            <dd>{studyClass.memberCount}</dd>
          </div>
          <div className="overview-fact">
            <dt>
              <ShieldCheck size={13} aria-hidden="true" /> Your role
            </dt>
            <dd>{studyClass.myRole === 'owner' ? 'Owner' : 'Member'}</dd>
          </div>
          <div className="overview-fact">
            <dt>
              <CalendarClock size={13} aria-hidden="true" /> Class created
            </dt>
            <dd>{formatDate(studyClass.createdAt)}</dd>
          </div>
          <div className="overview-fact">
            <dt>
              <UserCheck size={13} aria-hidden="true" /> You joined
            </dt>
            <dd>{formatDate(studyClass.joinedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="overview-block" aria-labelledby="jump-back-title">
        <h2 className="section-title" id="jump-back-title">
          Jump back in
        </h2>
        <div className="overview-actions">
          <button
            type="button"
            className="overview-action"
            onClick={() => onOpenTab?.('chat')}
          >
            <MessageSquare size={20} aria-hidden="true" />
            <span>
              <strong>Class chat</strong>
              <em>Talk with current members</em>
            </span>
          </button>
          <button
            type="button"
            className="overview-action"
            onClick={() => onOpenTab?.('materials')}
          >
            <FolderOpen size={20} aria-hidden="true" />
            <span>
              <strong>Class materials</strong>
              <em>Files, folders and notes shared here</em>
            </span>
          </button>
          <button
            type="button"
            className="overview-action"
            onClick={() => onOpenTab?.('members')}
          >
            <Users size={20} aria-hidden="true" />
            <span>
              <strong>Members</strong>
              <em>See who is here — and who is online</em>
            </span>
          </button>
        </div>
      </section>

      <section className="card-cn overview-card">
        <div className="overview-card-head">
          <span className="overview-card-icon" aria-hidden="true">
            <Share2 size={19} />
          </span>
          <h2 className="section-title">Sharing with this class</h2>
        </div>

        <p className="overview-sharing">
          Personal files and notes stay private by default. Share something
          explicitly from your library — from a file's ⋯ menu or a note's
          action bar — and only current class members can view it.
        </p>

        <ul className="overview-sharing-points">
          <li>
            <ShieldCheck size={15} aria-hidden="true" />
            <span>
              <strong>Private by default.</strong> Joining a class never
              exposes your personal library.
            </span>
          </li>
          <li>
            <Users size={15} aria-hidden="true" />
            <span>
              <strong>Members only.</strong> Access is checked on every
              request, not just when a link is created.
            </span>
          </li>
          <li>
            <CheckCircle2 size={15} aria-hidden="true" />
            <span>
              <strong>Revoked instantly.</strong> Unsharing, removing a
              member, or leaving the class ends access immediately.
            </span>
          </li>
        </ul>

        <div className="overview-sharing-actions">
          <Button variant="secondary" to="/files" icon={<Share2 size={15} />}>
            Go to my files
          </Button>
          <Button variant="ghost" to="/notes">
            My notes
          </Button>
        </div>

        <p className="overview-fineprint">
          <CalendarClock size={13} aria-hidden="true" /> Resources you shared
          appear in the Materials tab.
        </p>
      </section>
    </div>
  );
}