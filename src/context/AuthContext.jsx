/**
 * Auth context — holds the current user and exposes login/register/logout.
 *
 * The actual network calls live in `services/authService`; this context only
 * manages React state. In demo mode the "session" is a non-sensitive profile
 * snapshot stored locally — never a password or credential.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isDemoMode } from '@/services/apiClient';
import { authService } from '@/services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'authenticated' | 'anonymous'
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (cancelled) return;
        setUser(currentUser);
        setStatus(currentUser ? 'authenticated' : 'anonymous');
      } catch (err) {
        if (cancelled) return;
        // Session restore failing must never block the app shell.
        console.warn('[CloudNotes] session restore failed:', err.message);
        setUser(null);
        setStatus('anonymous');
        setError(err.message);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const result = await authService.login(credentials);
    setUser(result.user);
    setStatus('authenticated');
    setError(null);
    return result.user;
  }, []);

  const register = useCallback(async (payload) => {
    const result = await authService.register(payload);
    setUser(result.user);
    setStatus('authenticated');
    setError(null);
    return result.user;
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const updateUser = useCallback((patch) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      error,
      isAuthenticated: status === 'authenticated',
      isLoading: status === 'loading',
      isDemoMode,
      login,
      register,
      logout,
      updateUser,
    }),
    [user, status, error, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
