/**
 * Study Library helpers: file-type metadata, formatting, and constants.
 * Mirrors the backend's allowed formats (app/file_validation.py).
 */

import {
  FileText,
  FileType2,
  Image,
  Presentation,
  Sheet,
  StickyNote,
} from 'lucide-react';

/** extension -> { label, kind, Icon } — kind drives filters and badges. */
export const FILE_TYPES = {
  pdf: { label: 'PDF', kind: 'pdf', Icon: FileText },
  doc: { label: 'Word', kind: 'doc', Icon: FileType2 },
  docx: { label: 'Word', kind: 'doc', Icon: FileType2 },
  ppt: { label: 'Slides', kind: 'ppt', Icon: Presentation },
  pptx: { label: 'Slides', kind: 'ppt', Icon: Presentation },
  xls: { label: 'Sheet', kind: 'xls', Icon: Sheet },
  xlsx: { label: 'Sheet', kind: 'xls', Icon: Sheet },
  txt: { label: 'Text', kind: 'txt', Icon: FileText },
  md: { label: 'Markdown', kind: 'md', Icon: StickyNote },
  png: { label: 'Image', kind: 'image', Icon: Image },
  jpg: { label: 'Image', kind: 'image', Icon: Image },
  jpeg: { label: 'Image', kind: 'image', Icon: Image },
  webp: { label: 'Image', kind: 'image', Icon: Image },
};

export const UNKNOWN_TYPE = { label: 'File', kind: 'other', Icon: FileText };

export function getFileInfo(extension) {
  return FILE_TYPES[String(extension || '').toLowerCase()] || UNKNOWN_TYPE;
}

/** Extensions accepted by upload inputs and drag-and-drop. */
export const ACCEPTED_EXTENSIONS = Object.keys(FILE_TYPES);
export const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/** Human-readable "PDF, Word, PowerPoint, Excel, text, Markdown, images". */
export const ACCEPT_HELP =
  'PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx), Excel (.xls/.xlsx), .txt, .md, and images (PNG, JPG, WebP).';

export const FILE_KIND_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'pdf', label: 'PDF' },
  { value: 'doc', label: 'Word' },
  { value: 'ppt', label: 'PowerPoint' },
  { value: 'xls', label: 'Excel' },
  { value: 'txt', label: 'Text' },
  { value: 'md', label: 'Markdown' },
  { value: 'image', label: 'Images' },
];

export const FILE_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'size', label: 'Largest first' },
];

export const UPLOAD_DATE_OPTIONS = [
  { value: 'any', label: 'Any time' },
  { value: 'today', label: 'Uploaded today' },
  { value: 'week', label: 'Last 7 days' },
  { value: 'month', label: 'Last 30 days' },
];

export const LIBRARY_VIEWS = { GRID: 'grid', LIST: 'list' };

/** "1.5 MB" from bytes; matches the backend's format_size(). */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value;
  let unit = 'B';
  for (const next of units) {
    if (size < 1024 || next === 'GB') {
      unit = next;
      break;
    }
    size /= 1024;
  }
  return `${size.toFixed(1)} ${unit}`;
}

/** True when the backend will serve this file inline (mirrors PREVIEWABLE_MIME_TYPES). */
export function isPreviewable(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  return (
    mime === 'application/pdf' ||
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/webp' ||
    mime === 'text/plain' ||
    mime === 'text/markdown'
  );
}

export function previewKind(file) {
  const mime = String(file?.mimeType || '').toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'text/plain' || mime === 'text/markdown') return 'text';
  return 'unsupported';
}
