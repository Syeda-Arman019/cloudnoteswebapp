/**
 * NotesToolbar — search, category/pin filters, sorting and grid/list toggle.
 * Every control is wired to the notes page, so each one has real behaviour.
 */

import { LayoutGrid, List, Search, X } from 'lucide-react';
import { NOTE_SORT_OPTIONS, NOTE_VIEWS } from '@/utils/constants';

export default function NotesToolbar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  pinned,
  onPinnedChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  categories,
  onClear,
  hasActiveFilters,
}) {
  return (
    <div className="notes-toolbar">
      <div className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="form-control-cn"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by title or content…"
          aria-label="Search notes by title or content"
        />
      </div>

      <div className="toolbar-filters">
        <select
          className="form-control-cn"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
          aria-label="Filter by category"
        >
          <option value="all">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          className="form-control-cn"
          value={pinned}
          onChange={(event) => onPinnedChange(event.target.value)}
          aria-label="Filter by pinned status"
        >
          <option value="all">Pinned &amp; unpinned</option>
          <option value="pinned">Pinned only</option>
          <option value="unpinned">Unpinned only</option>
        </select>

        <select
          className="form-control-cn"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          aria-label="Sort notes"
        >
          {NOTE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            className="btn-cn btn-ghost btn-sm"
            onClick={onClear}
            title="Clear all filters"
          >
            <X size={14} aria-hidden="true" />
            Clear
          </button>
        )}

        <div className="segmented" role="group" aria-label="Change layout">
          <button
            type="button"
            className={view === NOTE_VIEWS.GRID ? 'is-active' : ''}
            onClick={() => onViewChange(NOTE_VIEWS.GRID)}
            aria-pressed={view === NOTE_VIEWS.GRID}
            title="Grid view"
          >
            <LayoutGrid size={15} aria-hidden="true" />
            <span className="view-label">Grid</span>
          </button>
          <button
            type="button"
            className={view === NOTE_VIEWS.LIST ? 'is-active' : ''}
            onClick={() => onViewChange(NOTE_VIEWS.LIST)}
            aria-pressed={view === NOTE_VIEWS.LIST}
            title="List view"
          >
            <List size={15} aria-hidden="true" />
            <span className="view-label">List</span>
          </button>
        </div>
      </div>
    </div>
  );
}
