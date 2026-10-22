/**
 * CategoryFormModal — create or rename a custom category.
 * Colour is chosen from the shared category palette so badges stay consistent.
 */

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import Modal from '@/components/common/Modal';
import Button from '@/components/common/Button';
import { TextField, TextAreaField } from '@/components/common/FormFields';
import { validateCategoryName, hasErrors } from '@/utils/validation';
import { CATEGORY_COLORS, getCategoryClass } from '@/utils/constants';

function buildInitial(category) {
  return {
    name: category?.name || '',
    description: category?.description || '',
    color: category?.color || 'default',
  };
}

export default function CategoryFormModal({
  open,
  category = null,
  existingNames = [],
  onClose,
  onSubmit,
  busy = false,
}) {
  const [values, setValues] = useState(() => buildInitial(category));
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (open) {
      setValues(buildInitial(category));
      setErrors({});
    }
  }, [open, category]);

  const isEditing = Boolean(category);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validation = { name: validateCategoryName(values.name, existingNames, category?.id || null) };
    setErrors(validation);
    if (hasErrors(validation)) return;

    await onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      color: values.color,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Edit category' : 'New category'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" loading={busy}>
            {isEditing ? 'Save changes' : 'Create category'}
          </Button>
        </>
      }
      closeOnBackdrop={!busy}
    >
      <form id="category-form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Category name"
          name="name"
          value={values.name}
          onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
          error={errors.name}
          required
          autoFocus
          placeholder="e.g. Research"
          maxLength={40}
        />

        <TextAreaField
          label="Description"
          name="description"
          value={values.description}
          onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
          hint="Optional — helps you recognise the category at a glance."
          rows={3}
          placeholder="What belongs in this category?"
          maxLength={160}
        />

        <div className="form-group">
          <span className="form-label-cn" id="category-color-label">
            Colour
          </span>
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}
            role="group"
            aria-labelledby="category-color-label"
          >
            {CATEGORY_COLORS.map((color) => {
              const selected = values.color === color.key;
              return (
                <button
                  key={color.key}
                  type="button"
                  onClick={() => setValues((current) => ({ ...current, color: color.key }))}
                  className={`badge-cn ${getCategoryClass(color.key)}`}
                  style={{
                    padding: '0.45rem 0.8rem',
                    border: selected ? '2px solid currentColor' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                  aria-pressed={selected}
                  aria-label={`Colour: ${color.label}`}
                >
                  <span className="badge-dot" aria-hidden="true" />
                  {color.label}
                  {selected && <Check size={12} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </div>
      </form>
    </Modal>
  );
}
