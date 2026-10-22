/**
 * Modal — accessible dialog shell used by confirmations, forms, and menus.
 * - closes on Escape and backdrop click (backdrop clicks can be disabled)
 * - locks page scroll while open
 * - moves focus into the dialog on open
 */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer = null,
  size = 'md',
  icon = null,
  closeOnBackdrop = true,
  labelledBy,
}) {
  const dialogRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocused.current = document.activeElement;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element, or the dialog itself.
    const focusable = dialogRef.current?.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
    );
    (focusable || dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sizeClass = size === 'lg' ? 'modal-lg' : size === 'sm' ? 'modal-sm' : '';

  return (
    <div
      className="modal-backdrop-cn"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-cn ${sizeClass}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className="modal-header-cn">
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
            {icon}
            <h2 id="modal-title">{title}</h2>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body-cn">{children}</div>
        {footer && <div className="modal-footer-cn">{footer}</div>}
      </div>
    </div>
  );
}
