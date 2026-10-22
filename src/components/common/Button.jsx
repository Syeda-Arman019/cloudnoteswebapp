/**
 * Button — the single button primitive for the whole app.
 * Renders a react-router <Link> when `to` is provided so link-buttons keep
 * identical styling and keyboard behaviour.
 */

import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

const VARIANT_CLASS = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  soft: 'btn-soft',
  danger: 'btn-danger',
  dangerSoft: 'btn-danger-soft',
};

const SIZE_CLASS = { sm: 'btn-sm', md: '', lg: 'btn-lg' };

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  to,
  icon = null,
  loading = false,
  block = false,
  disabled = false,
  className = '',
  ...rest
}) {
  const classes = [
    'btn-cn',
    VARIANT_CLASS[variant] || VARIANT_CLASS.primary,
    SIZE_CLASS[size] ?? '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      {loading ? <Loader2 className="spin" size={16} aria-hidden="true" /> : icon}
      {children}
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
}
