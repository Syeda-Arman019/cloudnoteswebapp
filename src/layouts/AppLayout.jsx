/**
 * AppLayout — the authenticated application shell.
 *
 * One sidebar instance doubles as the mobile navigation drawer; CSS switches
 * between the two presentations at the responsive breakpoint. The desktop
 * sidebar can collapse to an icon rail (persisted in localStorage).
 * The global UploadModal lives here so uploads keep running across routes.
 */

import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import UploadModal from '@/components/library/UploadModal';
import { STORAGE_KEYS } from '@/utils/constants';

function getInitialCollapsed() {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED) === '1';
  } catch {
    return false;
  }
}

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);
  const location = useLocation();

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname, location.search]);

  // Lock scrolling while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  const toggleCollapse = () => {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, next ? '1' : '0');
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  };

  return (
    <div className={`app-shell${collapsed ? ' sidebar-is-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {drawerOpen && (
        <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} role="presentation" />
      )}

      <Sidebar
        isOpen={drawerOpen}
        isDrawer
        onClose={() => setDrawerOpen(false)}
        onNavigate={() => setDrawerOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
      />

      <div className="app-main">
        <Header onMenuClick={() => setDrawerOpen(true)} />
        <main className="app-content" id="main-content">
          <Outlet />
        </main>
      </div>

      <UploadModal />
    </div>
  );
}
