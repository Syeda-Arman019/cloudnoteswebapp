/**
 * Folders service — the Study Library hierarchy API.
 *
 *   GET    /folders              flat list with counts (client builds trees)
 *   POST   /folders              create { name, parentId }
 *   GET    /folders/:id          one folder
 *   PUT    /folders/:id          rename / move { name?, parentId? }
 *   DELETE /folders/:id          safe delete (?recursive=true confirms)
 *   GET    /folders/:id/contents paginated files + breadcrumbs + folder
 */

import { apiClient, isDemoMode } from './apiClient';
import * as demo from './mock/demoStore';

function normalizeFolder(folder) {
  if (!folder) return null;
  return {
    id: String(folder.id),
    name: folder.name,
    parentId: folder.parentId == null ? null : String(folder.parentId),
    fileCount: folder.fileCount ?? 0,
    folderCount: folder.folderCount ?? 0,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
}

/** Assemble the flat folder list into a nested tree (roots sorted by name). */
export function buildFolderTree(folders) {
  const byId = new Map(folders.map((folder) => [folder.id, { ...folder, children: [] }]));
  const roots = [];
  for (const folder of byId.values()) {
    const parent = folder.parentId ? byId.get(folder.parentId) : null;
    if (parent) parent.children.push(folder);
    else roots.push(folder);
  }
  const sortNodes = (nodes) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots;
}

/** Ancestor chain (root … folder) for breadcrumbs. */
export function folderPath(folders, folderId) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const chain = [];
  let current = folderId ? byId.get(String(folderId)) : null;
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return chain;
}

export const foldersService = {
  async list() {
    if (isDemoMode) {
      await demo.delay();
      return [];
    }
    const data = await apiClient.get('/folders');
    return (data?.folders || []).map(normalizeFolder);
  },

  async create(payload) {
    if (isDemoMode) throw new Error('Folders are unavailable in demo mode.');
    const data = await apiClient.post('/folders', payload);
    return normalizeFolder(data?.folder || data);
  },

  async update(id, payload) {
    if (isDemoMode) throw new Error('Folders are unavailable in demo mode.');
    const data = await apiClient.put(`/folders/${id}`, payload);
    return normalizeFolder(data?.folder || data);
  },

  /** Delete; a 409 with details signals "confirm first" (non-empty folder). */
  async remove(id, { recursive = false } = {}) {
    if (isDemoMode) throw new Error('Folders are unavailable in demo mode.');
    const query = recursive ? '?recursive=true' : '';
    return apiClient.del(`/folders/${id}${query}`);
  },
};

export default foldersService;
