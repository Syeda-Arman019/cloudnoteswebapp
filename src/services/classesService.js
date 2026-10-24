/**
 * Classes service — every class-collaboration call in the UI goes here.
 *
 *   GET    /classes                 list my classes (with unread counts)
 *   POST   /classes                 create a class
 *   GET    /classes/:id             class detail
 *   PATCH  /classes/:id             update (owner)
 *   DELETE /classes/:id             delete (owner)
 *   GET    /classes/:id/members     members + online count
 *   POST   /classes/:id/leave       leave (owner must transfer first)
 *   DELETE /classes/:id/members/:m  remove a member (owner)
 *   POST   /classes/:id/transfer    transfer ownership (owner)
 *   GET    /classes/:id/invitations list invitations (owner)
 *   POST   /classes/:id/invitations create invitation -> token shown ONCE
 *   DELETE /classes/:id/invitations/:i  revoke
 *   GET    /invitations/preview     safe class details for a token
 *   POST   /invitations/join        join with a token
 *   POST   /shares  |  /shares/unshare   share/unshare a resource
 *   GET    /classes/:id/materials   files+folders+notes shared with class
 *   GET    /classes/:id/messages    cursor-paginated chat history
 *   POST   /classes/:id/messages    send text/attachment message
 *   PATCH  /messages/:id            edit own message
 *   DELETE /messages/:id            delete (own or moderate)
 *   POST   /classes/:id/attachments multipart upload (XHR with progress)
 *   GET    /attachments/:id/content inline preview URL
 *   GET    /attachments/:id/download attachment download URL
 *   POST   /classes/:id/heartbeat   presence heartbeat
 *   POST   /classes/:id/read        mark read
 *
 * Session auth is cookie-based (credentials: 'include'). Demo mode has no
 * class backend — operations fail with a clear message instead of fake data.
 */

import { apiClient, API_URL, isDemoMode } from './apiClient';

function requireApi(operation) {
  if (isDemoMode) {
    const error = new Error(
      `${operation} needs the CloudNotes API — demo mode has no class backend.`
    );
    error.code = 'demo';
    throw error;
  }
}

export const classesService = {
  // ----- classes -------------------------------------------------------
  list: async () => {
    requireApi('Class collaboration');
    const data = await apiClient.get('/classes');
    return data?.classes || [];
  },

  getById: async (id) => {
    requireApi('Class collaboration');
    const data = await apiClient.get(`/classes/${id}`);
    return data?.class || null;
  },

  create: async (payload) => {
    requireApi('Class creation');
    const data = await apiClient.post('/classes', payload);
    return data?.class;
  },

  update: async (id, payload) => {
    requireApi('Class settings');
    const data = await apiClient.patch(`/classes/${id}`, payload);
    return data?.class;
  },

  remove: async (id) => {
    requireApi('Class deletion');
    await apiClient.del(`/classes/${id}`);
    return true;
  },

  // ----- membership ----------------------------------------------------
  members: async (classId) => {
    requireApi('Member list');
    const data = await apiClient.get(`/classes/${classId}/members`);
    return { members: data?.members || [], onlineCount: data?.onlineCount || 0 };
  },

  leave: async (classId) => {
    requireApi('Leaving a class');
    const data = await apiClient.post(`/classes/${classId}/leave`);
    return data || { left: true };
  },

  removeMember: async (classId, memberId) => {
    requireApi('Member removal');
    await apiClient.del(`/classes/${classId}/members/${memberId}`);
    return true;
  },

  transferOwnership: async (classId, memberId) => {
    requireApi('Ownership transfer');
    const data = await apiClient.post(`/classes/${classId}/transfer`, { memberId });
    return data || {};
  },

  // ----- invitations ---------------------------------------------------
  invitations: async (classId) => {
    requireApi('Invitations');
    const data = await apiClient.get(`/classes/${classId}/invitations`);
    return data?.invitations || [];
  },

  createInvitation: async (classId, payload = {}) => {
    requireApi('Invitation creation');
    const data = await apiClient.post(`/classes/${classId}/invitations`, payload);
    return data?.invitation; // includes token — shown once, never re-fetchable
  },

  revokeInvitation: async (classId, invitationId) => {
    requireApi('Invitation revocation');
    const data = await apiClient.del(`/classes/${classId}/invitations/${invitationId}`);
    return data || {};
  },

  previewInvitation: async (token) => {
    requireApi('Invitation preview');
    const data = await apiClient.get(
      `/invitations/preview?token=${encodeURIComponent(token)}`
    );
    return data || null;
  },

  join: async (token) => {
    requireApi('Joining a class');
    return apiClient.post('/invitations/join', { token });
  },

  // ----- sharing -------------------------------------------------------
  share: async ({ resourceType, resourceId, classId }) => {
    requireApi('Resource sharing');
    return apiClient.post('/shares', { resourceType, resourceId, classId });
  },

  unshare: async ({ resourceType, resourceId }) => {
    requireApi('Resource sharing');
    return apiClient.post('/shares/unshare', { resourceType, resourceId });
  },

  sharedWith: async (classId, type = 'file') => {
    requireApi('Shared resources');
    const data = await apiClient.get(
      `/classes/${classId}/shared?type=${encodeURIComponent(type)}`
    );
    return data?.resources || [];
  },

  materials: async (classId, query = '') => {
    requireApi('Class materials');
    const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
    return apiClient.get(`/classes/${classId}/materials${suffix}`);
  },

  // ----- chat ----------------------------------------------------------
  messages: async (classId, params = {}) => {
    requireApi('Class chat');
    const search = new URLSearchParams();
    if (params.before) search.set('before', params.before);
    if (params.after) search.set('after', params.after);
    if (params.limit) search.set('limit', params.limit);
    const qs = search.toString();
    const data = await apiClient.get(
      `/classes/${classId}/messages${qs ? `?${qs}` : ''}`
    );
    return { messages: data?.messages || [], hasMore: Boolean(data?.hasMore) };
  },

  send: async (classId, payload) => {
    requireApi('Sending a message');
    const data = await apiClient.post(`/classes/${classId}/messages`, payload);
    return data?.message;
  },

  editMessage: async (messageId, content) => {
    requireApi('Editing a message');
    const data = await apiClient.patch(`/messages/${messageId}`, { content });
    return data?.message;
  },

  deleteMessage: async (messageId) => {
    requireApi('Deleting a message');
    return apiClient.del(`/messages/${messageId}`);
  },

  // ----- attachments ---------------------------------------------------
  /**
   * Multipart upload with real progress (XHR — fetch has no upload events).
   * Returns {attachment}. onProgress receives 0..100; onAbort is honored.
   */
  uploadAttachment: (classId, file, { onProgress = null, kind = null } = {}) =>
    new Promise((resolve, reject) => {
      requireApi('Attachment upload');
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);
      if (kind) form.append('kind', kind);

      xhr.open('POST', `${API_URL}/classes/${classId}/attachments`);
      xhr.withCredentials = true;
      xhr.upload.addEventListener('progress', (event) => {
        if (onProgress && event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
      xhr.addEventListener('load', () => {
        let payload = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload?.attachment);
        } else {
          const error = new Error(
            payload?.message || `Upload failed (${xhr.status}).`
          );
          error.status = xhr.status;
          error.code = payload?.code || 'http';
          reject(error);
        }
      });
      xhr.addEventListener('error', () => {
        reject(new Error('Unable to reach the server to upload this file.'));
      });
      xhr.addEventListener('abort', () => {
        const error = new Error('Upload cancelled.');
        error.code = 'aborted';
        reject(error);
      });
      xhr.send(form);
    }),

  attachmentContentUrl: (attachmentId) =>
    `${API_URL}/attachments/${attachmentId}/content`,

  attachmentDownloadUrl: (attachmentId) =>
    `${API_URL}/attachments/${attachmentId}/download`,

  // ----- presence & unread --------------------------------------------
  heartbeat: async (classId) => {
    requireApi('Presence');
    return apiClient.post(`/classes/${classId}/heartbeat`);
  },

  markRead: async (classId) => {
    requireApi('Read tracking');
    return apiClient.post(`/classes/${classId}/read`);
  },
};

export default classesService;
