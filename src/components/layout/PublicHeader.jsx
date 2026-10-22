/**
 * PublicHeader — navigation for the landing and authentication pages.
 */

import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Brand from './Brand';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function PublicHeader() {
  const location = useLocation();
  const onLanding = location.pathname === '/';

  return (
    <header className="public-header">
      <div className="page-container public-header-inner">
        <Brand />

        <nav className="public-nav" aria-label="Primary">
          {onLanding && (
            <>
              <a href="#features" className="nav-link-hide-sm">
                Features
              </a>
              <a href="#how-it-works" className="nav-link-hide-sm">
                How it works
              </a>
            </>
          )}
        </nav>

        <div className="public-nav-actions">
          <ThemeToggle />
          <NavLink to="/login" className="btn-cn btn-ghost btn-sm">
            Log in
          </NavLink>
          <Link to="/register" className="btn-cn btn-primary btn-sm">
            Get started
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </header>
  );
}
