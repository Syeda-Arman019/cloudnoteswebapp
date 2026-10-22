/**
 * Demo-mode data store.
 *
 * Used ONLY when VITE_API_URL is empty, so the complete interface can be
 * previewed without the Flask backend. Data lives in localStorage inside the
 * browser — nothing is sent anywhere, and no passwords are ever stored.
 *
 * Replacing demo mode with the real API is a one-line switch in each service
 * module (`if (isDemoMode) ...`), so Part 2 integration needs no UI changes.
 */

import { STORAGE_KEYS, DEFAULT_CATEGORIES } from '@/utils/constants';
import { SEED_CATEGORIES, SEED_NOTES, SEED_USER } from './seedData';

/** Simulated network latency so loading states are visible in the preview. */
export function delay(ms = 280) {
  const variance = ms * 0.4;
  const wait = ms - variance / 2 + Math.random() * variance;
  return new Promise((resolve) => setTimeout(resolve, wait));
}

function read(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) — demo state stays in memory */
  }
}

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function sortNotes(notes) {
  return [...notes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/* ------------------------------------------------------------------
   Notes
   ------------------------------------------------------------------ */

export function getNotes() {
  const stored = read(STORAGE_KEYS.DEMO_NOTES, null);
  if (stored && Array.isArray(stored)) return stored;
  write(STORAGE_KEYS.DEMO_NOTES, SEED_NOTES);
  return SEED_NOTES;
}

function saveNotes(notes) {
  write(STORAGE_KEYS.DEMO_NOTES, notes);
  return notes;
}

export function listNotes() {
  return sortNotes(getNotes());
}

export function getNote(id) {
  return getNotes().find((note) => note.id === id) || null;
}

export function createNote({ title, content, categoryId, tags, isPinned }) {
  const now = new Date().toISOString();
  const note = {
    id: uid('note'),
    title: title.trim(),
    content,
    categoryId: categoryId || null,
    tags: tags || [],
    isPinned: Boolean(isPinned),
    createdAt: now,
    updatedAt: now,
  };
  saveNotes([note, ...getNotes()]);
  return note;
}

export function updateNote(id, patch) {
  const notes = getNotes();
  const index = notes.findIndex((note) => note.id === id);
  if (index === -1) return null;
  const updated = {
    ...notes[index],
    ...patch,
    title: patch.title ? patch.title.trim() : notes[index].title,
    updatedAt: new Date().toISOString(),
  };
  notes[index] = updated;
  saveNotes(notes);
  return updated;
}

export function deleteNote(id) {
  saveNotes(getNotes().filter((note) => note.id !== id));
  return true;
}

export function clearNotes() {
  saveNotes([]);
}

/* ------------------------------------------------------------------
   Categories
   ------------------------------------------------------------------ */

export function getCategories() {
  const stored = read(STORAGE_KEYS.DEMO_CATEGORIES, null);
  if (stored && Array.isArray(stored)) return stored;
  write(STORAGE_KEYS.DEMO_CATEGORIES, SEED_CATEGORIES);
  return SEED_CATEGORIES;
}

function saveCategories(categories) {
  write(STORAGE_KEYS.DEMO_CATEGORIES, categories);
  return categories;
}

export function listCategories() {
  return getCategories();
}

export function createCategory({ name, description, color }) {
  const category = {
    id: uid('cat'),
    name: name.trim(),
    description: (description || '').trim(),
    color: color || 'default',
    isDefault: false,
  };
  saveCategories([...getCategories(), category]);
  return category;
}

export function updateCategory(id, patch) {
  const categories = getCategories();
  const index = categories.findIndex((category) => category.id === id);
  if (index === -1) return null;
  const updated = {
    ...categories[index],
    ...patch,
    name: patch.name ? patch.name.trim() : categories[index].name,
  };
  categories[index] = updated;
  saveCategories(categories);
  return updated;
}

export function deleteCategory(id) {
  const categories = getCategories();
  const target = categories.find((category) => category.id === id);
  if (!target) return false;
  if (target.isDefault) return false; // default categories are protected
  saveCategories(categories.filter((category) => category.id !== id));
  // Notes that referenced this category simply become uncategorised.
  saveNotes(getNotes().map((note) => (note.categoryId === id ? { ...note, categoryId: null } : note)));
  return true;
}

/* ------------------------------------------------------------------
   Demo users & session (no passwords are ever persisted)
   ------------------------------------------------------------------ */

export function getUsers() {
  const stored = read(STORAGE_KEYS.DEMO_USERS, null);
  if (stored && Array.isArray(stored)) return stored;
  write(STORAGE_KEYS.DEMO_USERS, [SEED_USER]);
  return [SEED_USER];
}

export function createDemoUser({ fullName, email }) {
  const user = {
    id: uid('user'),
    fullName: fullName.trim(),
    email: email.trim().toLowerCase(),
    role: 'Member',
    bio: '',
  };
  write(STORAGE_KEYS.DEMO_USERS, [...getUsers(), user]);
  return user;
}

export function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return getUsers().find((user) => user.email.toLowerCase() === normalized) || null;
}

export function updateDemoUser(id, patch) {
  const users = getUsers();
  const index = users.findIndex((user) => user.id === id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...patch };
  write(STORAGE_KEYS.DEMO_USERS, users);
  return users[index];
}

export function removeDemoData() {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.DEMO_NOTES);
    window.localStorage.removeItem(STORAGE_KEYS.DEMO_CATEGORIES);
    window.localStorage.removeItem(STORAGE_KEYS.DEMO_USERS);
    window.localStorage.removeItem(STORAGE_KEYS.DEMO_SESSION);
  } catch {
    /* ignore */
  }
}

export function getSession() {
  return read(STORAGE_KEYS.DEMO_SESSION, null);
}

export function saveSession(user) {
  // Only non-sensitive profile fields are kept — never a password or token.
  const safeUser = { id: user.id, fullName: user.fullName, email: user.email, role: user.role, bio: user.bio };
  write(STORAGE_KEYS.DEMO_SESSION, safeUser);
  return safeUser;
}

export function clearSession() {
  try {
    window.localStorage.removeItem(STORAGE_KEYS.DEMO_SESSION);
  } catch {
    /* ignore */
  }
}

export { DEFAULT_CATEGORIES };
