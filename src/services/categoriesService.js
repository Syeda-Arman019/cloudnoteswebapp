/**
 * Categories service.
 *
 * Flask REST API contract (Part 2):
 *   GET    /categories        list categories (with note counts)
 *   POST   /categories        create a custom category
 *   PUT    /categories/:id    rename / recolour a custom category
 *   DELETE /categories/:id    delete a custom category
 *
 * Default categories (Work, Study, Personal, Ideas, Projects) are protected
 * and cannot be renamed or deleted.
 */

import { apiClient, isDemoMode } from './apiClient';
import * as demo from './mock/demoStore';

function normalizeCategory(category) {
  if (!category) return null;
  return {
    // String ids match URL params and note.categoryId (see normalizeNote).
    id: String(category.id),
    name: category.name || '',
    description: category.description || '',
    color: category.color || 'default',
    isDefault: Boolean(category.isDefault ?? category.is_default),
  };
}

export const categoriesService = {
  async list() {
    if (isDemoMode) {
      await demo.delay(160);
      return demo.listCategories().map(normalizeCategory);
    }
    const data = await apiClient.get('/categories');
    const items = Array.isArray(data) ? data : data?.categories || [];
    return items.map(normalizeCategory);
  },

  async create(payload) {
    if (isDemoMode) {
      await demo.delay();
      return normalizeCategory(demo.createCategory(payload));
    }
    const data = await apiClient.post('/categories', payload);
    return normalizeCategory(data?.category || data);
  },

  async update(id, payload) {
    if (isDemoMode) {
      await demo.delay();
      return normalizeCategory(demo.updateCategory(id, payload));
    }
    const data = await apiClient.put(`/categories/${id}`, payload);
    return normalizeCategory(data?.category || data);
  },

  async remove(id) {
    if (isDemoMode) {
      await demo.delay(200);
      return demo.deleteCategory(id);
    }
    await apiClient.del(`/categories/${id}`);
    return true;
  },
};

export default categoriesService;
