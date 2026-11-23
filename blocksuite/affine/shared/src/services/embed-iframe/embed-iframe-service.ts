import type { EmbedIframeBlockProps } from '@blocksuite/affine-model';
import { type Store, StoreExtension } from '@blocksuite/store';

import {
  type EmbedIframeConfig,
  EmbedIframeConfigIdentifier,
} from './embed-iframe-config';

export type EmbedIframeData = {
  html?: string;
  iframe_url?: string;
  width?: number | string;
  height?: number | string;
  title?: string;
  description?: string;
  provider_name?: string;
  provider_url?: string;
  version?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  type?: string;
};

/**
 * Service for handling embeddable URLs
 */
export interface EmbedIframeProvider {
  /**
   * Check if a URL can be embedded
   * @param url URL to check
   * @returns true if the URL can be embedded, false otherwise
   */
  canEmbed: (url: string) => boolean;

  /**
   * Build a API URL for fetching embed data
   * @param url URL to build API URL
   * @returns API URL if the URL can be embedded, undefined otherwise
   */
  buildOEmbedUrl: (url: string) => string | undefined;

  /**
   * Get the embed iframe config
   * @param url URL to get embed iframe config
   * @returns Embed iframe config if the URL can be embedded, undefined otherwise
   */
  getConfig: (url: string) => EmbedIframeConfig | undefined;

  /**
   * Get embed iframe data
   * @param url URL to get embed iframe data
   * @returns Embed iframe data if the URL can be embedded, undefined otherwise
   */
  getEmbedIframeData: (url: string) => Promise<EmbedIframeData | null>;

  /**
   * Parse an embeddable URL and add an EmbedIframeBlock to doc
   * @param url Original url to embed
   * @param parentId Parent block ID
   * @param index Optional index to insert at
   * @returns Created block id if successful, undefined if the URL cannot be embedded
   */
  addEmbedIframeBlock: (
    props: Partial<EmbedIframeBlockProps>,
    parentId: string,
    index?: number
  ) => string | undefined;
}

export class EmbedIframeService
  extends StoreExtension
  implements EmbedIframeProvider
{
  static override key = 'embed-iframe-service';

  private readonly _configs: EmbedIframeConfig[];

  constructor(store: Store) {
    super(store);
    this._configs = Array.from(
      store.provider.getAll(EmbedIframeConfigIdentifier).values()
    );
  }

  canEmbed = (url: string): boolean => {
    return this._configs.some(config => config.match(url));
  };

  buildOEmbedUrl = (url: string): string | undefined => {
    return this._configs.find(config => config.match(url))?.buildOEmbedUrl(url);
  };

  getConfig = (url: string): EmbedIframeConfig | undefined => {
    return this._configs.find(config => config.match(url));
  };

  getEmbedIframeData = async (
    url: string,
    signal?: AbortSignal
  ): Promise<EmbedIframeData | null> => {
    try {
      const config = this._configs.find(config => config.match(url));
      if (!config) {
        return null;
      }

      const oEmbedUrl = config.buildOEmbedUrl(url);

      if (!oEmbedUrl) {
        return null;
      }

      // if the config useOEmbedUrlDirectly is true, return the url directly as iframe_url
      if (config.useOEmbedUrlDirectly) {
        return {
          iframe_url: oEmbedUrl,
        };
      }

      // otherwise, fetch the oEmbed data
      const response = await fetch(oEmbedUrl, { signal });
      if (!response.ok) {
        console.warn(
          `Failed to fetch oEmbed data: ${response.status} ${response.statusText}`
        );
        return null;
      }

      const data = await response.json();
      return data as EmbedIframeData;
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error fetching embed iframe data:', error);
      }
      return null;
    }
  };

  addEmbedIframeBlock = (
    props: Partial<EmbedIframeBlockProps>,
    parentId: string,
    index?: number
  ): string | undefined => {
    const blockId = this.store.addBlock(
      'affine:embed-iframe',
      props,
      parentId,
      index
    );
    return blockId;
  };
}
