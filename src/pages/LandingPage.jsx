/**
 * LandingPage — the public product page for CloudNotes.
 */

import {
  ArrowRight,
  CheckCircle2,
  Cloud,
  Download,
  FolderOpen,
  Gauge,
  Search,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Wand2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import DashboardPreview from '@/components/landing/DashboardPreview';
import { useAuth } from '@/context/AuthContext';
import { useDocumentTitle } from '@/hooks';
import { APP_TAGLINE } from '@/utils/constants';

const FEATURES = [
  {
    icon: FolderOpen,
    tone: '',
    title: 'Organized by category',
    description:
      'Work, study, personal, ideas, and projects — plus your own custom categories, always one click away.',
  },
  {
    icon: Search,
    tone: 'cyan',
    title: 'Instant search & filters',
    description:
      'Find any note by title or content, then narrow by category, pinned status, or sort order.',
  },
  {
    icon: Gauge,
    tone: 'violet',
    title: 'Built for productivity',
    description:
      'A focused dashboard with pinned notes, recent activity, and quick actions that keep your day moving.',
  },
  {
    icon: Download,
    tone: 'green',
    title: 'Ready to export',
    description:
      'Notes stay portable — prepared for PDF, Microsoft Word, plain text, and Markdown exports.',
  },
];

const STEPS = [
  {
    title: 'Create your account',
    description: 'Register in seconds with your name, email, and a secure password.',
  },
  {
    title: 'Capture every thought',
    description: 'Write notes with headings, lists, and links, then file them under categories and tags.',
  },
  {
    title: 'Find, pin, and share',
    description: 'Search instantly, pin what matters, and export notes in the format you need.',
  },
];

export default function LandingPage() {
  useDocumentTitle('');
  const { isAuthenticated } = useAuth();

  return (
    <>
      {/* Hero */}
      <section className="hero">
        <div className="page-container hero-grid">
          <div>
            <span className="hero-eyebrow">
              <Sparkles size={14} aria-hidden="true" />
              Cloud-based notes &amp; productivity
            </span>

            <h1>
              Your thoughts, <span className="accent">organized</span> anywhere.
            </h1>

            <p className="hero-tagline">{APP_TAGLINE}</p>

            <p className="hero-desc">
              CloudNotes is a cloud-based notes and productivity platform that helps you
              organize personal, study, work, and project notes — beautifully, consistently,
              and from any device.
            </p>

            <div className="hero-actions">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn-cn btn-primary btn-lg">
                  Open dashboard
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ) : (
                <Link to="/register" className="btn-cn btn-primary btn-lg">
                  Get started — it's free
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              )}
              <Link to="/login" className="btn-cn btn-secondary btn-lg">
                Log in
              </Link>
            </div>

            <div className="hero-stats">
              <div className="hero-stat">
                <strong>Light &amp; dark</strong>
                <span>Comfortable in every environment</span>
              </div>
              <div className="hero-stat">
                <strong>Any device</strong>
                <span>Responsive desktop, tablet, mobile</span>
              </div>
              <div className="hero-stat">
                <strong>Export-ready</strong>
                <span>PDF, Word, TXT, and Markdown</span>
              </div>
            </div>
          </div>

          <DashboardPreview />
        </div>
      </section>

      {/* Features */}
      <section className="section section-alt" id="features">
        <div className="page-container">
          <div className="section-head">
            <span className="section-eyebrow">Features</span>
            <h2>Everything you need to keep notes under control</h2>
            <p>
              A focused toolset for capturing ideas, organizing them, and getting them back
              out when you need them.
            </p>
          </div>

          <div className="features-grid">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <article className="feature-card" key={feature.title}>
                  <span className={`feature-icon ${feature.tone}`.trim()} aria-hidden="true">
                    <Icon size={22} />
                  </span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how-it-works">
        <div className="page-container">
          <div className="section-head">
            <span className="section-eyebrow">How it works</span>
            <h2>From thought to organized in three steps</h2>
            <p>CloudNotes stays out of the way so writing and finding notes feel effortless.</p>
          </div>

          <div className="steps-grid">
            {STEPS.map((step, index) => (
              <article className="step-card" key={step.title}>
                <span className="step-num" aria-hidden="true">
                  {index + 1}
                </span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="page-container">
          <div className="cta-band">
            <span className="brand-mark" style={{ margin: '0 auto 1.1rem' }} aria-hidden="true">
              <Cloud size={20} />
            </span>
            <h2>Start organizing your notes today</h2>
            <p>
              Create your CloudNotes account and see how much calmer your ideas feel when
              they live in one organized place.
            </p>
            <div className="cta-actions">
              {isAuthenticated ? (
                <Link to="/dashboard" className="btn-cn btn-primary btn-lg">
                  Open dashboard
                  <ArrowRight size={17} aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link to="/register" className="btn-cn btn-primary btn-lg">
                    Create free account
                    <ArrowRight size={17} aria-hidden="true" />
                  </Link>
                  <Link to="/login" className="btn-cn btn-secondary btn-lg">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>

          <div
            style={{
              margin: '1.8rem auto 0',
              maxWidth: 720,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '1.4rem',
              color: 'var(--text-muted)',
              fontSize: '0.87rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <CheckCircle2 size={15} aria-hidden="true" /> Personal, study &amp; work notes
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <Wand2 size={15} aria-hidden="true" /> Clean, distraction-free editor
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <ShieldCheck size={15} aria-hidden="true" /> Your account, your data
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <StickyNote size={15} aria-hidden="true" /> Pin what matters most
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
