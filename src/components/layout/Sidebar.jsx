/**
 * Sidebar — primary navigation for the authenticated app.
 *
 * Sections: Overview, Classes (My classes with unread badge, Join),
 * Study Library (My Study Space, All files, My folders, Pinned, Recent,
 * Trash), Notes (all notes, categories), Preferences.
 *
 * Doubles as the mobile drawer (via `isDrawer`) and supports a collapsed
 * desktop rail (via `collapsed`, icons only with tooltips).
 */

import {
  Clock,
  FileStack,
  Files,
  FolderOpen,
  FolderTree,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Pin,
  PanelLeftClose,
  PanelLeft,
  Settings,
  StickyNote,
  Tags,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNotesStore } from '@/context/NotesContext';
import { useFilesStore } from '@/context/FilesContext';
import { useClasses } from '@/context/ClassesContext';
import { getInitials } from '@/utils/dates';

function NavItem({ to, icon: Icon, label, end = false, count = null, onClick = null }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        title={label}
        className={({ isActive }) => `nav-item-link${isActive ? ' active' : ''}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span className="nav-label">{label}</span>
        {count !== null && <span className="nav-count">{count}</span>}
      </NavLink>
    </li>
  );
}

export default function Sidebar({
  isOpen = false,
  isDrawer = false,
  onNavigate = null,
  onClose = null,
  collapsed = false,
  onToggleCollapse = null,
}) {
  const { user, logout } = useAuth();
  const { stats, categories, notesByCategory } = useNotesStore();
  const { storage } = useFilesStore();
  const { unreadTotal } = useClasses();

  const handleLogout = async () => {
    if (onNavigate) onNavigate();
    await logout();
  };

  return (
    <aside
      className={`sidebar${isOpen ? ' is-open' : ''}${collapsed ? ' is-collapsed' : ''}`}
      id="app-sidebar"
      aria-label="Main navigation"
    >
      <div className="sidebar-head">
        <NavLink to="/dashboard" className="brand" onClick={onNavigate} aria-label="CloudNotes dashboard">
          <span className="brand-mark brand-mark--sm" aria-hidden="true">
            <FileStack size={16} />
          </span>
          <span className="brand-text">
            Cloud<span>Notes</span>
          </span>
        </NavLink>
        <div className="sidebar-head-actions">
          {onToggleCollapse && (
            <button
              type="button"
              className="btn-icon sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
            </button>
          )}
          {isDrawer && (
            <button type="button" className="btn-icon drawer-only" onClick={onClose} aria-label="Close menu">
              <X size={19} />
            </button>
          )}
        </div>
      </div>

      <nav className="sidebar-nav">
        <div>
          <p className="nav-section-label">Overview</p>
          <ul className="nav-list">
            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" end onClick={onNavigate} />
          </ul>
        </div>

        <div>
          <p className="nav-section-label">Classes</p>
          <ul className="nav-list">
            <NavItem
              to="/classes"
              icon={GraduationCap}
              label="My classes"
              // Unread messages only — never a class count, so the badge
              // always means exactly "messages waiting" and disappears
              // when the chats have been read.
              count={unreadTotal > 0 ? unreadTotal : null}
              onClick={onNavigate}
            />
            <NavItem to="/classes/join" icon={UserPlus} label="Join a class" onClick={onNavigate} />
          </ul>
        </div>

        <div>
          <p className="nav-section-label">Study Library</p>
          <ul className="nav-list">
            <NavItem to="/library" icon={FolderOpen} label="My Study Space" onClick={onNavigate} />
            <NavItem to="/files" icon={Files} label="All files" count={storage.fileCount || null} onClick={onNavigate} />
            <NavItem to="/folders" icon={FolderTree} label="My folders" onClick={onNavigate} />
            <NavItem to="/pinned" icon={Pin} label="Pinned" onClick={onNavigate} />
            <NavItem to="/recent" icon={Clock} label="Recent" onClick={onNavigate} />
            <NavItem
              to="/trash"
              icon={Trash2}
              label="Trash"
              count={storage.trashedCount || null}
              onClick={onNavigate}
            />
          </ul>
        </div>

        <div>
          <p className="nav-section-label">Notes</p>
          <ul className="nav-list">
            <NavItem to="/notes" icon={StickyNote} label="My notes" count={stats.total} onClick={onNavigate} />
            <NavItem to="/categories" icon={Tags} label="Categories" count={stats.categories} onClick={onNavigate} />
          </ul>
        </div>

        {categories.length > 0 && (
          <div>
            <p className="nav-section-label">Your categories</p>
            <ul className="nav-list">
              {categories.slice(0, 6).map((category) => (
                <li key={category.id}>
                  <NavLink
                    to={`/notes?category=${encodeURIComponent(category.id)}`}
                    onClick={onNavigate}
                    title={category.name}
                    className="nav-item-link"
                  >
                    <span className={`cat-dot ${category.color || 'default'}`} aria-hidden="true" />
                    <span className="nav-label">{category.name}</span>
                    <span className="nav-count">{notesByCategory[category.id] || 0}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="nav-section-label">Preferences</p>
          <ul className="nav-list">
            <NavItem to="/settings" icon={Settings} label="Settings" onClick={onNavigate} />
          </ul>
        </div>
      </nav>

      <div className="sidebar-foot">
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">
            {getInitials(user?.fullName)}
          </span>
          <div className="user-meta">
            <div className="user-name" title={user?.fullName}>
              {user?.fullName}
            </div>
            <div className="user-email" title={user?.email}>
              {user?.email}
            </div>
          </div>
          <button type="button" className="btn-icon" onClick={handleLogout} aria-label="Log out" title="Log out">
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
