import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { CloseIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

export class ImagePreviewGrid extends LitElement {
  static override styles = css`
    .image-preview-wrapper {
      overflow: hidden scroll;
      max-height: 128px;
    }

    ${scrollbarStyle('.image-preview-wrapper')}

    .images-container {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      position: relative;
    }

    .image-container {
      width: 58px;
      height: 58px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      cursor: pointer;
      overflow: hidden;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .image-container img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
    }

    .close-wrapper {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      justify-content: center;
      align-items: center;
      display: none;
      position: absolute;
      background-color: var(--affine-white);
      z-index: 1;
      cursor: pointer;
    }

    .close-wrapper:hover {
      background-color: var(--affine-background-error-color);
      border: 1px solid var(--affine-error-color);
    }

    .close-wrapper:hover svg path {
      fill: var(--affine-error-color);
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

  private readonly _handleMouseEnter = (evt: MouseEvent, index: number) => {
    const ele = evt.target as HTMLImageElement;
    const rect = ele.getBoundingClientRect();
    if (!ele.parentElement) return;
    const parentRect = ele.parentElement.getBoundingClientRect();
    const left = Math.abs(rect.right - parentRect.left);
    const top = Math.abs(parentRect.top - rect.top);
    this.currentIndex = index;
    if (!this.closeWrapper) return;
    this.closeWrapper.style.display = 'flex';
    this.closeWrapper.style.left = left + 'px';
    this.closeWrapper.style.top = top + 'px';
  };

  private readonly _handleMouseLeave = () => {
    if (!this.closeWrapper) return;
    this.closeWrapper.style.display = 'none';
    this.currentIndex = -1;
  };

  private readonly _handleDelete = () => {
    if (this.currentIndex >= 0 && this.currentIndex < this.images.length) {
      const file = this.images[this.currentIndex];
      const url = this._getObjectUrl(file);
      this._releaseObjectUrl(url);

      this.onImageRemove?.(this.currentIndex);
      this.currentIndex = -1;
      if (!this.closeWrapper) return;
      this.closeWrapper.style.display = 'none';
    }
  };

  override disconnectedCallback() {
    super.disconnectedCallback();
    this._disposeUrls();
  }

  override render() {
    return html`
      <div class="image-preview-wrapper" @mouseleave=${this._handleMouseLeave}>
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
                  @mouseenter=${(evt: MouseEvent) =>
                    this._handleMouseEnter(evt, index)}
                >
                  <img src="${url}" alt="${image.name}" />
                </div>
              `;
            }
          )}
        </div>
        <div class="close-wrapper" @click=${this._handleDelete}>
          ${CloseIcon()}
        </div>
      </div>
    `;
  }

  @property({ type: Array })
  accessor images: File[] = [];

  @property({ attribute: false })
  accessor onImageRemove: ((index: number) => void) | null = null;

  @query('.close-wrapper')
  accessor closeWrapper: HTMLDivElement | null = null;

  @state()
  accessor currentIndex = -1;
}

declare global {
  interface HTMLElementTagNameMap {
    'image-preview-grid': ImagePreviewGrid;
  }
}
