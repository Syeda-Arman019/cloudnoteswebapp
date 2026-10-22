/**
 * CategoryBadge — coloured pill used on note cards, lists and detail views.
 */

import { getCategoryClass } from '@/utils/constants';

export default function CategoryBadge({ category }) {
  if (!category) {
    return (
      <span className="badge-cn cat-default">
        <span className="badge-dot" aria-hidden="true" />
        Uncategorized
      </span>
    );
  }

  return (
    <span className={`badge-cn ${getCategoryClass(category.color)}`}>
      <span className="badge-dot" aria-hidden="true" />
      {category.name}
    </span>
  );
}
