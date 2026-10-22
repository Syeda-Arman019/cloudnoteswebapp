/**
 * Profile & account service.
 *
 * Flask REST API contract (Part 2):
 *   GET    /profile            fetch the signed-in user's profile
 *   PUT    /profile            update the display name / bio
 *   POST   /profile/password   change the password
 *   DELETE /profile            delete the account and all of its data
 *
 * Demo mode simulates these flows against the browser store. Password changes
 * are not really verified in demo mode and no password is ever persisted.
 */

import { apiClient, isDemoMode, ApiError } from './apiClient';
import * as demo from './mock/demoStore';

function normalizeUser(user) {
  if (!user) return null;
  return {
    id: user.id == null ? null : String(user.id),
    fullName: user.fullName || user.full_name || '',
    email: user.email || '',
    role: user.role || 'Member',
    bio: user.bio || '',
  };
}

export const profileService = {
  async get() {
    if (isDemoMode) {
      const session = demo.getSession();
      return normalizeUser(session);
    }
    const data = await apiClient.get('/profile');
    return normalizeUser(data?.user || data);
  },

  async update({ fullName }) {
    if (isDemoMode) {
      await demo.delay();
      const session = demo.getSession();
      if (!session) throw new ApiError('No active demo session.', { status: 401 });
      const updated = demo.updateDemoUser(session.id, { fullName: fullName.trim() });
      return normalizeUser(demo.saveSession(updated));
    }
    const data = await apiClient.put('/profile', { fullName });
    return normalizeUser(data?.user || data);
  },

  /**
   * @returns {{ demoMode: boolean }} — the UI surfaces the mode so the user
   * knows whether a real password change occurred.
   */
  async changePassword({ currentPassword, newPassword }) {
    if (isDemoMode) {
      await demo.delay();
      if (!currentPassword || !newPassword) {
        throw new ApiError('Both fields are required.');
      }
      return { demoMode: true };
    }
    await apiClient.post('/profile/password', { currentPassword, newPassword });
    return { demoMode: false };
  },

  /**
   * Deletes the account. In real mode the API requires the account password
   * as server-side authorization for this irreversible action
   * (`DELETE /profile` with `{ password }`); demo mode needs no password.
   */
  async deleteAccount(password = '') {
    if (isDemoMode) {
      await demo.delay(400);
      demo.removeDemoData();
      return { demoMode: true };
    }
    await apiClient.del('/profile', { password });
    return { demoMode: false };
  },
};

export default profileService;
