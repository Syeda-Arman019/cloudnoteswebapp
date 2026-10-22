/**
 * SettingsPage — profile, appearance, security, and account management.
 *
 * Every form here is wired to the profile service (demo-mode aware). Real
 * password verification, profile updates, and account deletion switch on the
 * moment VITE_API_URL points at the Flask API (Part 2).
 */

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  KeyRound,
  LogOut,
  Moon,
  Palette,
  Save,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import { useDocumentTitle } from '@/hooks';
import { profileService } from '@/services/profileService';
import {
  hasErrors,
  validateChangePasswordForm,
  validateProfileForm,
} from '@/utils/validation';
import { getInitials } from '@/utils/dates';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import { TextField } from '@/components/common/FormFields';
import DemoBanner from '@/components/common/DemoBanner';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'account', label: 'Account', icon: AlertTriangle },
];

function Card({ title, description, children, danger = false }) {
  return (
    <section className={`card-cn${danger ? ' danger-zone' : ''}`}>
      <div className="card-header-cn">
        <div>
          <h3>{title}</h3>
          {description && (
            <p style={{ margin: '0.25rem 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              {description}
            </p>
          )}
        </div>
      </div>
      <div className="card-body-cn">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, updateUser, logout, isDemoMode } = useAuth();
  const { theme, setTheme } = useTheme();
  const { success, error: notifyError, info } = useNotifications();
  const navigate = useNavigate();

  const [activeSection, setActiveSection] = useState('profile');

  /* ------------------------------ profile ------------------------------ */
  const [profileForm, setProfileForm] = useState({ fullName: user?.fullName || '' });
  const [profileErrors, setProfileErrors] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    setProfileForm({ fullName: user?.fullName || '' });
  }, [user?.fullName]);

  const saveProfile = async (event) => {
    event.preventDefault();
    const validation = validateProfileForm(profileForm);
    setProfileErrors(validation);
    if (hasErrors(validation)) return;

    setSavingProfile(true);
    try {
      const updated = await profileService.update({ fullName: profileForm.fullName });
      updateUser(updated);
      success('Profile updated', 'Your display name has been saved.');
    } catch (err) {
      notifyError('Could not update profile', err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  /* ---------------------------- password ------------------------------- */
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [changingPassword, setChangingPassword] = useState(false);

  const changePassword = async (event) => {
    event.preventDefault();
    const validation = validateChangePasswordForm(passwordForm);
    setPasswordErrors(validation);
    if (hasErrors(validation)) return;

    setChangingPassword(true);
    try {
      const result = await profileService.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
      if (result.demoMode) {
        info(
          'Demo mode — password not changed',
          'The API is not connected yet, so no password was verified or stored. This flow activates in Part 2.'
        );
      } else {
        success('Password changed', 'Use your new password the next time you sign in.');
      }
    } catch (err) {
      notifyError('Could not change password', err.message);
    } finally {
      setChangingPassword(false);
    }
  };

  /* ----------------------------- account ------------------------------- */
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);

  const deleteReady =
    deletePhrase.trim().toUpperCase() === 'DELETE' &&
    (isDemoMode || deletePassword.length > 0);

  const handleLogout = async () => {
    setConfirmLogout(false);
    await logout();
    navigate('/', { replace: true });
  };

  const handleDeleteAccount = async () => {
    if (!deleteReady) return;
    setDeleteBusy(true);
    try {
      await profileService.deleteAccount(deletePassword);
      success(
        'Account deleted',
        isDemoMode
          ? 'Your demo account and its data were removed.'
          : 'Your account and all of its data were removed.'
      );
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      notifyError('Could not delete account', err.message);
      setDeleteBusy(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Profile &amp; settings</h1>
          <p className="page-subtitle">
            Manage your details, appearance, security, and account.
          </p>
        </div>
        {isDemoMode && <DemoBanner />}
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                type="button"
                className={activeSection === section.id ? 'is-active' : ''}
                onClick={() => setActiveSection(section.id)}
                aria-current={activeSection === section.id ? 'page' : undefined}
              >
                <Icon size={16} aria-hidden="true" />
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="settings-panels">
          {/* --------------------------- PROFILE --------------------------- */}
          {activeSection === 'profile' && (
            <>
              <Card
                title="Profile details"
                description="How you appear inside CloudNotes."
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.4rem' }}>
                  <span className="avatar avatar--lg" aria-hidden="true">
                    {getInitials(user?.fullName)}
                  </span>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--heading)' }}>
                      {user?.fullName}
                    </div>
                    <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>{user?.email}</div>
                    <div style={{ marginTop: '0.4rem' }}>
                      <span className="badge-cn badge-primary">{user?.role || 'Member'}</span>
                    </div>
                  </div>
                </div>

                <form onSubmit={saveProfile} noValidate>
                  <TextField
                    label="Display name"
                    name="fullName"
                    value={profileForm.fullName}
                    onChange={(event) => {
                      setProfileForm((current) => ({ ...current, fullName: event.target.value }));
                      if (profileErrors.fullName) setProfileErrors({});
                    }}
                    error={profileErrors.fullName}
                    required
                    autoComplete="name"
                    disabled={savingProfile}
                  />

                  <TextField
                    label="Email address"
                    name="email"
                    type="email"
                    value={user?.email || ''}
                    onChange={() => {}}
                    hint="Contact your administrator to change the email on file."
                    disabled
                  />

                  <Button type="submit" loading={savingProfile} icon={<Save size={15} />}>
                    Save profile
                  </Button>
                </form>
              </Card>

              <Card
                title="Change password"
                description="Choose a strong password you do not use elsewhere."
              >
                <form onSubmit={changePassword} noValidate>
                  <TextField
                    label="Current password"
                    name="currentPassword"
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(event) => {
                      setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }));
                      if (passwordErrors.currentPassword) setPasswordErrors((c) => ({ ...c, currentPassword: null }));
                    }}
                    error={passwordErrors.currentPassword}
                    autoComplete="current-password"
                    required
                    disabled={changingPassword}
                  />
                  <TextField
                    label="New password"
                    name="newPassword"
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(event) => {
                      setPasswordForm((current) => ({ ...current, newPassword: event.target.value }));
                      if (passwordErrors.newPassword) setPasswordErrors((c) => ({ ...c, newPassword: null }));
                    }}
                    error={passwordErrors.newPassword}
                    hint="At least 8 characters, with a letter and a number."
                    autoComplete="new-password"
                    required
                    disabled={changingPassword}
                  />
                  <TextField
                    label="Confirm new password"
                    name="confirmPassword"
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(event) => {
                      setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }));
                      if (passwordErrors.confirmPassword) setPasswordErrors((c) => ({ ...c, confirmPassword: null }));
                    }}
                    error={passwordErrors.confirmPassword}
                    autoComplete="new-password"
                    required
                    disabled={changingPassword}
                  />

                  <Button
                    type="submit"
                    variant="secondary"
                    loading={changingPassword}
                    icon={<KeyRound size={15} />}
                  >
                    Update password
                  </Button>
                </form>
              </Card>
            </>
          )}

          {/* -------------------------- APPEARANCE ------------------------- */}
          {activeSection === 'appearance' && (
            <Card
              title="Theme"
              description="Choose how CloudNotes looks. Your preference is saved on this device."
            >
              <div className="theme-options">
                <button
                  type="button"
                  className={`theme-option${theme === 'light' ? ' is-selected' : ''}`}
                  onClick={() => setTheme('light')}
                  aria-pressed={theme === 'light'}
                >
                  <span className="theme-preview light" aria-hidden="true">
                    <span className="tp-side" />
                    <span className="tp-main">
                      <span className="tp-line" />
                      <span className="tp-line" style={{ width: '80%' }} />
                      <span className="tp-line" style={{ width: '60%' }} />
                    </span>
                  </span>
                  <span className="theme-name">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Sun size={15} aria-hidden="true" />
                      Light
                    </span>
                    <span className="check" aria-hidden="true">✓</span>
                  </span>
                </button>

                <button
                  type="button"
                  className={`theme-option${theme === 'dark' ? ' is-selected' : ''}`}
                  onClick={() => setTheme('dark')}
                  aria-pressed={theme === 'dark'}
                >
                  <span className="theme-preview dark" aria-hidden="true">
                    <span className="tp-side" />
                    <span className="tp-main">
                      <span className="tp-line" />
                      <span className="tp-line" style={{ width: '80%' }} />
                      <span className="tp-line" style={{ width: '60%' }} />
                    </span>
                  </span>
                  <span className="theme-name">
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Moon size={15} aria-hidden="true" />
                      Dark
                    </span>
                    <span className="check" aria-hidden="true">✓</span>
                  </span>
                </button>
              </div>

              <div className="setting-row" style={{ marginTop: '1.4rem' }}>
                <div className="setting-info">
                  <h4>Current preference</h4>
                  <p>
                    {theme === 'dark'
                      ? 'Dark mode is active across the entire app.'
                      : 'Light mode is active across the entire app.'}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
                  Switch to {theme === 'light' ? 'dark' : 'light'}
                </Button>
              </div>
            </Card>
          )}

          {/* --------------------------- ACCOUNT --------------------------- */}
          {activeSection === 'account' && (
            <>
              <Card title="Session" description="Sign out of CloudNotes on this device.">
                <div className="setting-row">
                  <div className="setting-info">
                    <h4>Log out</h4>
                    <p>You will return to the landing page and need to sign in again.</p>
                  </div>
                  <Button variant="secondary" icon={<LogOut size={15} />} onClick={() => setConfirmLogout(true)}>
                    Log out
                  </Button>
                </div>
                <div className="setting-row">
                  <div className="setting-info">
                    <h4>Keyboard shortcuts</h4>
                    <p>
                      Everything is reachable by keyboard — press <code>Tab</code> to move
                      through controls and <code>Esc</code> to close dialogs.
                    </p>
                  </div>
                  <Link to="/notes" className="link-button" style={{ fontWeight: 600, fontSize: '0.86rem' }}>
                    My notes
                  </Link>
                </div>
              </Card>

              <Card
                danger
                title="Danger zone"
                description="Permanent actions — please read carefully."
              >
                <div className="setting-row">
                  <div className="setting-info">
                    <h4>Delete this account</h4>
                    <p>
                      {isDemoMode
                        ? 'Removes the demo account and all demo notes/categories stored in this browser.'
                        : 'Permanently removes your account and every note you own. This cannot be undone.'}
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    icon={<Trash2 size={15} />}
                    onClick={() => {
                      setDeletePhrase('');
                      setDeletePassword('');
                      setConfirmDelete(true);
                    }}
                  >
                    Delete account
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
        tone="info"
        title="Log out of CloudNotes?"
        message="You can sign back in at any time with your email and password."
        confirmLabel="Log out"
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDeleteAccount}
        loading={deleteBusy}
        title="Delete your account?"
        message={
          <>
            This permanently removes your profile and all of your notes and categories.{' '}
            {isDemoMode && 'In demo mode this clears browser-stored demo data only. '}
            This action cannot be undone.
            <div style={{ marginTop: '0.9rem' }}>
              <label className="form-label-cn" htmlFor="delete-phrase">
                Type <strong>DELETE</strong> to confirm
              </label>
              <input
                id="delete-phrase"
                className="form-control-cn"
                value={deletePhrase}
                onChange={(event) => setDeletePhrase(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
            {!isDemoMode && (
              <div style={{ marginTop: '0.75rem' }}>
                <label className="form-label-cn" htmlFor="delete-password">
                  Your password
                </label>
                <input
                  id="delete-password"
                  type="password"
                  className="form-control-cn"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  placeholder="Enter your password to confirm"
                  autoComplete="current-password"
                />
              </div>
            )}
          </>
        }
        confirmLabel="Permanently delete"
        confirmDisabled={!deleteReady}
      />
    </div>
  );
}
