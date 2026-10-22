/**
 * Notification (toast) context — a tiny centralized feedback channel used by
 * pages and components after async actions.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';


const NotificationContext = createContext(null);

let counter = 0;

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const timersRef = useRef({});

  const dismiss = useCallback((id) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
    if (timersRef.current[id]) {
      window.clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
  }, []);

  const notify = useCallback(
    (type, title, message = '') => {
      counter += 1;
      const id = `toast-${counter}`;
      setNotifications((current) => [...current, { id, type, title, message }].slice(-4));
      timersRef.current[id] = window.setTimeout(() => dismiss(id), 5000);
      return id;
    },
    [dismiss]
  );

  // Stable identities: safe to list in effect dependency arrays.
  const success = useCallback((title, message) => notify('success', title, message), [notify]);
  const error = useCallback((title, message) => notify('error', title, message), [notify]);
  const info = useCallback((title, message) => notify('info', title, message), [notify]);
  const warning = useCallback((title, message) => notify('warning', title, message), [notify]);

  const value = useMemo(
    () => ({
      notifications,
      notify,
      dismiss,
      success,
      error,
      info,
      warning,
    }),
    [notifications, notify, dismiss, success, error, info, warning]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return context;
}
