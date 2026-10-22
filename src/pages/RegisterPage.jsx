/**
 * RegisterPage — account creation with full client-side validation
 * (name, email format, password strength, confirmation) plus loading/success
 * states. Passwords are sent to the auth service and never persisted locally.
 */

import { useState } from 'react';
import { ArrowRight, Cloud, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks';
import { validateRegisterForm, hasErrors } from '@/utils/validation';
import Button from '@/components/common/Button';
import { TextField } from '@/components/common/FormFields';
import DemoBanner from '@/components/common/DemoBanner';
import ThemeToggle from '@/components/common/ThemeToggle';
import { PASSWORD_MIN_LENGTH } from '@/utils/constants';

export default function RegisterPage() {
  useDocumentTitle('Create account');
  const { register, status, isDemoMode } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  const updateField = (field) => (event) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
    if (formError) setFormError(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);

    const validation = validateRegisterForm(values);
    setErrors(validation);
    if (hasErrors(validation)) return;

    setSubmitting(true);
    try {
      await register({
        fullName: values.fullName,
        email: values.email,
        password: values.password,
      });
      setSucceeded(true);
      window.setTimeout(() => navigate('/dashboard', { replace: true }), 900);
    } catch (error) {
      setFormError(error.message || 'We could not create your account. Please try again.');
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
          <h2>Start with a clean, organized space.</h2>
          <p>
            Create your account and keep personal, study, work, and project notes together in
            one beautiful dashboard.
          </p>
          <ul className="auth-points">
            <li>
              <span className="point-icon">
                <Zap size={14} />
              </span>
              Set up in less than a minute
            </li>
            <li>
              <span className="point-icon">
                <Sparkles size={14} />
              </span>
              Categories, tags, pinning, and search included
            </li>
            <li>
              <span className="point-icon">
                <ShieldCheck size={14} />
              </span>
              Your password never touches browser storage
            </li>
          </ul>
        </div>
        <p className="auth-aside-quote">“Your thoughts, organized anywhere.”</p>
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
            <h1>Create your account</h1>
            <p className="auth-subtitle">
              Fill in your details to start organizing your notes.
            </p>

            {isDemoMode && (
              <div className="notice-bar notice-bar--warning" style={{ marginBottom: '1.2rem' }}>
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  <strong>Demo mode:</strong> accounts are stored only in this browser for
                  interface preview. Real authentication arrives with the API in Part 2.
                </span>
              </div>
            )}

            {succeeded ? (
              <div className="notice-bar" role="status" style={{ background: 'var(--success-soft)' }}>
                <ShieldCheck size={16} aria-hidden="true" style={{ color: 'var(--success)' }} />
                <span>
                  <strong>Account created!</strong> Taking you to your dashboard…
                </span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate>
                <TextField
                  label="Full name"
                  name="fullName"
                  value={values.fullName}
                  onChange={updateField('fullName')}
                  error={errors.fullName}
                  placeholder="Alex Morgan"
                  autoComplete="name"
                  required
                  autoFocus
                  disabled={submitting}
                />

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
                  disabled={submitting}
                />

                <TextField
                  label="Password"
                  name="password"
                  type="password"
                  value={values.password}
                  onChange={updateField('password')}
                  error={errors.password}
                  hint={`At least ${PASSWORD_MIN_LENGTH} characters, including a letter and a number.`}
                  autoComplete="new-password"
                  placeholder="Create a password"
                  required
                  disabled={submitting}
                />

                <TextField
                  label="Confirm password"
                  name="confirmPassword"
                  type="password"
                  value={values.confirmPassword}
                  onChange={updateField('confirmPassword')}
                  error={errors.confirmPassword}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
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
                  Create account
                </Button>
              </form>
            )}

            <div className="divider-or">Already have an account?</div>

            <p className="auth-footer-note" style={{ marginTop: 0 }}>
              <Link to="/login" replace>
                <strong>Log in instead</strong>
              </Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
