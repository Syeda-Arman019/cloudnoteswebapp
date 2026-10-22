/**
 * Form field primitives.
 *
 * TextField wraps a labelled input with inline validation messages and an
 * optional show/hide toggle for password fields. SelectField and TextAreaField
 * follow the same label/hint/error contract so every form in the app behaves
 * identically.
 */

import { useId, useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

function FieldError({ id, message }) {
  if (!message) return null;
  return (
    <p className="form-error" id={id} role="alert">
      <AlertCircle size={13} aria-hidden="true" />
      {message}
    </p>
  );
}

export function TextField({
  label,
  name,
  type = 'text',
  value,
  onChange,
  error,
  hint,
  required = false,
  autoComplete,
  placeholder,
  disabled = false,
  autoFocus = false,
  className = '',
  ...rest
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label className="form-label-cn" htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <div className={isPassword ? 'input-wrap' : undefined}>
        <input
          id={id}
          name={name}
          type={isPassword && revealed ? 'text' : type}
          value={value}
          onChange={onChange}
          className={`form-control-cn${error ? ' is-invalid' : ''}`}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            className="input-affix"
            onClick={() => setRevealed((current) => !current)}
            aria-label={revealed ? 'Hide password' : 'Show password'}
            aria-pressed={revealed}
            title={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        )}
      </div>
      {hint && !error && (
        <span className="form-hint" id={hintId}>
          {hint}
        </span>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function TextAreaField({
  label,
  name,
  value,
  onChange,
  error,
  hint,
  required = false,
  rows = 4,
  placeholder,
  disabled = false,
  className = '',
  ...rest
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label className="form-label-cn" htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={onChange}
        className={`form-control-cn${error ? ' is-invalid' : ''}`}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        {...rest}
      />
      {hint && !error && (
        <span className="form-hint" id={hintId}>
          {hint}
        </span>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}

export function SelectField({
  label,
  name,
  value,
  onChange,
  options = [],
  error,
  hint,
  required = false,
  disabled = false,
  placeholder,
  className = '',
  ...rest
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label className="form-label-cn" htmlFor={id}>
          {label}
          {required && (
            <span className="req" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        className={`form-control-cn${error ? ' is-invalid' : ''}`}
        disabled={disabled}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={[error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <span className="form-hint" id={hintId}>
          {hint}
        </span>
      )}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
