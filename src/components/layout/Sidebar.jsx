/**
 * Sidebar — primary navigation for the authenticated app.
 * Also used as the mobile drawer content (via the `isDrawer` prop).
 */

import {
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Settings,
  StickyNote,
  X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useNotesStore } from '@/context/NotesContext';
import { getInitials } from '@/utils/dates';

function NavItem({ to, icon: Icon, label, end = false, count = null, onClick = null }) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        onClick={onClick}
        className={({ isActive }) => `nav-item-link${isActive ? ' active' : ''}`}
      >
        <Icon size={18} aria-hidden="true" />
        <span>{label}</span>
        {count !== null && <span className="nav-count">{count}</span>}
      </NavLink>
    </li>
  );
}

export default function Sidebar({ isOpen = false, isDrawer = false, onNavigate = null, onClose = null }) {
  const { user, logout } = useAuth();
  const { stats, categories, notesByCategory } = useNotesStore();

  const handleLogout = async () => {
    if (onNavigate) onNavigate();
    await logout();
  };

  return (
    <aside
      className={`sidebar${isOpen ? ' is-open' : ''}`}
      id="app-sidebar"
      aria-label="Main navigation"
    >
      <div className="sidebar-head">
        <NavLink
          to="/dashboard"
          className="brand"
          onClick={onNavigate}
          aria-label="CloudNotes dashboard"
        >
          <span className="brand-mark brand-mark--sm" aria-hidden="true">
            <LayoutDashboard size={16} />
          </span>
          <span className="brand-text">
            Cloud<span>Notes</span>
          </span>
        </NavLink>
        {isDrawer && (
          <button
            type="button"
            className="btn-icon drawer-only"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={19} />
          </button>
        )}
      </div>

      <nav className="sidebar-nav">
        <div>
          <p className="nav-section-label">Overview</p>
          <ul className="nav-list">
            <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" end onClick={onNavigate} />
            <NavItem to="/notes" icon={StickyNote} label="All notes" count={stats.total} onClick={onNavigate} />
            <NavItem to="/categories" icon={FolderOpen} label="Categories" count={stats.categories} onClick={onNavigate} />
          </ul>
        </div>

        <div>
          <p className="nav-section-label">Your categories</p>
          <ul className="nav-list">
            {categories.slice(0, 6).map((category) => (
              <li key={category.id}>
                <NavLink
                  to={`/notes?category=${encodeURIComponent(category.id)}`}
                  onClick={onNavigate}
                  className="nav-item-link"
                >
                  <span className={`cat-dot ${category.color || 'default'}`} aria-hidden="true" />
                  <span>{category.name}</span>
                  <span className="nav-count">{notesByCategory[category.id] || 0}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

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
          <button
            type="button"
            className="btn-icon"
            onClick={handleLogout}
            aria-label="Log out"
            title="Log out"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </aside>
  );
}
