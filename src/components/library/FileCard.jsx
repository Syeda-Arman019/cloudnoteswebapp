/**
 * FileCard — one file in the grid layout: icon, name, metadata, actions.
 * Clicking the body opens the preview (or the download for office formats).
 */

import { Pin } from 'lucide-react';
import { formatBytes, getFileInfo } from '@/utils/files';
import { formatRelative } from '@/utils/dates';
import FileIcon from './FileIcon';
import FileActionsMenu from './FileActionsMenu';

export default function FileCard({
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
}) {
  const { label } = getFileInfo(file.extension);
  const meta = [label, formatBytes(file.sizeBytes)].join(' · ');

  return (
    <article
      className={`file-card${selected ? ' is-selected' : ''}`}
      onClick={() => onOpen?.(file)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen?.(file);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open ${file.name}`}
    >
      <div className="file-card-top">
        {onToggleSelect ? (
          <input
            type="checkbox"
            className="file-select"
            checked={selected}
            onChange={() => onToggleSelect(file)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Select ${file.name}`}
          />
        ) : (
          <span />
        )}
        <div className="file-card-actions" onClick={(event) => event.stopPropagation()}>
          {file.isPinned && (
            <span className="pin-badge" title="Pinned">
              <Pin size={12} aria-hidden="true" />
            </span>
          )}
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

      <div className="file-card-icon">
        <FileIcon extension={file.extension} size="lg" />
      </div>

      <div className="file-card-body">
        <h3 className="file-card-name" title={file.name}>
          {file.name}
        </h3>
        <p className="file-card-meta">{meta}</p>
        <p className="file-card-date">
          {file.isTrashed
            ? `Trashed ${formatRelative(file.deletedAt)}`
            : `Added ${formatRelative(file.createdAt)}`}
        </p>
        {file.folderName && <span className="file-folder-chip">{file.folderName}</span>}
      </div>
    </article>
  );
}
