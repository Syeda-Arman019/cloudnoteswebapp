/**
 * PublicLayout — chrome for unauthenticated pages: header, routed content,
 * footer. Authentication pages render standalone with their own top bar so the
 * sign-in experience stays focused.
 */

import { Outlet, useLocation } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';

export default function PublicLayout() {
  const location = useLocation();
  const isAuthPage = ['/login', '/register'].includes(location.pathname);

  if (isAuthPage) {
    return (
      <div className="public-shell">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="public-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <PublicHeader />
      <main id="main-content" style={{ flex: 1 }}>
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
}
