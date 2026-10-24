/**
 * DashboardPage — personalized productivity overview.
 *
 * Every number is computed from real API data: notes stats from the notes
 * store, file stats (storage usage, recent files, pinned files) from
 * /api/files/stats. Class widgets deliberately arrive with Part 2 — nothing
 * here is fabricated.
 */

import {
  FilePlus2,
  FileText,
  FolderPlus,
  Pin,
  Plus,
  StickyNote,
  Timer,
  HardDrive,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useNotesStore } from '@/context/NotesContext';
import { useFilesStore } from '@/context/FilesContext';
import { useDocumentTitle } from '@/hooks';
import { formatLongDate, getTimeBasedGreeting, formatRelative } from '@/utils/dates';
import { formatBytes, getFileInfo } from '@/utils/files';
import Button from '@/components/common/Button';
import StatCard from '@/components/dashboard/StatCard';
import RecentNotes from '@/components/dashboard/RecentNotes';
import CategoryShortcuts from '@/components/dashboard/CategoryShortcuts';
import CreateFolderDialog from '@/components/library/CreateFolderDialog';
import FileIcon from '@/components/library/FileIcon';
import { LoadingState, ErrorState } from '@/components/common/StateViews';
import foldersService from '@/services/foldersService';
import { useNotifications } from '@/context/NotificationContext';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function DashboardPage() {
  useDocumentTitle('Dashboard');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success, error: notifyError } = useNotifications();
  const { notes, stats, recentNotes, categories, notesByCategory, getCategory, isLoading, error, reload } = useNotesStore();
  const { storage, recentFiles, openUpload, refreshLibrary, folders } = useFilesStore();

  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);

  const updatedThisWeek = notes.filter(
    (note) => Date.now() - new Date(note.updatedAt).getTime() < WEEK_MS
  ).length;

  const firstName = (user?.fullName || 'there').split(' ')[0];

  const handleCreateFolder = async (name, parentId) => {
    setCreatingFolder(true);
    try {
      const folder = await foldersService.create({ name, parentId: parentId ?? null });
      success('Folder created', `“${folder.name}” is ready in your Study Space.`);
      setNewFolderOpen(false);
      await refreshLibrary();
    } catch (err) {
      notifyError('Could not create folder', err.message);
    } finally {
      setCreatingFolder(false);
    }
  };

  if (isLoading && !notes.length) {
    return (
      <div className="page-container">
        <LoadingState label="Loading your dashboard…" />
      </div>
    );
  }

  if (error && !notes.length) {
    return (
      <div className="page-container">
        <ErrorState title="Could not load your dashboard" message={error} onRetry={reload} />
      </div>
    );
  }

  const hasFiles = storage.fileCount > 0;
  const storagePercent = Math.min(
    100,
    Math.round((storage.usedBytes / (1024 * 1024 * 1024)) * 100) // vs a 1 GB reference
  );

  return (
    <div className="page-container">
      <section className="welcome-banner">
        <div>
          <h1>
            {getTimeBasedGreeting()}, {firstName}
          </h1>
          <p>{formatLongDate(new Date().toISOString())} — here’s what’s happening in your study space.</p>
        </div>
        <div className="welcome-actions">
          <Button icon={<FilePlus2 size={16} />} onClick={() => openUpload()}>
            Upload files
          </Button>
        </div>
      </section>

      <div className="stats-grid">
        <StatCard icon={StickyNote} value={stats.total} label="Notes" />
        <StatCard icon={FileText} value={storage.fileCount} label="Files" tone="cyan" />
        <StatCard icon={Pin} value={stats.pinned} label="Pinned notes" tone="violet" />
        <StatCard icon={Timer} value={updatedThisWeek} label="Notes updated this week" tone="green" />
      </div>

      <div className="dashboard-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card-cn">
            <div className="card-header-cn">
              <h2>Quick actions</h2>
            </div>
            <div className="card-body-cn quick-actions">
              <button type="button" className="quick-action" onClick={() => openUpload()}>
                <span className="qa-icon" aria-hidden="true">
                  <FilePlus2 size={16} />
                </span>
                Upload study materials
              </button>
              <button type="button" className="quick-action" onClick={() => setNewFolderOpen(true)}>
                <span className="qa-icon" aria-hidden="true">
                  <FolderPlus size={16} />
                </span>
                Create a folder
              </button>
              <Link to="/notes/new" className="quick-action">
                <span className="qa-icon" aria-hidden="true">
                  <Plus size={16} />
                </span>
                Write a new note
              </Link>
              <Link to="/files" className="quick-action">
                <span className="qa-icon" aria-hidden="true">
                  <FileText size={16} />
                </span>
                Browse all files
              </Link>
            </div>
          </div>

          <RecentNotes notes={recentNotes.slice(0, 5)} getCategory={getCategory} />

          {recentFiles.length > 0 && (
            <div className="card-cn">
              <div className="card-header-cn">
                <h2>Recently accessed files</h2>
                <Link to="/recent" className="card-header-link">
                  View all
                </Link>
              </div>
              <ul className="dashboard-file-list">
                {recentFiles.slice(0, 5).map((file) => (
                  <li key={file.id}>
                    <Link to={`/files?q=${encodeURIComponent(file.name)}`} className="dashboard-file-row">
                      <FileIcon extension={file.extension} size="sm" />
                      <span className="dashboard-file-name" title={file.name}>
                        {file.name}
                      </span>
                      <span className="dashboard-file-meta">
                        {formatBytes(file.sizeBytes)} · {formatRelative(file.lastAccessedAt || file.createdAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.4rem' }}>
          <div className="card-cn card-cn--pad storage-card">
            <div className="storage-head">
              <span className="stat-icon cyan" aria-hidden="true">
                <HardDrive size={18} />
              </span>
              <div>
                <h3>Storage</h3>
                <p className="storage-figures">
                  {storage.usedLabel} used · {storage.fileCount} file{storage.fileCount === 1 ? '' : 's'}
                  {storage.trashedCount > 0 && ` · ${storage.trashedCount} in trash`}
                </p>
              </div>
            </div>
            <div className="progress-track" role="progressbar" aria-valuenow={storagePercent} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
              <div className="progress-fill" style={{ width: `${Math.max(storagePercent, 2)}%` }} />
            </div>
            <p className="form-hint-cn">Measured against a 1 GB reference for the visual scale.</p>
            {!hasFiles && (
              <Button variant="soft" size="sm" block icon={<FilePlus2 size={14} />} onClick={() => openUpload()}>
                Upload your first file
              </Button>
            )}
          </div>

          <CategoryShortcuts categories={categories} notesByCategory={notesByCategory} total={stats.total} />

          <div className="card-cn card-cn--pad">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.7rem' }}>
              <span className="stat-icon violet" aria-hidden="true">
                <Pin size={18} />
              </span>
              <h3 style={{ fontSize: '1rem' }}>Pinned priorities</h3>
            </div>
            <p style={{ fontSize: '0.87rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {stats.pinned > 0
                ? `You have ${stats.pinned} pinned note${stats.pinned === 1 ? '' : 's'} keeping your priorities in sight.`
                : 'Pin the notes and files you reach for most and they stay within arm’s reach.'}
            </p>
            <Button to="/pinned" variant="soft" size="sm" block>
              Review pinned items
            </Button>
          </div>
        </div>
      </div>

      <CreateFolderDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        onConfirm={handleCreateFolder}
        folders={folders}
        loading={creatingFolder}
      />
    </div>
  );
}
