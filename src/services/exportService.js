/**
 * Document export service.
 *
 * The export *interface* ships with the frontend in Part 1; the actual file
 * generation (PDF, DOCX, TXT, Markdown) is produced by the Flask backend in
 * Part 2 via:
 *
 *   GET  /notes/:id/export/:format   format: 'pdf' | 'docx' | 'txt' | 'md'
 *   -> binary file response, streamed to the browser as a download.
 *
 * Until that endpoint exists this module never fabricates a file and never
 * reports a successful download — the UI clearly explains that export arrives
 * with the API.
 */

import { apiClient, isDemoMode, ApiError } from './apiClient';

export const EXPORT_FORMATS = [
  {
    id: 'pdf',
    label: 'PDF document',
    description: 'Print-ready file, great for sharing and archiving.',
    extension: 'pdf',
    mimeType: 'application/pdf',
  },
  {
    id: 'docx',
    label: 'Microsoft Word (.docx)',
    description: 'Editable document for Word, Docs, and LibreOffice.',
    extension: 'docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  {
    id: 'txt',
    label: 'Plain text (.txt)',
    description: 'Lightweight text file with no formatting.',
    extension: 'txt',
    mimeType: 'text/plain',
  },
  {
    id: 'md',
    label: 'Markdown (.md)',
    description: 'Source-friendly format for repos and note apps.',
    extension: 'md',
    mimeType: 'text/markdown',
  },
];

export const exportService = {
  /** Formats available for the export menu. */
  getFormats() {
    return EXPORT_FORMATS.map((format) => ({
      ...format,
      // File generation is only possible once the Part 2 API is connected.
      enabled: !isDemoMode,
    }));
  },

  /** True when the backend can actually produce export files. */
  isExportReady() {
    return !isDemoMode;
  },

  /**
   * Requests an export from the backend and triggers the browser download.
   * Throws a descriptive error while the backend endpoint is unavailable —
   * it intentionally does not create placeholder files.
   */
  async exportNote(note, formatId) {
    const format = EXPORT_FORMATS.find((item) => item.id === formatId);
    if (!format) throw new ApiError('Unknown export format.', { code: 'invalid_format' });

    if (isDemoMode) {
      throw new ApiError(
        'File export is not available in demo mode. It activates automatically when the CloudNotes API is connected.',
        { code: 'export_unavailable' }
      );
    }

    const blob = await apiClient.get(`/notes/${note.id}/export/${format.id}`, {
      responseType: 'blob',
    });

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${note.title.replace(/[^\w\- ]+/g, '').trim() || 'note'}.${format.extension}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return true;
  },
};

export default exportService;
