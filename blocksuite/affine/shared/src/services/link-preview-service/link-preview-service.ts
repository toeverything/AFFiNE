import { type LinkPreviewData } from '@blocksuite/affine-model';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Extension } from '@blocksuite/store';

import { isAbortError } from '../../utils/is-abort-error';
import {
  LinkPreviewCacheIdentifier,
  type LinkPreviewCacheProvider,
} from './link-preview-cache';
import {
  type LinkPreviewResponseData,
  readLinkPreviewResponse,
} from './response';

export type LinkPreviewResult = Partial<LinkPreviewData> &
  Pick<
    LinkPreviewResponseData,
    | 'siteName'
    | 'provider'
    | 'author'
    | 'publishedAt'
    | 'durationSeconds'
    | 'transcript'
  >;

export interface LinkPreviewProvider {
  /**
   * Query link preview data for a given URL
   */
  query: (
    url: string,
    signal?: AbortSignal,
    include?: Array<'transcript'>
  ) => Promise<LinkPreviewResult>;
  /**
   * Set the endpoint for link preview
   */
  setEndpoint: (endpoint: string | null) => void;

  /**
   * Get the endpoint for link preview
   */
  endpoint: string | null;
}

export const LinkPreviewServiceIdentifier =
  createIdentifier<LinkPreviewProvider>('AffineLinkPreviewService');

export class LinkPreviewService
  extends Extension
  implements LinkPreviewProvider
{
  static override setup(di: Container) {
    di.addImpl(LinkPreviewServiceIdentifier, LinkPreviewService, [
      LinkPreviewCacheIdentifier,
    ]);
  }

  private _endpoint: string | null = null;

  constructor(
    private readonly _cache: LinkPreviewCacheProvider,
    private readonly _fetch: typeof globalThis.fetch = globalThis.fetch
  ) {
    super();
  }

  get endpoint() {
    return this._endpoint;
  }

  setEndpoint = (endpoint: string | null) => {
    this._endpoint = endpoint;
  };

  private readonly _fetchStandardPreview = async (
    url: string,
    signal?: AbortSignal,
    include?: Array<'transcript'>
  ): Promise<LinkPreviewResult> => {
    if (!this.endpoint) return {};
    const response = await this._fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, ...(include?.length ? { include } : {}) }),
      signal,
    })
      .then(r => {
        if (!r || !r.ok) {
          throw new BlockSuiteError(
            ErrorCode.DefaultRuntimeError,
            `Failed to fetch link preview: ${url}`
          );
        }
        return r;
      })
      .catch(err => {
        if (isAbortError(err)) return null;
        console.error(`Failed to fetch link preview: ${url}`);
        console.error(err);
        return null;
      });

    if (!response) return {};

    const data = await readLinkPreviewResponse(response);
    return {
      siteName: data.siteName,
      provider: data.provider,
      author: data.author,
      publishedAt: data.publishedAt,
      durationSeconds: data.durationSeconds,
      ...(include?.includes('transcript')
        ? { transcript: data.transcript }
        : {}),
      title: data.title ?? null,
      description: data.description ?? null,
      icon: data.favicons?.[0],
      image: data.images?.[0],
    };
  };

  /**
   * Fetch link preview data for a given URL
   */
  query = async (
    url: string,
    signal?: AbortSignal,
    include?: Array<'transcript'>
  ): Promise<LinkPreviewResult> => {
    if (!this.endpoint) return {};
    const sourceKey = JSON.stringify([this.endpoint, url]);
    const key = include?.includes('transcript')
      ? `transcript:${sourceKey}`
      : sourceKey;
    const cached = this._cache.get(key);
    if (cached) {
      return cached;
    }

    // Check pending requests, if there is a pending request, return the promise
    const pendingRequest = signal
      ? undefined
      : this._cache.getPendingRequest(key);
    if (pendingRequest) {
      return pendingRequest;
    }

    // Fetch new data
    const promise = (async () => {
      try {
        // Fetch new data
        const data = await this._fetchStandardPreview(url, signal, include);
        // If the data is not empty, set the data to the cache
        if (data && Object.keys(data).length > 0) {
          this._cache.set(key, data);
        }
        return data;
      } finally {
        // Delete the pending request regardless of success or failure
        if (!signal) this._cache.deletePendingRequest(key);
      }
    })();

    // Set the promise to the cache
    if (!signal) this._cache.setPendingRequest(key, promise);
    return promise;
  };
}
