/**
 * Small reusable hooks shared across the app.
 */

import { useEffect } from 'react';

/** Sets document.title while the component is mounted. */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previous = document.title;
    document.title = title
      ? `${title} · CloudNotes`
      : 'CloudNotes — Your thoughts, organized anywhere.';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/**
 * Calls the handler when a click lands outside the referenced element.
 * Listens for `click` (not `mousedown`) so items inside a menu that closes on
 * selection still receive their click before the menu unmounts.
 */
export function useOnClickOutside(ref, handler, enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;

    const listener = (event) => {
      const el = ref.current;
      if (!el || el.contains(event.target)) return;
      handler(event);
    };

    document.addEventListener('click', listener, true);
    return () => {
      document.removeEventListener('click', listener, true);
    };
  }, [ref, handler, enabled]);
}

/**
 * Warns before the tab closes/refreshes while a form has unsaved changes.
 * `enabled` should reflect the form's dirty state.
 */
export function useUnsavedChanges(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (event) => {
      event.preventDefault();
      // Browsers show their own message; returnValue triggers the prompt.
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () =>    window.removeEventListener('beforeunload', handler);
  }, [enabled]);
}

