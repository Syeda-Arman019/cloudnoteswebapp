/**
 * App — application root: context providers and the route table.
 *
 * Provider order matters:
 *   Theme    → available everywhere (visual shell)
 *   Notifications → toasts usable by every provider/page below
 *   Auth     → session state
 *   Notes    → shared notes/categories data, gated on the session
 */

import { Route, Routes } from 'react-router-dom';

import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AuthProvider } from '@/context/AuthContext';
import { NotesProvider } from '@/context/NotesContext';

import PublicLayout from '@/layouts/PublicLayout';
import AppLayout from '@/layouts/AppLayout';
import ProtectedRoute from '@/layouts/ProtectedRoute';

import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import DashboardPage from '@/pages/DashboardPage';
import NotesPage from '@/pages/NotesPage';
import NoteEditorPage from '@/pages/NoteEditorPage';
import NoteDetailPage from '@/pages/NoteDetailPage';
import CategoriesPage from '@/pages/CategoriesPage';
import SettingsPage from '@/pages/SettingsPage';
import NotFoundPage from '@/pages/NotFoundPage';

import Toasts from '@/components/common/Toasts';

export default function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <AuthProvider>
          <NotesProvider>
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
                  <Route path="/notes" element={<NotesPage />} />
                  <Route path="/notes/new" element={<NoteEditorPage />} />
                  <Route path="/notes/:id" element={<NoteDetailPage />} />
                  <Route path="/notes/:id/edit" element={<NoteEditorPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              {/* 404 */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>

            <Toasts />
          </NotesProvider>
        </AuthProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}
