/**
 * CategoriesPage — manage the categories that organize your notes.
 *
 * The five default categories (Work, Study, Personal, Ideas, Projects) are
 * protected from renaming/deletion; custom categories can be added, renamed,
 * recolored, and deleted (with confirmation). Counts are derived from the
 * notes currently loaded through the data store.
 */

import { useState } from 'react';
import { FolderOpen, Lock, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotesStore } from '@/context/NotesContext';
import { useNotifications } from '@/context/NotificationContext';
import { useDocumentTitle } from '@/hooks';
import { getCategoryClass } from '@/utils/constants';
import Button from '@/components/common/Button';
import ConfirmDialog from '@/components/common/ConfirmDialog';
import CategoryFormModal from '@/components/categories/CategoryFormModal';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/StateViews';

export default function CategoriesPage() {
  useDocumentTitle('Categories');
  const {
    categories,
    notesByCategory,
    stats,
    createCategory,
    updateCategory,
    deleteCategory,
    isLoading,
    hasLoaded,
    error,
    reload,
  } = useNotesStore();
  const { success, error: notifyError } = useNotifications();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (category) => {
    setEditing(category);
    setFormOpen(true);
  };

  const handleSubmit = async (values) => {
    setSaving(true);
    try {
      if (editing) {
        const updated = await updateCategory(editing.id, values);
        success('Category updated', `“${updated.name}” has been renamed or restyled.`);
      } else {
        const created = await createCategory(values);
        success('Category created', `“${created.name}” is ready for your notes.`);
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      notifyError(editing ? 'Could not update category' : 'Could not create category', err.message);
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteCategory(pendingDelete.id);
      success(
        'Category deleted',
        `“${pendingDelete.name}” was removed. Its notes are now uncategorized.`
      );
      setPendingDelete(null);
    } catch (err) {
      notifyError('Could not delete category', err.message);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading && !hasLoaded) {
    return (
      <div className="page-container">
        <LoadingState label="Loading categories…" />
      </div>
    );
  }

  if (error && !hasLoaded) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load categories" message={error} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-subtitle">
            Keep your notes grouped the way you think. Defaults are locked; everything else
            is yours to shape.
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <div className="card-cn">
          <EmptyState
            icon={<FolderOpen size={26} />}
            title="No categories yet"
            description="Create your first category to start grouping your notes."
            action={<Button onClick={openCreate}>Create category</Button>}
          />
        </div>
      ) : (
        <div className="categories-grid">
          {categories.map((category) => {
            const count = notesByCategory[category.id] || 0;
            return (
              <article className="category-card" key={category.id}>
                <div className="category-card-head">
                  <span
                    className={`category-icon ${getCategoryClass(category.color)}`}
                    aria-hidden="true"
                  >
                    <FolderOpen size={20} />
                  </span>

                  {category.isDefault ? (
                    <span className="default-flag" title="Default category">
                      <Lock size={11} aria-hidden="true" style={{ marginRight: 3 }} />
                      Default
                    </span>
                  ) : (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => openEdit(category)}
                        aria-label={`Rename ${category.name}`}
                        title="Edit category"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() => setPendingDelete(category)}
                        aria-label={`Delete ${category.name}`}
                        title="Delete category"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <h3>{category.name}</h3>
                  <p className="cat-desc">
                    {category.description || 'No description yet.'}
                  </p>
                </div>

                <div className="category-card-foot">
                  <span className="note-count">
                    {count} note{count === 1 ? '' : 's'}
                  </span>
                  <Link
                    to={`/notes?category=${encodeURIComponent(category.id)}`}
                    className="link-button"
                    style={{ fontSize: '0.83rem', fontWeight: 600 }}
                  >
                    View notes →
                  </Link>
                </div>
              </article>
            );
          })}

          {/* Uncategorized pseudo-category keeps navigation complete */}
          <article className="category-card">
            <div className="category-card-head">
              <span className="category-icon cat-default" aria-hidden="true">
                <StickyNote size={20} />
              </span>
            </div>
            <div>
              <h3>Uncategorized</h3>
              <p className="cat-desc">Notes that do not belong to any category yet.</p>
            </div>
            <div className="category-card-foot">
              <span className="note-count">
                {stats.uncategorized} note{stats.uncategorized === 1 ? '' : 's'}
              </span>
              <Link
                to="/notes?category=uncategorized"
                className="link-button"
                style={{ fontSize: '0.83rem', fontWeight: 600 }}
              >
                View notes →
              </Link>
            </div>
          </article>
        </div>
      )}

      <CategoryFormModal
        open={formOpen}
        category={editing}
        existingNames={categories.filter((c) => c.id !== editing?.id)}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
        busy={saving}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Delete this category?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be removed. Its ${notesByCategory[pendingDelete.id] || 0} note(s) will become uncategorized — they will not be deleted.`
            : ''
        }
        confirmLabel="Delete category"
      />
    </div>
  );
}
