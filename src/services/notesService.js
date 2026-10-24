/**
 * Notes service — every note operation in the UI goes through this module.
 *
 * With VITE_API_URL configured it calls the Flask REST API:
 *   GET    /notes            list notes
 *   POST   /notes            create a note
 *   GET    /notes/:id        fetch one note
 *   PUT    /notes/:id        update a note
 *   DELETE /notes/:id        delete a note
 *   PATCH  /notes/:id/pin    toggle the pinned flag
 *
 * Without a configured API it transparently uses the isolated demo store.
 */

import { apiClient, isDemoMode } from './apiClient';
import * as demo from './mock/demoStore';

function normalizeNote(note) {
  if (!note) return null;
  return {
    // Ids are normalized to strings: the URL params and demo store use
    // strings, while the API returns numbers — coercing at this single
    // boundary keeps every strict `===` comparison in the UI correct.
    id: String(note.id),
    title: note.title || '',
    content: note.content || '',
    categoryId:
      note.categoryId == null || note.categoryId === ''
        ? null
        : String(note.categoryId),
    folderId:
      note.folderId == null || note.folderId === ''
        ? null
        : String(note.folderId),
    folder: note.folder || null,
    tags: Array.isArray(note.tags) ? note.tags : [],
    isPinned: Boolean(note.isPinned ?? note.is_pinned),
    createdAt: note.createdAt || note.created_at,
    updatedAt: note.updatedAt || note.updated_at,
  };
}

export const notesService = {
  async list() {
    if (isDemoMode) {
      await demo.delay();
      return demo.listNotes().map(normalizeNote);
    }
    const all = [];
    let page = 1;
    let totalPages = 1;
    // The API paginates (max 100/page); walk every page so the UI always
    // works with the user's complete note list.
    do {
      const data = await apiClient.get(`/notes?per_page=100&page=${page}`);
      all.push(...(Array.isArray(data) ? data : data?.notes || []));
      totalPages = data?.pagination?.totalPages || 1;
      page += 1;
    } while (page <= totalPages);
    return all.map(normalizeNote);
  },

  async getById(id) {
    if (isDemoMode) {
      await demo.delay(180);
      return normalizeNote(demo.getNote(id));
    }
    const data = await apiClient.get(`/notes/${id}`);
    return normalizeNote(data?.note || data);
  },

  async create(payload) {
    if (isDemoMode) {
      await demo.delay();
      return normalizeNote(demo.createNote(payload));
    }
    const data = await apiClient.post('/notes', payload);
    return normalizeNote(data?.note || data);
  },

  async update(id, payload) {
    if (isDemoMode) {
      await demo.delay();
      return normalizeNote(demo.updateNote(id, payload));
    }
    const data = await apiClient.put(`/notes/${id}`, payload);
    return normalizeNote(data?.note || data);
  },

  async togglePin(id, isPinned) {
    if (isDemoMode) {
      await demo.delay(160);
      return normalizeNote(demo.updateNote(id, { isPinned }));
    }
    const data = await apiClient.patch(`/notes/${id}/pin`, { isPinned });
    return normalizeNote(data?.note || data);
  },

  async remove(id) {
    if (isDemoMode) {
      await demo.delay(200);
      return demo.deleteNote(id);
    }
    await apiClient.del(`/notes/${id}`);
    return true;
  },
};

export default notesService;
