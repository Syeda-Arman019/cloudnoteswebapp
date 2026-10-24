/**
 * Classes context — the user's class list with unread counts, shared by the
 * sidebar badge, the My Classes page and the class shell (so opening a chat
 * only has to refresh, not re-fetch everything).
 *
 * Loads once per authenticated session and exposes `reload()` for explicit
 * refreshes (after joining/creating/leaving a class, or marking read).
 * In demo mode the list stays empty — class features require the real API.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { classesService } from '@/services/classesService';

const ClassesContext = createContext(null);

export function ClassesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [classes, setClasses] = useState([]);
  const [status, setStatus] = useState('idle'); // 'idle' | 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setClasses([]);
      setStatus('idle');
      return;
    }
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    try {
      const list = await classesService.list();
      setClasses(list);
      setError(null);
      setStatus('ready');
      return list;
    } catch (err) {
      // Never block the app shell on this — surface the error state instead.
      setError(err.message);
      setStatus('error');
      throw err;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setClasses([]);
      setStatus('idle');
      return undefined;
    }
    (async () => {
      try {
        const list = await classesService.list();
        if (cancelled) return;
        setClasses(list);
        setError(null);
        setStatus('ready');
      } catch (err) {
        if (cancelled) return;
        setError(err.message);
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  // Background refresh — keeps the sidebar unread badge and class list
  // current without requiring navigation. Deliberately quiet: a failed
  // background poll keeps the last known list (and its real unread counts)
  // instead of flipping an already-loaded view into an error state. The
  // visibilitychange hook catches up immediately when the tab is focused
  // again after a longer background period.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    let cancelled = false;

    const refresh = async () => {
      try {
        const list = await classesService.list();
        if (cancelled) return;
        setClasses(list);
        setError(null);
        setStatus('ready');
      } catch {
        /* transient failure — keep the previous real data and retry next tick */
      }
    };

    const timer = window.setInterval(refresh, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [isAuthenticated]);

  const unreadTotal = useMemo(
    () => classes.reduce((sum, entry) => sum + (entry.unreadCount || 0), 0),
    [classes]
  );

  const value = useMemo(
    () => ({
      classes,
      status,
      error,
      unreadTotal,
      reload,
      get: (id) => classes.find((entry) => String(entry.id) === String(id)) || null,
    }),
    [classes, status, error, unreadTotal, reload]
  );

  return <ClassesContext.Provider value={value}>{children}</ClassesContext.Provider>;
}

export function useClasses() {
  const context = useContext(ClassesContext);
  if (!context) throw new Error('useClasses must be used inside <ClassesProvider>');
  return context;
}

export default ClassesContext;
