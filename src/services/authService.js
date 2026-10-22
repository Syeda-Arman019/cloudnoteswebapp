/**
 * Authentication service.
 *
 * Talks to the Flask REST API when VITE_API_URL is configured, otherwise it
 * runs in demo mode against the isolated browser store so the UI can be
 * previewed end to end.
 *
 * Demo mode simulates sign-in for the seeded account or any registered demo
 * account. It does NOT verify credentials and never stores a password — it is
 * a UI preview, not real authentication.
 */

import { apiClient, isDemoMode, ApiError } from './apiClient';
import * as demo from './mock/demoStore';

const DEMO_HINT =
  'Demo mode: sign in with demo@cloudnotes.app (any password), or register a new demo account.';

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id == null ? null : String(user.id),
    fullName: user.fullName || user.full_name || user.name || '',
    email: user.email || '',
    role: user.role || 'Member',
    bio: user.bio || '',
  };
}

export const authService = {
  /** Restores the current session on app load. */
  async getCurrentUser() {
    if (isDemoMode) {
      const session = demo.getSession();
      return session ? normalizeUser(session) : null;
    }
    try {
      const data = await apiClient.get('/auth/me');
      return normalizeUser(data?.user || data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async login({ email, password }) {
    if (isDemoMode) {
      await demo.delay();
      const user = demo.findUserByEmail(email);
      if (!user) {
        throw new ApiError(`No demo account found for this email. ${DEMO_HINT}`, {
          status: 401,
          code: 'unauthorized',
        });
      }
      if (!password) {
        throw new ApiError('Enter a password to continue. ' + DEMO_HINT, {
          status: 401,
          code: 'unauthorized',
        });
      }
      return { user: demo.saveSession(user), demoMode: true };
    }

    const data = await apiClient.post('/auth/login', { email, password });
    return { user: normalizeUser(data?.user || data), demoMode: false };
  },

  async register({ fullName, email, password }) {
    if (isDemoMode) {
      await demo.delay();
      if (demo.findUserByEmail(email)) {
        throw new ApiError('An account with this email already exists in demo mode.', {
          status: 409,
          code: 'conflict',
        });
      }
      const user = demo.createDemoUser({ fullName, email });
      // The password argument is intentionally discarded — it is never persisted.
      void password;
      return { user: demo.saveSession(user), demoMode: true };
    }

    const data = await apiClient.post('/auth/register', { fullName, email, password });
    return { user: normalizeUser(data?.user || data), demoMode: false };
  },

  async logout() {
    if (isDemoMode) {
      demo.clearSession();
      return true;
    }
    try {
      await apiClient.post('/auth/logout', {});
    } catch (error) {
      // Session cleanup still happens locally even if the request fails.
      console.warn('[CloudNotes] logout request failed:', error.message);
    }
    return true;
  },
};

export default authService;
