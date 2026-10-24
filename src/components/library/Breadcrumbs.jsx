/** Breadcrumbs — folder-path navigation (library root → … → current). */

import { ChevronRight, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Breadcrumbs({ path = [], rootTo = '/library', onNavigate = null }) {
  return (
    <nav className="breadcrumbs" aria-label="Folder path">
      <ol>
        <li>
          <Link to={rootTo} onClick={onNavigate}>
            <FolderOpen size={14} aria-hidden="true" />
            Study Library
          </Link>
        </li>
        {path.map((folder, index) => {
          const isLast = index === path.length - 1;
          return (
            <li key={folder.id}>
              <ChevronRight size={13} className="crumb-sep" aria-hidden="true" />
              {isLast ? (
                <span aria-current="page">{folder.name}</span>
              ) : (
                <Link to={`/library?folder=${folder.id}`} onClick={onNavigate}>
                  {folder.name}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
