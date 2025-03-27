import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { WithDisposable } from '@blocksuite/global/lit';
import { EmbedIcon } from '@blocksuite/icons/lit';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';

export class EmbedIframeIdleCard extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
    }

    .affine-embed-iframe-idle-card {
      width: 100%;
      height: 48px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      padding: 12px;
      gap: 8px;
      border-radius: 8px;
      border: 1px solid var(--affine-border-color);
      background-color: ${unsafeCSSVarV2('layer/background/secondary')};

      .icon {
        display: flex;
        width: 24px;
        height: 24px;
        justify-content: center;
        align-items: center;
        color: ${unsafeCSSVarV2('icon/secondary')};
        flex-shrink: 0;
      }

      .text {
        /* Client/base */
        font-size: 15px;
        font-style: normal;
        font-weight: 400;
        line-height: 24px; /* 160% */
        font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
        color: ${unsafeCSSVarV2('text/secondary')};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .affine-embed-iframe-idle-card:hover {
      cursor: pointer;
    }
  `;

  override render() {
    return html`
      <div class="affine-embed-iframe-idle-card">
        <span class="icon">
          ${EmbedIcon({ width: '24px', height: '24px' })}
        </span>
        <span class="text">
          Embed anything (Google Drive, Google Docs, Spotify, Miro…)
        </span>
      </div>
    `;
  }
}
