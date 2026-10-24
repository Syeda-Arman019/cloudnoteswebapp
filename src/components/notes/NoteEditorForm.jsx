/**
 * NoteEditorForm — the shared create/edit form for notes.
 *
 * Content is plain text with a light markdown subset; the toolbar inserts the
 * syntax, and the same stored text feeds the future PDF/DOCX/TXT/Markdown
 * exports unchanged.
 */

import { useMemo, useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote, Save, X } from 'lucide-react';
import { useUnsavedChanges } from '@/hooks';
import { validateNoteForm, hasErrors, normalizeTags } from '@/utils/validation';
import Button from '@/components/common/Button';
import TagInput from '@/components/common/TagInput';
import Switch from '@/components/common/Switch';
import { MAX_TITLE_LENGTH } from '@/utils/constants';

const TOOLBAR_ACTIONS = [
  { key: 'heading', icon: Heading2, label: 'Insert heading', prefix: '## ' },
  { key: 'bold', icon: Bold, label: 'Bold text', around: ['**', '**'], placeholder: 'bold text' },
  { key: 'italic', icon: Italic, label: 'Italic text', around: ['*', '*'], placeholder: 'italic text' },
  { key: 'bullet', icon: List, label: 'Bulleted list', prefix: '- ' },
  { key: 'ordered', icon: ListOrdered, label: 'Numbered list', prefix: '1. ' },
  { key: 'quote', icon: Quote, label: 'Quote', prefix: '> ' },
  { key: 'link', icon: Link2, label: 'Insert link', around: ['[', '](https://example.com)'], placeholder: 'link text' },
];

function buildInitialValues(note) {
  return {
    title: note?.title || '',
    content: note?.content || '',
    categoryId: note?.categoryId || '',
    folderId: note?.folderId || '',
    tags: note?.tags ? [...note.tags] : [],
    isPinned: note?.isPinned || false,
  };
}

export default function NoteEditorForm({
  note = null,
  categories = [],
  folders = [],
  onSubmit,
  onCancel,
  busy = false,
}) {
  const isEditing = Boolean(note);
  const [values, setValues] = useState(() => buildInitialValues(note));
  const [errors, setErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const contentRef = useRef(null);

  const initialValues = useMemo(() => buildInitialValues(note), [note]);

  const dirty = useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues),
    [values, initialValues]
  );

  useUnsavedChanges(dirty);

  const setValue = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (submitAttempted) {
      const next = { ...values, [field]: value };
      setErrors(validateNoteForm(next));
    }
  };

  /** Applies a toolbar action to the content textarea. */
  const applyAction = (action) => {
    const el = contentRef.current;
    if (!el) return;

    const { selectionStart, selectionEnd } = el;
    const content = values.content;

    let nextContent;
    let caretStart;
    let caretEnd;

    if (action.around) {
      const [before, after] = action.around;
      const selected = content.slice(selectionStart, selectionEnd) || action.placeholder || '';
      nextContent = content.slice(0, selectionStart) + before + selected + after + content.slice(selectionEnd);
      caretStart = selectionStart + before.length;
      caretEnd = caretStart + selected.length;
    } else {
      // Line-prefix actions operate on the line containing the caret.
      const lineStart = content.lastIndexOf('\n', selectionStart - 1) + 1;
      const lineEndIndex = content.indexOf('\n', selectionStart);
      const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex;
      const line = content.slice(lineStart, lineEnd);
      const prefixed = line.startsWith(action.prefix)
        ? line.slice(action.prefix.length)
        : action.prefix + line;
      nextContent = content.slice(0, lineStart) + prefixed + content.slice(lineEnd);
      caretStart = lineStart + prefixed.length;
      caretEnd = caretStart;
    }

    setValues((current) => ({ ...current, content: nextContent }));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = caretStart;
      el.selectionEnd = caretEnd;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitAttempted(true);

    const validationErrors = validateNoteForm(values);
    setErrors(validationErrors);
    if (hasErrors(validationErrors)) return;

    await onSubmit({
      title: values.title.trim(),
      content: values.content,
      categoryId: values.categoryId || null,
      folderId: values.folderId || null,
      tags: normalizeTags(values.tags),
      isPinned: values.isPinned,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="editor-grid">
        <div>
          <div className="editor-surface">
            <label className="visually-hidden-focusable" htmlFor="note-title">
              Note title
            </label>
            <input
              id="note-title"
              type="text"
              className={`form-control-cn title-input${errors.title ? ' is-invalid' : ''}`}
              value={values.title}
              onChange={(event) => setValue('title', event.target.value)}
              placeholder="Note title"
              maxLength={MAX_TITLE_LENGTH}
              autoFocus
              aria-invalid={errors.title ? 'true' : undefined}
              aria-describedby={errors.title ? 'note-title-error' : undefined}
            />
            {errors.title && (
              <p className="form-error" id="note-title-error" role="alert" style={{ padding: '0 1.5rem' }}>
                {errors.title}
              </p>
            )}

            <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
              {TOOLBAR_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.key}
                    type="button"
                    className="btn-icon"
                    onClick={() => applyAction(action)}
                    aria-label={action.label}
                    title={action.label}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>

            <label className="visually-hidden-focusable" htmlFor="note-content">
              Note content
            </label>
            <textarea
              id="note-content"
              ref={contentRef}
              className={`form-control-cn content-input${errors.content ? ' is-invalid' : ''}`}
              value={values.content}
              onChange={(event) => setValue('content', event.target.value)}
              placeholder={
                'Start writing…\n\n# Heading\n## Subheading\n- bullet point\n1. numbered item\n> quote\n**bold** and *italic*\n[link text](https://example.com)'
              }
              aria-invalid={errors.content ? 'true' : undefined}
              aria-describedby={errors.content ? 'note-content-error' : 'note-content-hint'}
            />
            {errors.content && (
              <p className="form-error" id="note-content-error" role="alert" style={{ padding: '0 1.5rem' }}>
                {errors.content}
              </p>
            )}
          </div>

          <p className="markdown-hint" id="note-content-hint" style={{ marginTop: '0.7rem' }}>
            Supports <code># headings</code>, <code>- lists</code>, <code>&gt; quotes</code>,{' '}
            <code>**bold**</code>, <code>*italic*</code>, and <code>[links](https://…)</code>.
            The same text powers PDF, Word, TXT, and Markdown exports.
          </p>
        </div>

        <div className="editor-side">
          <div className="card-cn card-cn--pad">
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label className="form-label-cn" htmlFor="note-category">
                Category
              </label>
              <select
                id="note-category"
                className="form-control-cn"
                value={values.categoryId}
                onChange={(event) => setValue('categoryId', event.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {folders.length > 0 && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="form-label-cn" htmlFor="note-folder">
                  Study folder <span className="optional-tag">(optional)</span>
                </label>
                <select
                  id="note-folder"
                  className="form-control-cn"
                  value={values.folderId}
                  onChange={(event) => setValue('folderId', event.target.value)}
                >
                  <option value="">No folder</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <TagInput
              tags={values.tags}
              onChange={(tags) => setValue('tags', tags)}
              disabled={busy}
            />

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.8rem',
                paddingTop: '0.6rem',
              }}
            >
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--heading)' }}>
                  Pin this note
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Keep it at the top of your dashboard.
                </div>
              </div>
              <Switch
                checked={values.isPinned}
                onChange={(checked) => setValue('isPinned', checked)}
                label="Pin this note"
              />
            </div>
          </div>

          <div className="editor-actions-row" style={{ marginTop: 0 }}>
            <Button type="submit" variant="primary" loading={busy} icon={<Save size={15} />}>
              {isEditing ? 'Save changes' : 'Create note'}
            </Button>
            <Button variant="secondary" onClick={onCancel} disabled={busy} icon={<X size={15} />}>
              Cancel
            </Button>
          </div>

          {dirty && (
            <p className="form-hint" role="status">
              You have unsaved changes.
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
