import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { CloseIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

export class ImagePreviewGrid extends LitElement {
  static override styles = css`
    .image-preview-wrapper {
      overflow-x: auto;
      overflow-y: hidden;
      max-height: 80px;
      white-space: nowrap;

      /* to prevent the close button from being clipped */
      padding-top: 8px;
      margin-top: -8px;
    }

    ${scrollbarStyle('.image-preview-wrapper')}

    .images-container {
      display: flex;
      flex-direction: row;
      gap: 8px;
      flex-wrap: nowrap;
      position: relative;
    }

    .image-container {
      width: 68px;
      height: 68px;
      border-radius: 4px;
      cursor: pointer;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 0 0 auto;
      border: 1px solid var(--affine-v2-layer-insideBorder-border);
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .close-wrapper {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 0.5px solid var(--affine-v2-layer-insideBorder-border);
      justify-content: center;
      align-items: center;
      display: none;
      position: absolute;
      background-color: var(--affine-v2-layer-background-primary);
      color: var(--affine-v2-icon-primary);
      z-index: 1;
      cursor: pointer;
      top: -6px;
      right: -6px;
    }

    .image-container:hover .close-wrapper {
      display: flex;
    }

    .close-wrapper:hover {
      background-color: var(--affine-v2-layer-background-error);
      border: 0.5px solid var(--affine-v2-button-error);
      color: var(--affine-v2-button-error);
    }
  `;

  private readonly _urlMap = new Map<string, string>();
  private readonly _urlRefCount = new Map<string, number>();

  private _getFileKey(file: File) {
    return `${file.name}-${file.size}-${file.lastModified}`;
  }

  private _disposeUrls() {
    for (const [_, url] of this._urlMap.entries()) {
      URL.revokeObjectURL(url);
    }
    this._urlRefCount.clear();
    this._urlMap.clear();
  }

  /**
   * get the object url of the file
   * @param file - the file to get the url
   * @returns the object url
   */
  private _getObjectUrl(file: File) {
    const key = this._getFileKey(file);
    let url = this._urlMap.get(key);

    if (!url) {
      // if the url is not in the map, create a new one
      // and set the ref count to 0
      url = URL.createObjectURL(file);
      this._urlMap.set(key, url);
      this._urlRefCount.set(url, 0);
    }

    // if the url is in the map, increment the ref count
    const refCount = this._urlRefCount.get(url) || 0;
    this._urlRefCount.set(url, refCount + 1);
    return url;
  }

  /**
   * decrement the reference count of the url
   * when the reference count is 0, revoke the url
   * @param url - the url to release
   */
  private readonly _releaseObjectUrl = (url: string) => {
    const count = this._urlRefCount.get(url) || 0;
    if (count <= 1) {
      // when the last reference is released, revoke the url
      URL.revokeObjectURL(url);
      this._urlRefCount.delete(url);
      // also delete the url from the map
      for (const [key, value] of this._urlMap.entries()) {
        if (value === url) {
          this._urlMap.delete(key);
          break;
        }
      }
    } else {
      // when the reference count is greater than 1, decrement the count
      this._urlRefCount.set(url, count - 1);
    }
  };

  private readonly _handleDelete = (index: number) => {
    const file = this.images[index];
    const url = this._getObjectUrl(file);
    this._releaseObjectUrl(url);
    this.onImageRemove?.(index);
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._disposeUrls();
  }

  override render() {
    return html`
      <div class="image-preview-wrapper">
        <div class="images-container">
          ${repeat(
            this.images,
            image => this._getFileKey(image),
            (image, index) => {
              const url = this._getObjectUrl(image);
              return html`
                <div
                  class="image-container"
                  @error=${() => this._releaseObjectUrl(url)}
                  style=${styleMap({
                    backgroundImage: `url(${url})`,
                  })}
                >
                  <div
                    class="close-wrapper"
                    @click=${() => this._handleDelete(index)}
                  >
                    ${CloseIcon()}
                  </div>
                </div>
              `;
            }
          )}
        </div>
      </div>
    `;
  }

  @property({ type: Array })
  accessor images: File[] = [];

  @property({ attribute: false })
  accessor onImageRemove: ((index: number) => void) | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    'image-preview-grid': ImagePreviewGrid;
  }
}
