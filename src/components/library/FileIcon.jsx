/** FileIcon — a small type badge shared by cards, rows, and dialogs. */

import { getFileInfo } from '@/utils/files';

export default function FileIcon({ extension, size = 'md' }) {
  const { Icon, label } = getFileInfo(extension);
  return (
    <span
      className={`file-type-icon file-type-icon--${getFileInfo(extension).kind} file-type-icon--${size}`}
      role="img"
      aria-label={label}
    >
      <Icon size={size === 'lg' ? 24 : size === 'sm' ? 13 : 18} aria-hidden="true" />
    </span>
  );
}
