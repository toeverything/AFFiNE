import { DEFAULT_IMAGE_PROXY_ENDPOINT } from '@blocksuite/affine-shared/consts';
import { StoreExtension } from '@blocksuite/store';

import { setImageProxyMiddlewareURL } from './adapters/middleware';

export class ImageProxyService extends StoreExtension {
  static override key = 'image-proxy';

  private _imageProxyURL = DEFAULT_IMAGE_PROXY_ENDPOINT;

  setImageProxyURL(url: string) {
    this._imageProxyURL = url;
    setImageProxyMiddlewareURL(url);
  }

  get imageProxyURL() {
    return this._imageProxyURL;
  }
}
