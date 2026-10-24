/**
 * Files service — Study Library file operations.
 *
 *   GET    /files                 list/search/filter/sort/paginate
 *   POST   /files                 multipart upload (one request per file)
 *   GET    /files/stats           storage usage + pinned + recent
 *   GET    /files/trash           soft-deleted files
 *   DELETE /files/trash           empty the trash
 *   POST   /files/zip             multi-file ZIP download
 *   GET/PUT/DELETE /files/:id     read / rename+move+pin / trash
 *   PATCH  /files/:id/restore     restore from trash
 *   DELETE /files/:id/purge       permanently remove
 *   GET    /files/:id/download    original bytes
 *   GET    /files/:id/preview     inline preview (PDF/images)
 *   GET    /files/:id/preview/text  UTF-8 text for .txt/.md
 *
 * Uploads use XMLHttpRequest (not fetch) because it is the only browser API
 * with real upload-progress events. Every other call goes through apiClient.
 */

import { API_URL, apiClient, ApiError, isDemoMode } from './apiClient';

function normalizeFile(file) {
  if (!file) return null;
  return {
    id: String(file.id),
    name: file.name,
    folderId: file.folderId == null ? null : String(file.folderId),
    folderName: file.folderName || null,
    extension: file.extension || '',
    mimeType: file.mimeType || 'application/octet-stream',
    sizeBytes: file.sizeBytes ?? 0,
    isPinned: Boolean(file.isPinned),
    isTrashed: Boolean(file.isTrashed),
    deletedAt: file.deletedAt,
    lastAccessedAt: file.lastAccessedAt,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

function normalizePage(data) {
  return {
    files: (data?.files || []).map(normalizeFile),
    pagination: data?.pagination || { page: 1, perPage: 50, total: 0, totalPages: 1 },
  };
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'all') {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * Upload one file with progress callbacks.
 *
 * @param {File} file               the browser File object
 * @param {object} options          { folderId, onProgress(0-100), signal }
 * @returns {Promise<object>}       the normalized file from the API
 */
export function uploadWithProgress(file, { folderId = null, onProgress = null, signal = null } = {}) {
  if (isDemoMode) {
    return Promise.reject(
      new ApiError('Uploads require the CloudNotes API (demo mode is read-only).', {
        code: 'demo_mode',
      })
    );
  }

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    if (folderId) form.append('folderId', String(folderId));

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/files`, true);
    xhr.withCredentials = true; // session cookie

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      });
    }

    const abort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
    }

    xhr.addEventListener('load', () => {
      if (signal) signal.removeEventListener('abort', abort);
      let payload = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON body */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve(normalizeFile(payload?.file || payload));
      } else {
        reject(
          new ApiError(payload?.message || `Upload failed (${xhr.status}).`, {
            status: xhr.status,
            code: payload?.code || 'http',
            details: payload,
          })
        );
      }
    });

    xhr.addEventListener('error', () => {
      if (signal) signal.removeEventListener('abort', abort);
      reject(
        new ApiError('Unable to reach the CloudNotes server. Check your connection and retry.', {
          code: 'network',
        })
      );
    });

    xhr.addEventListener('abort', () => {
      if (signal) signal.removeEventListener('abort', abort);
      reject(new DOMException('Aborted', 'AbortError'));
    });

    xhr.send(form);
  });
}

export const filesService = {
  async list(params = {}) {
    const data = await apiClient.get(`/files${buildQuery(params)}`);
    return normalizePage(data);
  },

  async listTrash(params = {}) {
    const data = await apiClient.get(`/files/trash${buildQuery(params)}`);
    return normalizePage(data);
  },

  async getStats() {
    if (isDemoMode) {
      return {
        storage: { usedBytes: 0, fileCount: 0, trashedCount: 0, usedLabel: '0 B' },
        pinnedFiles: [],
        recentFiles: [],
      };
    }
    const data = await apiClient.get('/files/stats');
    return {
      storage: data?.storage || { usedBytes: 0, fileCount: 0, trashedCount: 0, usedLabel: '0 B' },
      pinnedFiles: (data?.pinnedFiles || []).map(normalizeFile),
      recentFiles: (data?.recentFiles || []).map(normalizeFile),
    };
  },

  async get(id) {
    const data = await apiClient.get(`/files/${id}`);
    return normalizeFile(data?.file || data);
  },

  async update(id, payload) {
    const data = await apiClient.put(`/files/${id}`, payload);
    return normalizeFile(data?.file || data);
  },

  async trash(id) {
    await apiClient.del(`/files/${id}`);
    return true;
  },

  async restore(id) {
    const data = await apiClient.patch(`/files/${id}/restore`);
    return normalizeFile(data?.file || data);
  },

  async purge(id) {
    await apiClient.del(`/files/${id}/purge`);
    return true;
  },

  async emptyTrash() {
    return apiClient.del('/files/trash');
  },

  /** Fetch a protected binary (download/preview) as a Blob via the API. */
  async fetchBlob(id, { kind = 'download' } = {}) {
    const path = kind === 'preview' ? `/files/${id}/preview` : `/files/${id}/download`;
    return apiClient.get(path, { responseType: 'blob' });
  },

  /** UTF-8 text preview for .txt/.md files. */
  async previewText(id) {
    const data = await apiClient.get(`/files/${id}/preview/text`);
    return data?.content ?? '';
  },

  /** Download several files as one ZIP (server preserves folder structure). */
  async downloadZip(fileIds) {
    return apiClient.post('/files/zip', { fileIds }, { responseType: 'blob' });
  },
};

/** Trigger a browser download for a Blob with the given filename. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a moment before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default filesService;
