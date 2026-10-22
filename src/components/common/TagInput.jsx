/**
 * TagInput — chip-style tag entry used by the note editor.
 * Enter or comma adds a tag; Backspace on an empty field removes the last one.
 */

import { useId, useState } from 'react';
import { X } from 'lucide-react';
import { MAX_TAGS, MAX_TAG_LENGTH } from '@/utils/constants';
import { normalizeTags } from '@/utils/validation';

export default function TagInput({ tags = [], onChange, disabled = false, maxTags = MAX_TAGS }) {
  const id = useId();
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    const cleaned = draft.trim().replace(/^#/, '');
    if (!cleaned) return;
    if (tags.length >= maxTags) {
      setDraft('');
      return;
    }
    const merged = normalizeTags([...tags, cleaned]);
    onChange(merged);
    setDraft('');
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && !draft && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (index) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  return (
    <div className="form-group">
      <label className="form-label-cn" htmlFor={id}>
        Tags
      </label>
      <div className="tag-input-box">
        {tags.map((tag, index) => (
          <span className="tag-chip" key={tag.toLowerCase()}>
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              aria-label={`Remove tag ${tag}`}
              disabled={disabled}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value.slice(0, MAX_TAG_LENGTH))}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          disabled={disabled || tags.length >= maxTags}
          placeholder={tags.length >= maxTags ? 'Tag limit reached' : 'Add a tag and press Enter'}
          aria-describedby={`${id}-hint`}
        />
      </div>
      <span className="form-hint" id={`${id}-hint`}>
        Press Enter or comma to add. Up to {maxTags} tags.
      </span>
    </div>
  );
}
