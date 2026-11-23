import {
  getHostName,
  isValidUrl,
  normalizeUrl,
} from '@blocksuite/affine-shared/utils';
import { PropTypes, requiredProperties } from '@blocksuite/std';
import { css, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { html } from 'lit-html';

@requiredProperties({
  url: PropTypes.string,
})
export class LinkPreview extends LitElement {
  static override styles = css`
    .affine-link-preview {
      display: flex;
      justify-content: flex-start;
      min-width: 60px;
      max-width: 140px;
      user-select: none;
      cursor: pointer;

      color: var(--affine-link-color);
      font-feature-settings:
        'clig' off,
        'liga' off;
      font-family: var(--affine-font-family);
      font-size: var(--affine-font-sm);
      font-style: normal;
      font-weight: 400;
      text-decoration: none;
      text-wrap: nowrap;
    }

    .affine-link-preview > span {
      display: inline-block;
      -webkit-line-clamp: 1;
      -webkit-box-orient: vertical;

      text-overflow: ellipsis;
      overflow: hidden;
    }
  `;

  @property({ attribute: false })
  accessor url!: string;

  override render() {
    const { url } = this;
    const normalizedUrl = normalizeUrl(url);
    const safeUrl =
      normalizedUrl && isValidUrl(normalizedUrl) ? normalizedUrl : null;
    const hostName = getHostName(safeUrl ?? url);

    if (!safeUrl) {
      return html`
        <span class="affine-link-preview">
          <span>${hostName}</span>
        </span>
      `;
    }

    return html`
      <a
        class="affine-link-preview"
        rel="noopener noreferrer"
        target="_blank"
        href=${safeUrl}
      >
        <span>${hostName}</span>
      </a>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-link-preview': LinkPreview;
  }
}
