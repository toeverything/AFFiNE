import { LinkPreviewDataSchema } from '@blocksuite/affine-model';
import { z } from 'zod';

const _StorageSchema = z.object({
  data: z.record(LinkPreviewDataSchema.partial()),
  expires: z.number().optional(),
});

type StorageData = z.infer<typeof _StorageSchema>;

/**
 * The local storage manager for the link preview cache data
 */
export class LinkPreviewStorage {
  /**
   * The storage key for the link preview
   */
  storageKey = 'blocksuite:link-preview-cache';

  /**
   * Load the cache from local storage
   * @returns StorageData
   */
  load(): StorageData {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        const safe = _StorageSchema.safeParse(parsed);
        if (safe.success) {
          return safe.data;
        }
        // if the data is invalid, clear the data
        this.clear();
      }
    } catch (e) {
      console.error('Failed to load cache from storage:', e);
    }
    return { data: {} };
  }

  /**
   * Save the cache to local storage
   * @param {StorageData} data
   */
  save(data: StorageData): void {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(this.storageKey, serialized);
    } catch (e) {
      console.error('Failed to save cache to storage:', e);
    }
  }

  /**
   * Clear a link preview record from local storage with specific URL
   * @param {string} url The URL key to remove from storage
   * @returns {boolean} Whether the item was successfully removed
   */
  clearItem(url: string): boolean {
    try {
      const data = this.load();
      if (!(url in data.data)) {
        return false;
      }
      delete data.data[url];
      this.save(data);
      return true;
    } catch (e) {
      console.error('Failed to clear item from storage:', e);
      return false;
    }
  }

  /**
   * Clear all records from local storage
   */
  clear(): void {
    localStorage.removeItem(this.storageKey);
  }
}
