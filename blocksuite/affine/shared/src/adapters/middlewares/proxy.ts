import type { TransformerMiddleware } from '@blocksuite/store';
import { StoreExtension } from '@blocksuite/store';

import { DEFAULT_IMAGE_PROXY_ENDPOINT } from '../../consts';

export const customImageProxyMiddleware = (
  imageProxyURL: string
): TransformerMiddleware => {
  return ({ adapterConfigs }) => {
    adapterConfigs.set('imageProxy', imageProxyURL);
  };
};

const imageProxyMiddlewareBuilder = () => {
  let middleware = customImageProxyMiddleware(DEFAULT_IMAGE_PROXY_ENDPOINT);
  return {
    get: () => middleware,
    set: (url: string) => {
      middleware = customImageProxyMiddleware(url);
    },
  };
};

const defaultImageProxyMiddlewarBuilder = imageProxyMiddlewareBuilder();

export const setImageProxyMiddlewareURL = defaultImageProxyMiddlewarBuilder.set;

export const defaultImageProxyMiddleware =
  defaultImageProxyMiddlewarBuilder.get();

// TODO(@mirone): this should be configured when setup instead of runtime
export class ImageProxyService extends StoreExtension {
  static override key = 'image-proxy';

  private _imageProxyURL = DEFAULT_IMAGE_PROXY_ENDPOINT;

  setImageProxyURL(url: string) {
    this._imageProxyURL = url;
    setImageProxyMiddlewareURL(url);
  }

  buildUrl(imageUrl: string) {
    if (imageUrl.startsWith(this.imageProxyURL)) {
      return imageUrl;
    }

    return `${this.imageProxyURL}?url=${encodeURIComponent(imageUrl)}`;
  }

  get imageProxyURL() {
    return this._imageProxyURL;
  }
}
