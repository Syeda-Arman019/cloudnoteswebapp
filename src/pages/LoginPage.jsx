/**
 * LoginPage — email/password sign-in with client-side validation, a loading
 * state, and friendly error messages. On success it returns the user to the
 * page they originally requested.
 *
 * Authentication calls go through authService, which talks to the Flask API
 * when configured and otherwise runs in clearly-labelled demo mode.
 */

import { useState } from 'react';
import { ArrowRight, Cloud, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks';
import { validateLoginForm, hasErrors } from '@/utils/validation';
import Button from '@/components/common/Button';
import { TextField } from '@/components/common/FormFields';
import DemoBanner from '@/components/common/DemoBanner';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function LoginPage() {
  useDocumentTitle('Log in');
  const { login, isAuthenticated, isDemoMode, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from || '/dashboard';

  if (status === 'authenticated' || isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const updateField = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);

    const validation = validateLoginForm(values);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSubmitting(true);
    try {
      await login(values);
      navigate(from, { replace: true });
    } catch (error) {
      setFormError(error.message || 'We could not sign you in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <aside className="auth-aside">
        <div>
          <span className="brand">
            <span className="brand-mark" aria-hidden="true">
              <Cloud size={19} />
            </span>
            <span className="brand-text">
              Cloud<span>Notes</span>
            </span>
          </span>
          <h2>Welcome back to your organized space.</h2>
          <p>
            Pick up where you left off — your pinned notes, categories, and recent work are
            waiting.
          </p>
          <ul className="auth-points">
            <li>
              <span className="point-icon">
                <Zap size={14} />
              </span>
              Dashboard with pinned and recent notes
            </li>
            <li>
              <span className="point-icon">
                <Sparkles size={14} />
              </span>
              Powerful search, filters, and sorting
            </li>
            <li>
              <span className="point-icon">
                <ShieldCheck size={14} />
              </span>
              Your notes, your account, your control
            </li>
          </ul>
        </div>
        <p className="auth-aside-quote">
          “Your thoughts, organized anywhere.”
        </p>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-topbar">
            <Link to="/" className="brand" aria-label="Back to CloudNotes home">
              <span className="brand-mark brand-mark--sm" aria-hidden="true">
                <Cloud size={16} />
              </span>
              <span className="brand-text">
                Cloud<span>Notes</span>
              </span>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {isDemoMode && <DemoBanner compact />}
              <ThemeToggle />
            </div>
          </div>

          <div className="card-cn">
            <h1>Log in</h1>
            <p className="auth-subtitle">
              Enter your details to access your notes and dashboard.
            </p>

            {isDemoMode && (
              <div className="notice-bar notice-bar--warning" style={{ marginBottom: '1.2rem' }}>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  <strong>Demo mode:</strong> the backend API is not connected yet. Sign in
                  with <code>demo@cloudnotes.app</code> and any password to preview the app —
                  credentials are not verified or stored.
                </span>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <TextField
                label="Email address"
                name="email"
                type="email"
                value={values.email}
                onChange={updateField('email')}
                error={errors.email}
                placeholder="you@example.com"
                autoComplete="email"
                required
                autoFocus
                disabled={submitting}
              />

              <TextField
                label="Password"
                name="password"
                type="password"
                value={values.password}
                onChange={updateField('password')}
                error={errors.password}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                disabled={submitting}
              />

              {formError && (
                <div className="notice-bar notice-bar--warning" role="alert" style={{ marginBottom: '1rem' }}>
                  {formError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                block
                loading={submitting}
                icon={!submitting ? <ArrowRight size={16} /> : undefined}
              >
                Log in
              </Button>
            </form>

            <div className="divider-or">New to CloudNotes?</div>

            <p className="auth-footer-note" style={{ marginTop: 0 }}>
              Don't have an account?{' '}
              <Link to="/register" replace>
                <strong>Create one</strong>
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
