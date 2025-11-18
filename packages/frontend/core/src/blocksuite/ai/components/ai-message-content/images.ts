import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

export class ChatContentImages extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .chat-content-images-row {
      display: flex;
      flex-direction: row;
      flex-wrap: nowrap;
      gap: 8px;
      margin-bottom: 8px;
      max-width: 100%;
      overflow-x: auto;
      padding: 4px;
      scrollbar-width: auto;
    }

    .chat-content-images-row::-webkit-scrollbar {
      height: 4px;
    }

    .chat-content-images-row::-webkit-scrollbar-thumb {
      background-color: ${unsafeCSSVar('borderColor')};
      border-radius: 4px;
    }

    .chat-content-images-row::-webkit-scrollbar-track {
      background: transparent;
    }

    .chat-content-images-row img {
      max-width: 180px;
      max-height: 264px;
      object-fit: cover;
      border-radius: 8px;
      flex-shrink: 0;
      image-rendering: pixelated;
    }

    .chat-content-images-column {
      display: flex;
      gap: 12px;
      flex-direction: column;
      margin-bottom: 8px;
    }

    .chat-content-images-column .image-container {
      border-radius: 4px;
      overflow: hidden;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 70%;
      max-width: 320px;
    }

    .chat-content-images-column .image-container img {
      max-width: 100%;
      max-height: 100%;
      width: auto;
      height: auto;
      image-rendering: pixelated;
    }
  `;

  @property({ attribute: false })
  accessor images: string[] = [];

  @property({ attribute: false })
  accessor layout: 'row' | 'column' = 'row';

  protected override render() {
    if (this.images.length === 0) {
      return nothing;
    }

    if (this.layout === 'row') {
      return html`<div class="chat-content-images-row">
        ${repeat(
          this.images,
          image => image,
          image => html`<img src="${image}" />`
        )}
      </div>`;
    } else {
      return html`<div class="chat-content-images-column">
        ${repeat(
          this.images,
          image => image,
          image =>
            html`<div class="image-container">
              <img src="${image}" />
            </div>`
        )}
      </div>`;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-content-images': ChatContentImages;
  }
}
