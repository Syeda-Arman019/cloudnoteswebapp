/**
 * CategoryShortcuts — dashboard sidebar list linking to filtered note views.
 */

import { FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getCategoryClass } from '@/utils/constants';

export default function CategoryShortcuts({ categories, notesByCategory, total }) {
  return (
    <div className="card-cn">
      <div className="card-header-cn">
        <h2>Categories</h2>
        <Link to="/categories" className="link-button" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
          Manage
        </Link>
      </div>
      <div className="card-body-cn cat-shortcut-list">
        <Link to="/notes" className="cat-shortcut">
          <span className="feature-icon" style={{ width: 32, height: 32, marginBottom: 0 }} aria-hidden="true">
            <FolderOpen size={15} />
          </span>
          <span>All notes</span>
          <span className="cat-count">{total}</span>
        </Link>

        {categories.map((category) => (
          <Link
            key={category.id}
            to={`/notes?category=${encodeURIComponent(category.id)}`}
            className="cat-shortcut"
          >
            <span
              className={`category-icon ${getCategoryClass(category.color)}`}
              style={{ width: 32, height: 32 }}
              aria-hidden="true"
            >
              <FolderOpen size={15} />
            </span>
            <span>{category.name}</span>
            <span className="cat-count">{notesByCategory[category.id] || 0}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
