/**
 * Application-wide constants shared across the CloudNotes frontend.
 */

export const APP_NAME = 'CloudNotes';
export const APP_TAGLINE = 'Your thoughts, organized anywhere.';
export const APP_DESCRIPTION =
  'A cloud-based notes and productivity platform that helps you organize personal, study, work, and project notes.';

/**
 * Category color keys map to the `cat-*` CSS classes defined in components.css.
 */
export const CATEGORY_COLORS = [
  { key: 'work', label: 'Blue' },
  { key: 'study', label: 'Violet' },
  { key: 'personal', label: 'Green' },
  { key: 'ideas', label: 'Amber' },
  { key: 'projects', label: 'Cyan' },
  { key: 'default', label: 'Slate' },
];

export const DEFAULT_CATEGORIES = [
  {
    id: 'cat-work',
    name: 'Work',
    description: 'Meetings, tasks, and professional notes.',
    color: 'work',
    isDefault: true,
  },
  {
    id: 'cat-study',
    name: 'Study',
    description: 'Course notes, revision, and research.',
    color: 'study',
    isDefault: true,
  },
  {
    id: 'cat-personal',
    name: 'Personal',
    description: 'Journaling, plans, and everyday life.',
    color: 'personal',
    isDefault: true,
  },
  {
    id: 'cat-ideas',
    name: 'Ideas',
    description: 'Brainstorms, sparks, and inspiration.',
    color: 'ideas',
    isDefault: true,
  },
  {
    id: 'cat-projects',
    name: 'Projects',
    description: 'Roadmaps, specs, and build logs.',
    color: 'projects',
    isDefault: true,
  },
];

export const CATEGORY_CLASS_MAP = {
  work: 'cat-work',
  study: 'cat-study',
  personal: 'cat-personal',
  ideas: 'cat-ideas',
  projects: 'cat-projects',
  default: 'cat-default',
};

export function getCategoryClass(colorKey) {
  return CATEGORY_CLASS_MAP[colorKey] || CATEGORY_CLASS_MAP.default;
}

export const NOTE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'updated', label: 'Recently updated' },
];

export const NOTE_VIEWS = {
  GRID: 'grid',
  LIST: 'list',
};

export const MAX_TITLE_LENGTH = 120;
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS = 8;
export const MAX_CONTENT_LENGTH = 40000;

export const PASSWORD_MIN_LENGTH = 8;

/** localStorage keys. Only non-sensitive UI preferences and demo data live here. */
export const STORAGE_KEYS = {
  THEME: 'cloudnotes.theme',
  NOTE_VIEW: 'cloudnotes.notesView',
  LIBRARY_VIEW: 'cloudnotes.libraryView',
  SIDEBAR_COLLAPSED: 'cloudnotes.sidebarCollapsed',
  DEMO_NOTES: 'cloudnotes.demo.notes',
  DEMO_CATEGORIES: 'cloudnotes.demo.categories',
  DEMO_USERS: 'cloudnotes.demo.users',
  DEMO_SESSION: 'cloudnotes.demo.session',
};

/** Demo-mode account used for the UI preview (no real authentication). */
export const DEMO_USER = {
  id: 'demo-user-1',
  fullName: 'Alex Morgan',
  email: 'demo@cloudnotes.app',
};

export const UNAUTHENTICATED_ROUTES = ['/', '/login', '/register'];
