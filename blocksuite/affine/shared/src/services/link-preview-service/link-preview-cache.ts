import type { LinkPreviewData } from '@blocksuite/affine-model';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { Extension, type ExtensionType } from '@blocksuite/store';
import debounce from 'lodash-es/debounce';
import QuickLRU from 'quick-lru';
import { z } from 'zod';

import { LinkPreviewStorage } from './link-preview-storage';

export const LinkPreviewCacheConfigSchema = z.object({
  /**
   * The maximum number of items in the cache
   */
  cacheSize: z.number(),
  /**
   * The time to live for the memory cache
   */
  memoryTTL: z.number(),
  /**
   * The time to live for the local storage cache
   */
  localStorageTTL: z.number(),
});

export type LinkPreviewCacheConfig = z.infer<
  typeof LinkPreviewCacheConfigSchema
>;

const DEFAULT_LINK_PREVIEW_CACHE_CONFIG: LinkPreviewCacheConfig = {
  cacheSize: 50,
  memoryTTL: 1000 * 60 * 60, // 60 minutes
  localStorageTTL: 1000 * 60 * 60 * 6, // 6 hours
};

/**
 * It's used to debounce the save to local storage to avoid frequent writes
 */
const DEBOUNCE_TIME = 1000;

/**
 * The interface for the link preview cache provider
 */
export interface LinkPreviewCacheProvider {
  /**
   * Get the link preview data for a given URL
   * @param url The URL to get the link preview data for
   * @returns The link preview data for the given URL
   */
  get(url: string): Partial<LinkPreviewData> | undefined;
  /**
   * Set the link preview data for a given URL
   * @param url The URL to set the link preview data for
   * @param data The link preview data to set
   */
  set(url: string, data: Partial<LinkPreviewData>): void;
  /**
   * Get the pending request for a given URL
   * @param url The URL to get the pending request for
   * @returns The pending request for the given URL
   */
  getPendingRequest(url: string): Promise<Partial<LinkPreviewData>> | undefined;
  /**
   * Set the pending request for a given URL
   * @param url The URL to set the pending request for
   * @param promise The promise to set for the given URL
   */
  setPendingRequest(
    url: string,
    promise: Promise<Partial<LinkPreviewData>>
  ): void;
  /**
   * Delete the pending request for a given URL
   * @param url The URL to delete the pending request for
   */
  deletePendingRequest(url: string): void;
  /**
   * Clear the cache
   */
  clear(): void;
}

export const LinkPreviewCacheIdentifier =
  createIdentifier<LinkPreviewCacheProvider>('AffineLinkPreviewCache');

/**
 * The link preview cache, it will cache the link preview data in the memory and local storage
 */
export class LinkPreviewCache
  extends Extension
  implements LinkPreviewCacheProvider
{
  /**
   * The singleton instance of the link preview cache
   */
  private static instance: LinkPreviewCache | null = null;

  /**
   * The memory cache for the link preview
   */
  private readonly memoryCache: QuickLRU<string, Partial<LinkPreviewData>>;
  /**
   * The pending requests for the link preview
   * The promise will be resolved when the data is fetched
   */
  private readonly pendingRequests: Map<
    string,
    Promise<Partial<LinkPreviewData>>
  >;
  /**
   * The local storage manager for the link preview
   */
  private readonly storage: LinkPreviewStorage;

  constructor(
    private readonly config: LinkPreviewCacheConfig = DEFAULT_LINK_PREVIEW_CACHE_CONFIG
  ) {
    super();
    this.storage = new LinkPreviewStorage();
    this.memoryCache = new QuickLRU({
      maxSize: this.config.cacheSize,
      maxAge: this.config.memoryTTL,
      onEviction: key => {
        this._clearItemFromStorage(key);
      },
    });
    this.pendingRequests = new Map();
    this._loadFromStorage();
  }

  static getInstance(config?: LinkPreviewCacheConfig): LinkPreviewCache {
    if (!LinkPreviewCache.instance) {
      LinkPreviewCache.instance = new LinkPreviewCache(config);
    }
    return LinkPreviewCache.instance;
  }

  get(url: string): Partial<LinkPreviewData> | undefined {
    return this.memoryCache.get(url);
  }

  set(url: string, data: Partial<LinkPreviewData>): void {
    this.memoryCache.set(url, data);
    this._saveToStorage();
  }

  getPendingRequest(
    url: string
  ): Promise<Partial<LinkPreviewData>> | undefined {
    return this.pendingRequests.get(url);
  }

  setPendingRequest(
    url: string,
    promise: Promise<Partial<LinkPreviewData>>
  ): void {
    this.pendingRequests.set(url, promise);
  }

  deletePendingRequest(url: string): void {
    this.pendingRequests.delete(url);
  }

  /**
   * Load the cache from local storage
   */
  private readonly _loadFromStorage = (): void => {
    const data = this.storage.load();

    // Check if the data is expired
    const localDataExpires = data.expires;
    // If the data is expired, clear the data
    if (localDataExpires && localDataExpires < Date.now()) {
      this.storage.clear();
      return;
    }

    // load the data to the memory cache
    Object.entries(data.data).forEach(([url, item]) => {
      this.memoryCache.set(url, item);
    });
  };

  /**
   * Save the cache to local storage
   * Debounce the save to local storage to avoid frequent writes
   */
  private readonly _saveToStorage = debounce(() => {
    const entries = Array.from(this.memoryCache.entriesDescending());
    const linkPreviewData = Object.fromEntries(
      entries.slice(0, this.memoryCache.size).map(([url, data]) => [url, data])
    );
    const data = {
      data: linkPreviewData,
      expires: Date.now() + this.config.localStorageTTL,
    };
    this.storage.save(data);
  }, DEBOUNCE_TIME);

  /**
   * Clear a link preview record from local storage with specific URL
   * Called when the item is evicted from the memory cache
   * @param {string} url The URL key to remove from storage
   * @returns {boolean} Whether the item was successfully removed
   */
  private readonly _clearItemFromStorage = (url: string): void => {
    this.storage.clearItem(url);
  };

  clear(): void {
    this.memoryCache.clear();
    this.pendingRequests.clear();
  }

  clearLocalStorage(): void {
    this.storage.clear();
  }

  static override setup(di: Container) {
    di.addImpl(LinkPreviewCacheIdentifier, () =>
      LinkPreviewCache.getInstance()
    );
  }
}

/**
 * The extension for the link preview cache, it will override the link preview cache instance
 * @param config - The configuration for the link preview cache
 * @returns The extension for the link preview cache
 */
export const LinkPreviewCacheExtension = (
  config?: LinkPreviewCacheConfig
): ExtensionType => {
  return {
    setup: (di: Container) => {
      di.override(LinkPreviewCacheIdentifier, () =>
        LinkPreviewCache.getInstance(config)
      );
    },
  };
};
