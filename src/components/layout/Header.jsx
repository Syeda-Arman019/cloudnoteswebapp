/**
 * Header — sticky top bar: mobile menu trigger, global search (jumps to
 * the combined Search page), Upload action (opens the global queue from
 * anywhere), theme toggle, and the account menu.
 */

import { useState } from 'react';
import { LogOut, Menu, Moon, Search, Settings, Sun, Upload, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useFilesStore } from '@/context/FilesContext';
import { getInitials } from '@/utils/dates';
import Dropdown from '@/components/common/Dropdown';
import DemoBanner from '@/components/common/DemoBanner';

export default function Header({ onMenuClick }) {
  const { user, logout, isDemoMode } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { openUpload } = useFilesStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchValue, setSearchValue] = useState('');

  const isDark = theme === 'dark';

  const submitSearch = (event) => {
    event.preventDefault();
    const query = searchValue.trim();
    const params = query ? `?q=${encodeURIComponent(query)}` : '';
    navigate(`/search${params}`);
  };

  return (
    <header className="app-header">
      <button
        type="button"
        className="btn-icon mobile-menu-btn"
        onClick={onMenuClick}
        aria-label="Open navigation menu"
        aria-controls="app-sidebar"
      >
        <Menu size={20} />
      </button>

      <form className="search-field header-search" onSubmit={submitSearch} role="search">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="form-control-cn"
          placeholder="Search notes and files…"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          aria-label="Search notes and files"
        />
      </form>

      {isDemoMode && (
        <span className="header-demo">
          <DemoBanner />
        </span>
      )}

      <div className="header-spacer" />

      <div className="app-header-actions">
        <button
          type="button"
          className="btn-cn btn-primary btn-sm header-upload-btn"
          onClick={() => openUpload()}
        >
          <Upload size={15} aria-hidden="true" />
          <span className="upload-btn-label">Upload</span>
        </button>

        <button
          type="button"
          className="btn-icon"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <Dropdown
          menuLabel="Account menu"
          trigger={({ toggle, props }) => (
            <button type="button" className="header-user-chip" onClick={toggle} {...props}>
              <span className="avatar" aria-hidden="true">
                {getInitials(user?.fullName)}
              </span>
              <span className="chip-name">{user?.fullName}</span>
            </button>
          )}
        >
          {({ close }) => (
            <>
              <div className="dropdown-label-cn">Signed in as {user?.email}</div>
              <button
                type="button"
                className="dropdown-item-cn"
                role="menuitem"
                onClick={() => {
                  close();
                  navigate('/settings');
                }}
              >
                <UserRound size={16} aria-hidden="true" />
                Profile &amp; account
              </button>
              <button
                type="button"
                className="dropdown-item-cn"
                role="menuitem"
                onClick={() => {
                  close();
                  navigate('/settings');
                }}
              >
                <Settings size={16} aria-hidden="true" />
                Settings
              </button>
              <div className="dropdown-divider-cn" />
              <button
                type="button"
                className="dropdown-item-cn is-danger"
                role="menuitem"
                onClick={() => {
                  close();
                  logout();
                }}
              >
                <LogOut size={16} aria-hidden="true" />
                Log out
              </button>
            </>
          )}
        </Dropdown>
      </div>
    </header>
  );
}
