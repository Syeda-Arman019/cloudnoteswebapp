/**
 * Switch — an accessible toggle built on a native checkbox.
 */

import { useId } from 'react';

export default function Switch({ checked, onChange, label, disabled = false, id }) {
  const autoId = useId();
  const inputId = id || autoId;

  return (
    <label className="switch-cn" htmlFor={inputId} title={label}>
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="track" aria-hidden="true" />
      <span className="thumb" aria-hidden="true" />
    </label>
  );
}
