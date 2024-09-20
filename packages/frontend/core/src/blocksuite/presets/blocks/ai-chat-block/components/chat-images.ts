import { css, html, LitElement, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { repeat } from 'lit/directives/repeat.js';

import { ImageLoadingFailedIcon, LoadingIcon } from '../../_common/icon';

export class ChatImage extends LitElement {
  static override styles = css`
    .image-container {
      border-radius: 4px;
      overflow: hidden;
      position: relative;
      display: flex;
      justify-content: center;
      align-items: center;
      width: 70%;
      max-width: 200px;
      max-height: 122px;

      img {
        max-width: 100%;
        max-height: 100%;
        width: auto;
        height: auto;
      }
    }
  `;

  override render() {
    return choose(this.status, [
      [
        'loading',
        () =>
          html`<image-placeholder
            .text=${'Loading image'}
            .icon=${LoadingIcon}
          ></image-placeholder>`,
      ],
      [
        'error',
        () =>
          html`<image-placeholder
            .text=${'Image Loading Failed'}
            .icon=${ImageLoadingFailedIcon}
          ></image-placeholder>`,
      ],
      [
        'success',
        () =>
          html`<div class="image-container">
            <img src=${this.imageUrl} />
          </div>`,
      ],
    ]);
  }

  @property({ attribute: false })
  accessor imageUrl!: string;

  @property({ attribute: false })
  accessor status!: 'loading' | 'error' | 'success';
}

export class ChatImages extends LitElement {
  static override styles = css`
    .images-container {
      display: flex;
      width: 100%;
      gap: 8px;
      flex-wrap: wrap;
    }
  `;

  override render() {
    if (!this.attachments || this.attachments.length === 0) {
      return nothing;
    }

    return html`<div class="images-container">
      ${repeat(
        this.attachments,
        attachment => attachment,
        attachment =>
          html`<chat-image
            .imageUrl=${attachment}
            .status=${'success'}
          ></chat-image>`
      )}
    </div>`;
  }

  @property({ attribute: false })
  accessor attachments: string[] | undefined;
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-image': ChatImage;
    'chat-images': ChatImages;
  }
}
