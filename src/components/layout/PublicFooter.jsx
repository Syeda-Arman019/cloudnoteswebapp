/**
 * PublicFooter — shared footer for the landing and authentication pages.
 * Only real, working links are listed.
 */

import { Link } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { APP_NAME, APP_TAGLINE } from '@/utils/constants';
import ThemeToggle from '@/components/common/ThemeToggle';

export default function PublicFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="public-footer">
      <div className="page-container">
        <div className="footer-grid">
          <div className="footer-brand">
            <span className="brand">
              <span className="brand-mark" aria-hidden="true">
                <Cloud size={19} />
              </span>
              <span className="brand-text">
                Cloud<span>Notes</span>
              </span>
            </span>
            <p>
              {APP_TAGLINE} A cloud-based notes and productivity platform for personal,
              study, work, and project notes.
            </p>
          </div>

          <div className="footer-col">
            <h4>Product</h4>
            <ul>
              <li>
                <Link to="/#features">Features</Link>
              </li>
              <li>
                <Link to="/#how-it-works">How it works</Link>
              </li>
              <li>
                <Link to="/register">Get started</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>Account</h4>
            <ul>
              <li>
                <Link to="/login">Log in</Link>
              </li>
              <li>
                <Link to="/register">Create account</Link>
              </li>
              <li>
                <Link to="/settings">Settings</Link>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4>CloudNotes</h4>
            <ul>
              <li>
                <Link to="/">Home</Link>
              </li>
              <li>
                <Link to="/notes">Notes</Link>
              </li>
              <li>
                <Link to="/register">Start free</Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>
            © {year} {APP_NAME}. Designed &amp; Developed by Syeda Arman Shah.
          </span>
          <ThemeToggle withLabel />
        </div>
      </div>
    </footer>
  );
}
