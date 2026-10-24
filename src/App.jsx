/**
 * App — application root: context providers and the route table.
 *
 * Provider order matters:
 *   Theme    → available everywhere (visual shell)
 *   Notifications → toasts usable by every provider/page below
 *   Auth     → session state
 *   Notes    → shared notes/categories data, gated on the session
 *   Files    → Study Library folders, storage stats, global upload queue
 */

import { Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AuthProvider } from '@/context/AuthContext';
import { NotesProvider } from '@/context/NotesContext';
import { FilesProvider } from '@/context/FilesContext';
import { ClassesProvider } from '@/context/ClassesContext';

import PublicLayout from '@/layouts/PublicLayout';
import AppLayout from '@/layouts/AppLayout';
import ProtectedRoute from '@/layouts/ProtectedRoute';

import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import LibraryPage from '@/pages/LibraryPage';
import FoldersPage from '@/pages/FoldersPage';
import FilesPage from '@/pages/FilesPage';
import TrashPage from '@/pages/TrashPage';
import PinnedPage from '@/pages/PinnedPage';
import RecentPage from '@/pages/RecentPage';
import SearchPage from '@/pages/SearchPage';
import NotesPage from '@/pages/NotesPage';
import NoteEditorPage from '@/pages/NoteEditorPage';
import NoteDetailPage from '@/pages/NoteDetailPage';
import CategoriesPage from '@/pages/CategoriesPage';
import SettingsPage from '@/pages/SettingsPage';
import ClassesPage from '@/pages/ClassesPage';
import ClassPage from '@/pages/ClassPage';
import JoinClassPage from '@/pages/JoinClassPage';
import NotFoundPage from '@/pages/NotFoundPage';

import Toasts from '@/components/common/Toasts';

export default function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <NotesProvider>
            <FilesProvider>
              <ClassesProvider>
              <Routes>
                {/* Public */}
                <Route element={<PublicLayout />}>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                </Route>

                {/* Authenticated */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />

                    {/* Study Library */}
                    <Route path="/library" element={<LibraryPage />} />
                    <Route path="/folders" element={<FoldersPage />} />
                    <Route path="/files" element={<FilesPage />} />
                    <Route path="/trash" element={<TrashPage />} />
                    <Route path="/pinned" element={<PinnedPage />} />
                    <Route path="/recent" element={<RecentPage />} />
                    <Route path="/search" element={<SearchPage />} />

                    {/* Notes (existing routes preserved) */}
                    <Route path="/notes" element={<NotesPage />} />
                    <Route path="/notes/new" element={<NoteEditorPage />} />
                    <Route path="/notes/:id" element={<NoteDetailPage />} />
                    <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
                    <Route path="/categories" element={<CategoriesPage />} />
                    <Route path="/settings" element={<SettingsPage />} />

                    {/* Class collaboration (Part 2) */}
                    <Route path="/classes" element={<ClassesPage />} />
                    <Route path="/classes/join" element={<JoinClassPage />} />
                    <Route path="/classes/:id" element={<ClassPage />} />
                  </Route>
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFoundPage />} />
              </Routes>

              <Toasts />
              </ClassesProvider>
            </FilesProvider>
          </NotesProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
