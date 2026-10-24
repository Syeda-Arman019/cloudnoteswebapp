/**
 * JoinClassPage — the invitation landing page (/classes/join).
 *
 * Flow: the student opens the invite link (/classes/join?token=…) or pastes
 * the code manually → the BACKEND validates it and returns only safe class
 * details (name, description, owner, expiry) → the student confirms → the
 * membership is created server-side → the class opens.
 *
 * Invalid, expired, revoked or exhausted invitations each get a clear,
 * honest message; being already a member is handled idempotently.
 *
 * The page is presentational only: every state below mirrors a real API
 * response — nothing about the class is fabricated client-side.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Crown,
  Info,
  Link2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks';
import { useClasses } from '@/context/ClassesContext';
import { useNotifications } from '@/context/NotificationContext';
import classesService from '@/services/classesService';
import Button from '@/components/common/Button';
import { LoadingState } from '@/components/common/StateViews';

function extractToken(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  // Accept a pasted full link, a ?token= query, or the bare token.
  try {
    const url = new URL(raw, window.location.origin);
    const fromQuery = url.searchParams.get('token');
    if (fromQuery) return fromQuery;
    const match = raw.match(/token=([^&\s]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    /* not a URL — treat as a bare token */
  }
  return raw;
}

const STEPS = [
  {
    title: 'Ask the class owner',
    text: 'Owners create invitations under Class → Settings → Invitations, then send you the link.',
  },
  {
    title: 'Paste it above',
    text: 'A full link, a ?token= URL or the bare code all work — we check it before anything happens.',
  },
  {
    title: 'Confirm and join',
    text: 'You see the class name and owner first, then join with your own account.',
  },
];

export default function JoinClassPage() {
  useDocumentTitle('Join a class');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { reload } = useClasses();
  const { success, error: notifyError } = useNotifications();

  const tokenFromUrl = searchParams.get('token') || '';
  const [input, setInput] = useState(tokenFromUrl);
  const [preview, setPreview] = useState(null); // safe class details
  const [status, setStatus] = useState(tokenFromUrl ? 'loading' : 'idle');
  const [loadError, setLoadError] = useState(null);
  const [joining, setJoining] = useState(false);

  const checkToken = useCallback(async (token) => {
    if (!token) {
      setPreview(null);
      setStatus('idle');
      return;
    }
    setStatus('loading');
    setLoadError(null);
    try {
      const result = await classesService.previewInvitation(token);
      setPreview(result);
      setStatus('ready');
    } catch (err) {
      setPreview(null);
      setLoadError(err.message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    if (tokenFromUrl) checkToken(tokenFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenFromUrl]);

  const submitCode = (event) => {
    event.preventDefault();
    const token = extractToken(input);
    if (!token) return;
    // Normalize the URL so reloads keep working.
    setSearchParams(token === tokenFromUrl ? {} : { token }, { replace: true });
    checkToken(token);
  };

  const retryToken = tokenFromUrl || extractToken(input);

  const confirmJoin = async () => {
    const token = tokenFromUrl || extractToken(input);
    if (!token || joining) return;
    setJoining(true);
    try {
      const result = await classesService.join(token);
      await reload();
      const target = result.class;
      if (result.alreadyMember) {
        success('Already a member', `Opening ${target?.name || 'your class'}…`);
      } else {
        success('Welcome!', `You joined ${target?.name || 'the class'}.`);
      }
      navigate(target ? `/classes/${target.id}` : '/classes');
    } catch (err) {
      notifyError('Could not join the class', err.message);
      setLoadError(err.message);
      setStatus('error');
      setJoining(false);
    }
  };

  return (
    <div className="page-container page-container--narrow join-page">
      <nav className="class-breadcrumb" aria-label="Breadcrumb">
        <Link to="/classes" className="class-back">
          <ArrowLeft size={15} aria-hidden="true" /> My classes
        </Link>
        <span className="class-crumb-sep" aria-hidden="true">
          /
        </span>
        <span className="class-crumb-current">Join a class</span>
      </nav>

      <header className="join-hero">
        <span className="join-hero-icon" aria-hidden="true">
          <UserPlus size={23} />
        </span>
        <div className="join-hero-text">
          <h1 className="join-hero-title">Join a class</h1>
          <p className="join-hero-subtitle">
            Paste an invitation link to preview the class — its name and owner —
            before anything is shared with you. You always join with your own
            CloudNotes account.
          </p>
        </div>
      </header>

      <section className="card-cn join-card" aria-labelledby="join-invite-title">
        <div className="join-card-head">
          <span className="join-card-icon" aria-hidden="true">
            <Link2 size={18} />
          </span>
          <div>
            <h2 className="section-title" id="join-invite-title">
              Your invitation
            </h2>
            <p className="join-card-sub">Paste the whole link, or just the code.</p>
          </div>
        </div>

        <form onSubmit={submitCode}>
          <div className="field-cn">
            <label className="field-label" htmlFor="join-invite-input">
              Invitation link or code
            </label>
            <div className="join-input-row">
              <input
                id="join-invite-input"
                className="input-cn join-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://…/classes/join?token=…  or  the code"
                spellCheck={false}
                autoComplete="off"
                aria-describedby="join-input-hint"
              />
              <Button type="submit" icon={<Link2 size={15} />} disabled={!input.trim()}>
                Preview class
              </Button>
            </div>
            <span className="field-hint" id="join-input-hint">
              Nothing is shared with the class until you confirm on the next step.
            </span>
          </div>
        </form>

        {status === 'loading' && (
          <div className="join-status">
            <LoadingState label="Checking invitation…" />
          </div>
        )}

        {status === 'error' && (
          <div className="join-result join-result--error" role="alert">
            <span className="join-result-icon" aria-hidden="true">
              <XCircle size={30} />
            </span>
            <h3>This invitation cannot be used</h3>
            <p>{loadError}</p>
            <p className="join-fineprint">
              Ask the class owner to send you a fresh invitation link.
            </p>
            <div className="empty-actions">
              {retryToken && (
                <Button variant="secondary" onClick={() => checkToken(retryToken)}>
                  Try again
                </Button>
              )}
              <Button variant="ghost" to="/classes">
                Back to my classes
              </Button>
            </div>
          </div>
        )}

        {status === 'ready' && preview && (
          <div className="join-preview">
            <div className="join-preview-head">
              <span className="join-class-mark" aria-hidden="true">
                <UserPlus size={20} />
              </span>
              <div className="join-preview-title">
                <span className="join-preview-eyebrow">You&rsquo;re invited to join</span>
                <h3 className="join-preview-name">{preview.class.name}</h3>
              </div>
              {preview.alreadyMember && (
                <span className="join-preview-pill">
                  <CheckCircle2 size={13} aria-hidden="true" /> Already a member
                </span>
              )}
            </div>

            <p className="join-preview-desc">
              {preview.class.description || 'This class has no description yet.'}
            </p>

            <dl className="join-meta">
              <div>
                <dt>
                  <Crown size={13} aria-hidden="true" /> Class owner
                </dt>
                <dd>{preview.class.ownerName}</dd>
              </div>
              {preview.expiresAt && (
                <div>
                  <dt>
                    <Clock3 size={13} aria-hidden="true" /> Invitation expires
                  </dt>
                  <dd>{new Date(preview.expiresAt).toLocaleString()}</dd>
                </div>
              )}
            </dl>

            <div className="join-preview-foot">
              {preview.alreadyMember ? (
                <>
                  <p className="join-already">
                    <CheckCircle2 size={16} aria-hidden="true" /> You are already a
                    member of this class.
                  </p>
                  <div className="join-actions">
                    <Button variant="secondary" to="/classes">
                      Back to my classes
                    </Button>
                    <Button onClick={() => navigate(`/classes/${preview.class.id}`)}>
                      Open class
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="join-fineprint">
                    You will join with your own account — your classmates see your
                    display name, never shared credentials.
                  </p>
                  <div className="join-actions">
                    <Button variant="secondary" to="/classes">
                      Cancel
                    </Button>
                    <Button onClick={confirmJoin} loading={joining}>
                      Join this class
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="join-help" aria-labelledby="join-help-title">
        <h2 className="join-help-title" id="join-help-title">
          <Info size={15} aria-hidden="true" /> How do I get an invitation?
        </h2>
        <ol className="join-help-steps">
          {STEPS.map((step, index) => (
            <li className="join-step" key={step.title}>
              <span className="join-step-index" aria-hidden="true">
                {index + 1}
              </span>
              <strong>{step.title}</strong>
              <span className="join-step-text">{step.text}</span>
            </li>
          ))}
        </ol>
        <p className="join-help-note">
          Invitations can expire or be revoked at any time. Joining never needs a
          phone number or a shared password — your own account is enough.
        </p>
      </section>
    </div>
  );
}
