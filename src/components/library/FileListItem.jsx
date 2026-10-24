/**
 * FileListItem — one file in the list layout: a compact, sortable-looking
 * row with icon, name, folder, type, size, date, and actions.
 */

import { Pin } from 'lucide-react';
import { formatBytes, getFileInfo } from '@/utils/files';
import { formatRelative } from '@/utils/dates';
import FileActionsMenu from './FileActionsMenu';

export default function FileListItem({
  file,
  onOpen,
  onRename,
  onMove,
  onDownload,
  onTogglePin,
  onTrash,
  onRestore,
  onPurge,
  onShare,
  selected = false,
  onToggleSelect = null,
  showFolder = true,
}) {
  const { Icon, label } = getFileInfo(file.extension);

  return (
    <div
      className={`file-row${selected ? ' is-selected' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(file);
        }
      }}
      aria-label={`Open ${file.name}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          className="file-select"
          checked={selected}
          onChange={() => onToggleSelect(file)}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Select ${file.name}`}
        />
      )}

      <span className={`file-row-icon file-type-icon--${getFileInfo(file.extension).kind}`}>
        <Icon size={17} aria-hidden="true" />
      </span>

      <div className="file-row-name">
        <span className="name" title={file.name}>
          {file.isPinned && <Pin size={11} className="pin-inline" aria-hidden="true" />}
          {file.name}
        </span>
        <span className="sub-mobile">
          {label} · {formatBytes(file.sizeBytes)}
        </span>
      </div>

      {showFolder && <span className="file-row-folder">{file.folderName || '—'}</span>}
      <span className="file-row-type">{label}</span>
      <span className="file-row-size">{formatBytes(file.sizeBytes)}</span>
      <span className="file-row-date">
        {file.isTrashed ? formatRelative(file.deletedAt) : formatRelative(file.createdAt)}
      </span>

      <div className="file-row-actions" onClick={(event) => event.stopPropagation()}>
        <FileActionsMenu
          file={file}
          onOpen={onOpen}
          onRename={onRename}
          onMove={onMove}
          onDownload={onDownload}
          onTogglePin={onTogglePin}
          onTrash={onTrash}
          onRestore={onRestore}
          onPurge={onPurge}
          onShare={onShare}
        />
      </div>
    </div>
  );
}
