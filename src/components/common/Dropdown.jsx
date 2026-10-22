/**
 * Dropdown — click-to-open menu with outside-click and Escape dismissal.
 * Items are passed as children so callers fully control content; the wrapper
 * handles positioning, ARIA state, and keyboard behaviour.
 */

import { useCallback, useRef, useState } from 'react';
import { useOnClickOutside } from '@/hooks';

export default function Dropdown({
  trigger,
  children,
  align = 'right',
  menuLabel = 'Menu',
  className = '',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const close = useCallback(() => setOpen(false), []);
  useOnClickOutside(containerRef, close, open);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      containerRef.current?.querySelector('button')?.focus();
    }
  };

  const alignClass = align === 'left' ? 'dropdown-left' : align === 'up' ? 'dropdown-up' : 'dropdown-right';

  return (
    <div
      className={`dropdown-cn ${className}`.trim()}
      ref={containerRef}
      onKeyDown={handleKeyDown}
    >
      {trigger({
        open,
        toggle: () => (disabled ? undefined : setOpen((current) => !current)),
        props: {
          'aria-expanded': open,
          'aria-haspopup': 'menu',
          'aria-controls': open ? 'dropdown-menu' : undefined,
          disabled,
        },
      })}
      {open && (
        <div className={`dropdown-menu-cn ${alignClass}`} id="dropdown-menu" role="menu">
          {typeof children === 'function' ? children({ close }) : children}
        </div>
      )}
    </div>
  );
}
