/**
 * FilesToolbar — search + filters + sort + view toggle for file lists.
 * Every control is a native select/input for full keyboard accessibility.
 */

import { Grid2X2, List, RotateCcw, Search } from 'lucide-react';
import {
  FILE_KIND_OPTIONS,
  FILE_SORT_OPTIONS,
  UPLOAD_DATE_OPTIONS,
} from '@/utils/files';
import Button from '@/components/common/Button';

export default function FilesToolbar({
  search,
  onSearchChange,
  type,
  onTypeChange,
  uploaded,
  onUploadedChange,
  sort,
  onSortChange,
  view,
  onViewChange,
  folders = [],
  folder = 'all',
  onFolderChange = null,
  hasActiveFilters = false,
  onClear = null,
  children = null,
}) {
  return (
    <div className="files-toolbar">
      <div className="toolbar-row">
        <div className="search-field toolbar-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            className="form-control-cn"
            placeholder="Search files by name…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            aria-label="Search files"
          />
        </div>

        {onFolderChange && (
          <select
            className="form-control-cn toolbar-select"
            value={folder}
            onChange={(event) => onFolderChange(event.target.value)}
            aria-label="Filter by folder"
          >
            <option value="all">All folders</option>
            <option value="root">Study Library root</option>
            {folders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}

        <select
          className="form-control-cn toolbar-select"
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
          aria-label="Filter by file type"
        >
          {FILE_KIND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="form-control-cn toolbar-select"
          value={uploaded}
          onChange={(event) => onUploadedChange(event.target.value)}
          aria-label="Filter by upload date"
        >
          {UPLOAD_DATE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          className="form-control-cn toolbar-select"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          aria-label="Sort files"
        >
          {FILE_SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <div className="view-toggle" role="group" aria-label="Layout">
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            onClick={() => onViewChange('grid')}
            aria-label="Grid view"
            aria-pressed={view === 'grid'}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => onViewChange('list')}
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <List size={15} />
          </button>
        </div>

        {hasActiveFilters && onClear && (
          <Button variant="ghost" size="sm" icon={<RotateCcw size={14} />} onClick={onClear}>
            Clear
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
