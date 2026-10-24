/** FolderCard — one folder in grid layouts, with counts and quick actions. */

import { Folder, FolderOpen, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import Dropdown from '@/components/common/Dropdown';

export default function FolderCard({ folder, onRename, onDelete, to = null }) {
  const link = to || `/library?folder=${folder.id}`;

  return (
    <article className="folder-card">
      <div className="folder-card-head">
        <Link to={link} className="folder-card-link" aria-label={`Open folder ${folder.name}`}>
          <span className="folder-icon" aria-hidden="true">
            <Folder size={22} />
          </span>
          <h3 className="folder-card-name" title={folder.name}>
            {folder.name}
          </h3>
        </Link>
        <Dropdown
          menuLabel={`Actions for ${folder.name}`}
          trigger={({ toggle, props }) => (
            <button type="button" className="btn-icon" onClick={toggle} {...props} aria-label={`Actions for ${folder.name}`}>
              <MoreHorizontal size={16} />
            </button>
          )}
        >
          {({ close }) => (
            <>
              <button
                type="button"
                role="menuitem"
                className="dropdown-item-cn"
                onClick={() => {
                  close();
                  onRename?.(folder);
                }}
              >
                <Pencil size={15} aria-hidden="true" />
                Rename
              </button>
              <button
                type="button"
                role="menuitem"
                className="dropdown-item-cn is-danger"
                onClick={() => {
                  close();
                  onDelete?.(folder);
                }}
              >
                <Trash2 size={15} aria-hidden="true" />
                Delete
              </button>
            </>
          )}
        </Dropdown>
      </div>

      <Link to={link} className="folder-card-stats" tabIndex={-1} aria-hidden="true">
        <span>
          <FolderOpen size={13} />
          {folder.folderCount} subfolder{folder.folderCount === 1 ? '' : 's'}
        </span>
        <span>
          {folder.fileCount} file{folder.fileCount === 1 ? '' : 's'}
        </span>
      </Link>
    </article>
  );
}
