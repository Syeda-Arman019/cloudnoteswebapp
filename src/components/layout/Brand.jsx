/**
 * Brand — the CloudNotes logo lockup, reused in the public header, auth pages,
 * app sidebar, and footer.
 */

import { Cloud, NotebookPen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '@/utils/constants';

export default function Brand({ to = '/', size = 'md', onClick = null, light = false }) {
  const markSize = size === 'sm' ? 'brand-mark--sm' : '';
  const Wrapper = onClick ? 'button' : Link;
  const wrapperProps = onClick ? { type: 'button', onClick, style: { background: 'none', border: 'none', cursor: 'pointer' } } : { to };

  return (
    <Wrapper className={`brand${light ? ' brand-light' : ''}`} {...wrapperProps}>
      <span className={`brand-mark ${markSize}`.trim()} aria-hidden="true">
        {size === 'sm' ? <Cloud size={17} /> : <NotebookPen size={20} />}
      </span>
      <span className="brand-text">
        {APP_NAME.slice(0, 5)}
        <span>{APP_NAME.slice(5)}</span>
      </span>
    </Wrapper>
  );
}
