import type { LinkPreviewData } from '@blocksuite/affine-model';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { StoreExtension } from '@blocksuite/store';

import { DEFAULT_LINK_PREVIEW_ENDPOINT } from '../consts';
import { isAbortError } from '../utils/is-abort-error';

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

export class LinkPreviewerService extends StoreExtension {
  static override key = 'link-previewer';

  private _endpoint = DEFAULT_LINK_PREVIEW_ENDPOINT;

  query = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Partial<LinkPreviewData>> => {
    if (
      (url.startsWith('https://x.com/') ||
        url.startsWith('https://www.x.com/') ||
        url.startsWith('https://www.twitter.com/') ||
        url.startsWith('https://twitter.com/')) &&
      url.includes('/status/')
    ) {
      // use api.fxtwitter.com
      url =
        'https://api.fxtwitter.com/status/' + /\/status\/(.*)/.exec(url)?.[1];
      try {
        const { tweet } = await fetch(url, { signal }).then(res => res.json());
        return {
          title: tweet.author.name,
          icon: tweet.author.avatar_url,
          description: tweet.text,
          image: tweet.media?.photos?.[0].url || tweet.author.banner_url,
        };
      } catch (e) {
        console.error(`Failed to fetch tweet: ${url}`);
        console.error(e);
        return {};
      }
    } else {
      const response = await fetch(this._endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
        }),
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
    }
  };

  get endpoint() {
    return this._endpoint;
  }

  setEndpoint = (endpoint: string) => {
    this._endpoint = endpoint;
  };
}
