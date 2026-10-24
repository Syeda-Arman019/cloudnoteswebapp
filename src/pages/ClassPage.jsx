/**
 * ClassPage — the class workspace (/classes/:id).
 *
 * Loads the class once, then renders the active tab from ?tab= so tab links
 * are shareable and survive refresh. A 404 means "not a member" (the API
 * deliberately never confirms a class exists to outsiders), so the
 * unauthorized view offers the join path instead of leaking details.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  MessagesSquare,
  FolderOpen,
  Info,
  Settings,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useDocumentTitle } from '@/hooks';
import { useClasses } from '@/context/ClassesContext';
import classesService from '@/services/classesService';
import Button from '@/components/common/Button';
import { LoadingState } from '@/components/common/StateViews';
import OverviewTab from '@/components/class/OverviewTab';
import MaterialsTab from '@/components/class/MaterialsTab';
import MembersTab from '@/components/class/MembersTab';
import ChatRoom from '@/components/class/ChatRoom';
import SettingsTab from '@/components/class/SettingsTab';

const TABS = [
  { key: 'overview', label: 'Overview', icon: Info },
  { key: 'materials', label: 'Materials', icon: FolderOpen },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'chat', label: 'Chat', icon: MessagesSquare },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function ClassPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { reload, get } = useClasses();

  const tab = TABS.some((entry) => entry.key === searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'overview';

  const [studyClass, setStudyClass] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | unauthorized | error
  const [loadError, setLoadError] = useState(null);

  useDocumentTitle(studyClass ? studyClass.name : 'Class');

  const loadClass = useCallback(async () => {
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    try {
      const loaded = await classesService.getById(id);
      setStudyClass(loaded);
      setStatus('ready');
      setLoadError(null);
      return loaded;
    } catch (err) {
      if (err.status === 404) setStatus('unauthorized');
      else {
        setLoadError(err.message);
        setStatus('error');
      }
      return null;
    }
  }, [id]);

  useEffect(() => {
    setStudyClass(null);
    setStatus('loading');
    loadClass();
  }, [loadClass]);

  const changeTab = (key) => {
    const params = {};
    if (key !== 'overview') params.tab = key;
    setSearchParams(params, { replace: true });
  };

  const handleLeft = async () => {
    await reload();
    navigate('/classes');
  };

  // Memoized so ChatRoom's polling effect isn't restarted on every parent
  // render — an inline arrow here previously caused an infinite
  // mark-read → reload → re-render loop (see ChatRoom's markReadRef).
  const handleUnreadCleared = useCallback(() => {
    reload();
  }, [reload]);

  if (status === 'loading') {
    return (
      <div className="page-container">
        <LoadingState label="Opening class…" />
      </div>
    );
  }

  if (status === 'unauthorized') {
    return (
      <div className="page-container">
        <div className="card-cn">
          <div className="empty-state" role="alert">
            <span className="empty-state-icon" aria-hidden="true">
              <ShieldAlert size={28} />
            </span>
            <h3>This class is not available to you</h3>
            <p>
              You are not a current member. Ask the class owner for an
              invitation link, then join with your own account.
            </p>
            <div className="empty-actions">
              <Button to="/classes/join">Join with an invite</Button>
              <Button variant="secondary" to="/classes">
                Back to my classes
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="page-container">
        <div className="card-cn">
          <div className="empty-state" role="alert">
            <h3>Could not open this class</h3>
            <p>{loadError}</p>
            <Button variant="secondary" onClick={loadClass}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isOwner = studyClass.myRole === 'owner';
  const unread = studyClass.unreadCount || 0;

  return (
    <div className="page-container class-page">
      <nav className="class-breadcrumb" aria-label="Class breadcrumb">
        <Link to="/classes" className="class-back">
          <ArrowLeft size={15} aria-hidden="true" /> My classes
        </Link>
        <span className="class-crumb-sep" aria-hidden="true">
          /
        </span>
        <span className="class-crumb-current">{studyClass.name}</span>
      </nav>

      <header className="class-header">
        <div className="class-header-main">
          <span className="class-header-mark" aria-hidden="true">
            <MessagesSquare size={22} />
          </span>
          <div className="class-header-text">
            <div className="class-title-row">
              <h1 className="page-title">{studyClass.name}</h1>
              <span className={`role-chip role-chip--${studyClass.myRole}`}>
                {isOwner ? 'Owner' : 'Member'}
              </span>
            </div>
            <p className="page-subtitle">
              {studyClass.description || 'No description yet.'}
            </p>
          </div>
        </div>
        <div className="class-header-actions">
          <span className="class-header-stat">
            <Users size={14} aria-hidden="true" />
            <strong>{studyClass.memberCount}</strong>{' '}
            {studyClass.memberCount === 1 ? 'member' : 'members'}
          </span>
          <Button
            size="sm"
            icon={<MessagesSquare size={14} />}
            onClick={() => changeTab('chat')}
          >
            Open chat
          </Button>
        </div>
      </header>

      <div className="class-tabs" role="tablist" aria-label="Class sections">
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.key;
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active}
              className={`class-tab${active ? ' is-active' : ''}`}
              onClick={() => changeTab(entry.key)}
            >
              <Icon size={15} aria-hidden="true" />
              {entry.label}
              {entry.key === 'chat' && unread > 0 && (
                <span className="class-tab-badge" aria-label={`${unread} unread`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="class-tab-panel" role="tabpanel">
        {tab === 'overview' && (
          <OverviewTab studyClass={studyClass} onOpenTab={changeTab} />
        )}
        {tab === 'materials' && <MaterialsTab classId={studyClass.id} />}
        {tab === 'members' && (
          <MembersTab
            classId={studyClass.id}
            studyClass={studyClass}
            onChangedClass={loadClass}
            onLeft={handleLeft}
          />
        )}
        {tab === 'chat' && (
          <ChatRoom
            classId={studyClass.id}
            onUnreadCleared={handleUnreadCleared}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab
            classId={studyClass.id}
            studyClass={studyClass}
            onChangedClass={loadClass}
            onDeleted={() => {
              reload();
              navigate('/classes');
            }}
          />
        )}
      </div>
    </div>
  );
}
