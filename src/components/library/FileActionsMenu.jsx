/**
 * FileActionsMenu — per-file dropdown. Every item maps to a real handler;
 * trash-mode files get Restore/Purge instead of Rename/Move/Trash.
 */

import {
  Download,
  FolderInput,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  RotateCcw,
  Share2,
  Trash2,
  Eye,
  XCircle,
} from 'lucide-react';
import Dropdown from '@/components/common/Dropdown';
import { isPreviewable } from '@/utils/files';

export default function FileActionsMenu({
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
}) {
  return (
    <Dropdown
      menuLabel={`Actions for ${file.name}`}
      trigger={({ toggle, props }) => (
        <button
          type="button"
          className="btn-icon"
          onClick={toggle}
          {...props}
          aria-label={`Actions for ${file.name}`}
        >
          <MoreHorizontal size={16} />
        </button>
      )}
    >
      {({ close }) => {
        const act = (handler) => () => {
          close();
          handler?.(file);
        };
        const item = (key, Icon, label, handler, danger = false) => (
          <button
            key={key}
            type="button"
            role="menuitem"
            className={`dropdown-item-cn${danger ? ' is-danger' : ''}`}
            onClick={act(handler)}
          >
            <Icon size={15} aria-hidden="true" />
            {label}
          </button>
        );

        if (file.isTrashed) {
          return (
            <>
              {item('restore', RotateCcw, 'Restore to library', onRestore)}
              {item('purge', XCircle, 'Delete permanently', onPurge, true)}
            </>
          );
        }

        return (
          <>
            {isPreviewable(file) ? (
              <>
                {item('open', Eye, 'Preview', onOpen)}
                {item('download', Download, 'Download', onDownload)}
              </>
            ) : (
              // Honest formats: no preview is offered — download instead.
              item('open', Download, 'Download', onDownload)
            )}
            {item('rename', Pencil, 'Rename', onRename)}
            {item('move', FolderInput, 'Move to folder', onMove)}
            {item(
              'pin',
              file.isPinned ? PinOff : Pin,
              file.isPinned ? 'Unpin' : 'Pin to top',
              onTogglePin
            )}
            {!file.isTrashed && onShare && (
              item('share', Share2, 'Share with class', onShare)
            )}
            <div className="dropdown-divider-cn" />
            {item('trash', Trash2, 'Move to trash', onTrash, true)}
          </>
        );
      }}
    </Dropdown>
  );
}
