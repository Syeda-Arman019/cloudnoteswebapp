/**
 * FilesContext — shared Study Library state for the whole app:
 *
 *   * the folder list (flat, with counts) + tree/path helpers
 *   * storage stats for the dashboard
 *   * ONE global upload queue: the header Upload button, dashboard quick
 *     actions, and every page funnel into the same `startUpload()`, so
 *     progress is visible anywhere and folders refresh everywhere at once.
 *
 * Files lists themselves stay paginated per page (they depend on filters);
 * this context owns only what the whole shell needs.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNotifications } from '@/context/NotificationContext';
import { useAuth } from '@/context/AuthContext';
import filesService, { uploadWithProgress } from '@/services/filesService';
import foldersService, { buildFolderTree, folderPath } from '@/services/foldersService';

const FilesContext = createContext(null);

let uploadCounter = 0;

export function FilesProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const { success, error: notifyError } = useNotifications();

  const [folders, setFolders] = useState([]);
  const [storage, setStorage] = useState({
    usedBytes: 0,
    fileCount: 0,
    trashedCount: 0,
    usedLabel: '0 B',
  });
  const [recentFiles, setRecentFiles] = useState([]);
  const [pinnedFiles, setPinnedFiles] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Upload queue: [{ id, name, size, progress, status, error, controller }]
  const [uploads, setUploads] = useState([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState(null);
  const queueRef = useRef(uploads);
  queueRef.current = uploads;

  const reloadFolders = useCallback(async () => {
    try {
      const list = await foldersService.list();
      setFolders(list);
      setLoadError(null);
      return list;
    } catch (err) {
      setLoadError(err.message);
      return [];
    }
  }, []);

  const reloadStorage = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const stats = await filesService.getStats();
      setStorage(stats.storage);
      setRecentFiles(stats.recentFiles || []);
      setPinnedFiles(stats.pinnedFiles || []);
    } catch {
      /* stats are non-critical; keep the last known values */
    }
  }, [isAuthenticated]);

  // Load shared data when signed in; clear it on logout.
  useEffect(() => {
    let cancelled = false;
    if (!isAuthenticated) {
      setFolders([]);
      setStorage({ usedBytes: 0, fileCount: 0, trashedCount: 0, usedLabel: '0 B' });
      setRecentFiles([]);
      setPinnedFiles([]);
      setIsReady(false);
      return undefined;
    }
    (async () => {
      await reloadFolders();
      await reloadStorage();
      if (!cancelled) setIsReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, reloadFolders, reloadStorage]);

  const refreshLibrary = useCallback(async () => {
    await Promise.all([reloadFolders(), reloadStorage()]);
  }, [reloadFolders, reloadStorage]);

  const updateUpload = useCallback((id, patch) => {
    setUploads((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const removeUpload = useCallback((id) => {
    setUploads((current) => current.filter((item) => item.id !== id));
  }, []);

  /**
   * Upload a batch of files. Each file becomes its own queue row with real
   * progress; failures are reported per file with a retry button, and a
   * single success toast summarizes the batch.
   */
  const startUpload = useCallback(
    async (fileList, { folderId = null } = {}) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      const rows = files.map((file) => {
        uploadCounter += 1;
        const id = `upload-${uploadCounter}`;
        const controller = new AbortController();
        return { id, file, name: file.name, size: file.size, progress: 0, status: 'queued', error: null, controller, folderId };
      });

      setUploads((current) => [...current, ...rows]);
      setIsUploadOpen(true);
      setUploadFolderId(folderId);

      const runRow = async (row) => {
        updateUpload(row.id, { status: 'uploading', error: null });
        try {
          const saved = await uploadWithProgress(row.file, {
            folderId: row.folderId,
            signal: row.controller.signal,
            onProgress: (progress) => updateUpload(row.id, { progress }),
          });
          updateUpload(row.id, { status: 'done', progress: 100, savedId: saved?.id });
        } catch (err) {
          if (err?.name === 'AbortError') {
            removeUpload(row.id);
            return;
          }
          updateUpload(row.id, { status: 'error', error: err.message });
        }
      };

      // Limit concurrency so progress bars stay readable and the server
      // is not hammered by twenty simultaneous requests.
      const CONCURRENCY = 3;
      let index = 0;
      const worker = async () => {
        while (index < rows.length) {
          const row = rows[index];
          index += 1;
          await runRow(row);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, rows.length) }, worker));

      await refreshLibrary();
      const snapshot = queueRef.current;
      const doneCount = rows.filter((row) =>
        snapshot.some((item) => item.id === row.id && item.status === 'done')
      ).length;
      const failedCount = rows.length - doneCount;
      if (doneCount && !failedCount) {
        success(
          doneCount === 1 ? 'File uploaded' : `${doneCount} files uploaded`,
          doneCount === 1 ? '“' + rows[0].name + '” is in your Study Library.' : 'They are ready in your Study Library.'
        );
      } else if (doneCount && failedCount) {
        success(`${doneCount} uploaded, ${failedCount} failed`, 'Check the upload list for details.');
      }
    },
    [refreshLibrary, removeUpload, success, updateUpload]
  );

  const retryUpload = useCallback(
    async (id) => {
      const row = queueRef.current.find((item) => item.id === id);
      if (!row) return;
      updateUpload(id, { progress: 0, status: 'uploading', error: null });
      try {
        const saved = await uploadWithProgress(row.file, {
          folderId: row.folderId,
          signal: row.controller.signal,
          onProgress: (progress) => updateUpload(id, { progress }),
        });
        updateUpload(id, { status: 'done', progress: 100, savedId: saved?.id });
        await refreshLibrary();
        success('File uploaded', `“${row.name}” is in your Study Library.`);
      } catch (err) {
        if (err?.name === 'AbortError') {
          removeUpload(id);
          return;
        }
        updateUpload(id, { status: 'error', error: err.message });
        notifyError('Upload failed', err.message);
      }
    },
    [refreshLibrary, removeUpload, success, notifyError, updateUpload]
  );

  const cancelUpload = useCallback((id) => {
    const row = queueRef.current.find((item) => item.id === id);
    row?.controller?.abort();
    removeUpload(id);
  }, [removeUpload]);

  const clearFinishedUploads = useCallback(() => {
    setUploads((current) => current.filter((item) => item.status === 'uploading' || item.status === 'queued'));
  }, []);

  /** Open the upload dialog, optionally targeting a folder. */
  const openUpload = useCallback((folderId = null) => {
    setUploadFolderId(folderId ?? null);
    setIsUploadOpen(true);
  }, []);

  const closeUpload = useCallback(() => setIsUploadOpen(false), []);

  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const pathOf = useCallback((folderId) => folderPath(folders, folderId), [folders]);

  const value = useMemo(
    () => ({
      folders,
      tree,
      pathOf,
      isReady,
      loadError,
      reloadFolders,
      reloadStorage,
      refreshLibrary,
      storage,
      recentFiles,
      pinnedFiles,
      // upload queue
      uploads,
      isUploadOpen,
      uploadFolderId,
      openUpload,
      closeUpload,
      startUpload,
      retryUpload,
      cancelUpload,
      clearFinishedUploads,
    }),
    [
      folders,
      tree,
      pathOf,
      isReady,
      loadError,
      reloadFolders,
      reloadStorage,
      refreshLibrary,
      storage,
      recentFiles,
      pinnedFiles,
      uploads,
      isUploadOpen,
      uploadFolderId,
      openUpload,
      closeUpload,
      startUpload,
      retryUpload,
      cancelUpload,
      clearFinishedUploads,
    ]
  );

  return <FilesContext.Provider value={value}>{children}</FilesContext.Provider>;
}

export function useFilesStore() {
  const context = useContext(FilesContext);
  if (!context) throw new Error('useFilesStore must be used inside <FilesProvider>');
  return context;
}
