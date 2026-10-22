/**
 * Central API client for the CloudNotes REST API (Flask backend, Part 2).
 *
 * - Reads the API base URL from the VITE_API_URL environment variable.
 * - Session auth is cookie-based, so every request sends the HttpOnly session
 *   cookie (`credentials: 'include'`). In development the Vite proxy forwards
 *   `/api` to the Flask backend, keeping the cookie same-origin.
 * - DEMO MODE (isolated browser-side store) only exists when VITE_API_URL is
 *   empty/unset **in a development build**. Production builds always talk to
 *   the real API — there is no demo fallback in production.
 * - Every request is JSON-based and errors are normalised into ApiError so the
 *   UI can always render `error.message`.
 */

export const API_URL = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/**
 * True when no backend URL is configured AND this is a development build.
 * Production builds never fall back to demo data.
 */
export const isDemoMode = API_URL.length === 0 && import.meta.env.DEV;

if (import.meta.env.PROD && API_URL.length === 0) {
  console.warn(
    '[CloudNotes] VITE_API_URL is not set in this production build — requests will go to the same origin. Demo mode is disabled in production.'
  );
}

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'unknown', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function readErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  return (
    payload.message ||
    payload.error ||
    (payload.errors && typeof payload.errors === 'object'
      ? Object.values(payload.errors).flat().join(' ')
      : null) ||
    fallback
  );
}

async function request(
  path,
  { method = 'GET', body = null, signal = null, responseType = 'json' } = {}) {
  const url = `${API_URL}${path}`;
  const headers = { Accept: 'application/json' };
  if (body !== null) headers['Content-Type'] = 'application/json';

  // Cookie-based session auth: always send/receive the HttpOnly session cookie.
  const options = { method, headers, signal, credentials: 'include' };
  if (body !== null) options.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach the CloudNotes server. Check your connection and try again.', {
      code: 'network',
    });
  }

  if (response.status === 204) return null;

  if (responseType === 'blob') {
    if (!response.ok) {
      throw new ApiError(`Export failed (${response.status}).`, {
        status: response.status,
        code: 'http',
      });
    }
    return response.blob();
  }

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : await response.text();

  if (!response.ok) {
    throw new ApiError(readErrorMessage(payload, `Request failed (${response.status}).`), {
      status: response.status,
      code: response.status === 401 ? 'unauthorized' : 'http',
      details: payload,
    });
  }

  return payload;
}

export const apiClient = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, body, options = {}) => request(path, { ...options, method: 'DELETE', body }),
};
