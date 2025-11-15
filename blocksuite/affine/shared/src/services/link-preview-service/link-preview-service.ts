import { type LinkPreviewData } from '@blocksuite/affine-model';
import { type Container, createIdentifier } from '@blocksuite/global/di';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { Extension } from '@blocksuite/store';

import { DEFAULT_LINK_PREVIEW_ENDPOINT } from '../../consts';
import { isAbortError } from '../../utils/is-abort-error';
import {
  LinkPreviewCacheIdentifier,
  type LinkPreviewCacheProvider,
} from './link-preview-cache';

export type LinkPreviewResponseData = {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  images?: string[];
  mediaType?: string;
  contentType?: string;
  charset?: string;
  videos?: string[];
  favicons?: string[];
};

export interface LinkPreviewProvider {
  /**
   * Query link preview data for a given URL
   */
  query: (
    url: string,
    signal?: AbortSignal
  ) => Promise<Partial<LinkPreviewData>>;
  /**
   * Set the endpoint for link preview
   */
  setEndpoint: (endpoint: string) => void;

  /**
   * Get the endpoint for link preview
   */
  endpoint: string;
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

  private _endpoint: string = DEFAULT_LINK_PREVIEW_ENDPOINT;

  constructor(private readonly _cache: LinkPreviewCacheProvider) {
    super();
  }

  get endpoint() {
    return this._endpoint;
  }

  setEndpoint = (endpoint: string) => {
    this._endpoint = endpoint;
  };

  private readonly _fetchTwitterPreview = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Partial<LinkPreviewData>> => {
    try {
      const match = /\/status\/(\d+)/.exec(url);
      if (!match) {
        throw new BlockSuiteError(
          ErrorCode.DefaultRuntimeError,
          `Invalid tweet URL: ${url}`
        );
      }
      const apiUrl = `https://api.fxtwitter.com/status/${match[1]}`;

      const response = await fetch(apiUrl, { signal }).then(res => res.json());
      const tweet = response?.tweet;
      if (!tweet) {
        throw new BlockSuiteError(
          ErrorCode.DefaultRuntimeError,
          `Invalid tweet response: ${url}`
        );
      }

      return {
        title: tweet.author?.name ?? null,
        icon: tweet.author?.avatar_url ?? null,
        description: tweet.text ?? null,
        image:
          tweet.media?.photos?.[0]?.url || tweet.author?.banner_url || null,
      };
    } catch (e) {
      console.error(`Failed to fetch tweet: ${url}`);
      console.error(e);
      return {};
    }
  };

  private readonly _fetchStandardPreview = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Partial<LinkPreviewData>> => {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
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

    const data: LinkPreviewResponseData = await response.json();
    return {
      title: data.title ?? null,
      description: data.description ?? null,
      icon: data.favicons?.[0],
      image: data.images?.[0],
    };
  };

  private readonly _isTwitterUrl = (url: string): boolean => {
    const twitterDomains = [
      'https://x.com/',
      'https://www.x.com/',
      'https://www.twitter.com/',
      'https://twitter.com/',
    ];
    return (
      twitterDomains.some(domain => url.startsWith(domain)) &&
      url.includes('/status/')
    );
  };

  private readonly _fetchPreview = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Partial<LinkPreviewData>> => {
    if (this._isTwitterUrl(url)) {
      return this._fetchTwitterPreview(url, signal);
    }
    return this._fetchStandardPreview(url, signal);
  };

  /**
   * Fetch link preview data for a given URL
   */
  query = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Partial<LinkPreviewData>> => {
    // Check memory cache, if hit, return the cached data
    const cached = this._cache.get(url);
    if (cached) {
      return cached;
    }

    // Check pending requests, if there is a pending request, return the promise
    const pendingRequest = this._cache.getPendingRequest(url);
    if (pendingRequest) {
      return pendingRequest;
    }

    // Fetch new data
    const promise = (async () => {
      try {
        // Fetch new data
        const data = await this._fetchPreview(url, signal);
        // If the data is not empty, set the data to the cache
        if (data && Object.keys(data).length > 0) {
          this._cache.set(url, data);
        }
        return data;
      } finally {
        // Delete the pending request regardless of success or failure
        this._cache.deletePendingRequest(url);
      }
    })();

    // Set the promise to the cache
    this._cache.setPendingRequest(url, promise);
    return promise;
  };
}
