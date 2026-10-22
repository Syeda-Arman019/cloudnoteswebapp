/**
 * App data context — one shared source of truth for notes and categories.
 *
 * All reads and writes go through the service modules, so switching from the
 * demo store to the Flask API (setting VITE_API_URL) requires no changes here.
 * Pages stay presentational: they call `createNote`, `deleteNote`, etc., and
 * the store keeps every view (dashboard, notes, categories, sidebar) in sync.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { notesService } from '@/services/notesService';
import { categoriesService } from '@/services/categoriesService';
import { useAuth } from './AuthContext';

const NotesContext = createContext(null);

export function NotesProvider({ children }) {
  const { isAuthenticated, status: authStatus } = useAuth();

  const [notes, setNotes] = useState([]);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [notesData, categoriesData] = await Promise.all([
        notesService.list(),
        categoriesService.list(),
      ]);
      setNotes(notesData);
      setCategories(categoriesData);
    } catch (err) {
      setError(err.message || 'Could not load your notes.');
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      load();
    } else if (authStatus === 'anonymous') {
      setNotes([]);
      setCategories([]);
      setHasLoaded(false);
    }
  }, [isAuthenticated, authStatus, load]);

  /* ------------------------------ notes ------------------------------ */

  const createNote = useCallback(async (payload) => {
    const note = await notesService.create(payload);
    setNotes((current) => [note, ...current]);
    return note;
  }, []);

  const updateNote = useCallback(async (id, payload) => {
    const updated = await notesService.update(id, payload);
    setNotes((current) => current.map((note) => (note.id === id ? updated : note)));
    return updated;
  }, []);

  const togglePin = useCallback(async (id) => {
    const current = notes.find((note) => note.id === id);
    const updated = await notesService.togglePin(id, !current?.isPinned);
    setNotes((all) => all.map((note) => (note.id === id ? updated : note)));
    return updated;
  }, [notes]);

  const deleteNote = useCallback(async (id) => {
    await notesService.remove(id);
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  /* --------------------------- categories ---------------------------- */

  const createCategory = useCallback(async (payload) => {
    const category = await categoriesService.create(payload);
    setCategories((current) => [...current, category]);
    return category;
  }, []);

  const updateCategory = useCallback(async (id, payload) => {
    const updated = await categoriesService.update(id, payload);
    setCategories((current) => current.map((item) => (item.id === id ? updated : item)));
    return updated;
  }, []);

  const deleteCategory = useCallback(async (id) => {
    await categoriesService.remove(id);
    setCategories((current) => current.filter((item) => item.id !== id));
    setNotes((current) =>
      current.map((note) => (note.categoryId === id ? { ...note, categoryId: null } : note))
    );
  }, []);

  /* ---------------------------- selectors ---------------------------- */

  const getCategory = useCallback(
    (id) => (id ? categories.find((category) => category.id === id) || null : null),
    [categories]
  );

  const getNote = useCallback((id) => notes.find((note) => note.id === id) || null, [notes]);

  const notesByCategory = useMemo(() => {
    const counts = {};
    for (const note of notes) {
      const key = note.categoryId || 'uncategorized';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [notes]);

  const stats = useMemo(
    () => ({
      total: notes.length,
      pinned: notes.filter((note) => note.isPinned).length,
      categories: categories.length,
      uncategorized: notes.filter((note) => !note.categoryId).length,
    }),
    [notes, categories]
  );

  const recentNotes = useMemo(
    () => [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 6),
    [notes]
  );

  const value = useMemo(
    () => ({
      notes,
      categories,
      isLoading,
      hasLoaded,
      error,
      reload: load,
      createNote,
      updateNote,
      deleteNote,
      togglePin,
      createCategory,
      updateCategory,
      deleteCategory,
      getNote,
      getCategory,
      notesByCategory,
      stats,
      recentNotes,
    }),
    [
      notes,
      categories,
      isLoading,
      hasLoaded,
      error,
      load,
      createNote,
      updateNote,
      deleteNote,
      togglePin,
      createCategory,
      updateCategory,
      deleteCategory,
      getNote,
      getCategory,
      notesByCategory,
      stats,
      recentNotes,
    ]
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotesStore() {
  const context = useContext(NotesContext);
  if (!context) throw new Error('useNotesStore must be used inside <NotesProvider>');
  return context;
}
