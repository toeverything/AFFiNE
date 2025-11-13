import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html } from 'lit';

export const EMBED_HTML_MIN_WIDTH = 370;
export const EMBED_HTML_MIN_HEIGHT = 80;

export const styles = css`
  .affine-embed-html-block {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    padding: 12px;
    flex-direction: column;
    align-items: flex-start;
    gap: 20px;

    border-radius: 12px;
    border: 1px solid ${unsafeCSSVarV2('layer/background/tertiary')};

    background: ${unsafeCSSVarV2('layer/background/primary')};
    user-select: none;
  }

  .affine-embed-html {
    flex-grow: 1;
    width: 100%;
  }

  .affine-embed-html img,
  .affine-embed-html object,
  .affine-embed-html svg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }

  .affine-embed-html-iframe-container {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 4px 4px 0px 0px;
    box-shadow: var(--affine-shadow-1);
    overflow: hidden;
  }

  .embed-html-block-iframe-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .embed-html-block-iframe-wrapper > iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .embed-html-block-iframe-wrapper affine-menu {
    min-width: 296px;
  }

  .embed-html-block-iframe-wrapper affine-menu .settings-header {
    padding: 7px 12px;
    font-weight: 500;
    font-size: var(--affine-font-xs);
    color: var(--affine-text-secondary-color);
  }

  .embed-html-block-iframe-wrapper > embed-html-fullscreen-toolbar {
    visibility: hidden;
  }

  .embed-html-block-iframe-wrapper:fullscreen > embed-html-fullscreen-toolbar {
    visibility: visible;
  }

  .affine-embed-html-iframe-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .affine-embed-html-iframe-overlay.hide {
    display: none;
  }

  .affine-embed-html-title {
    height: fit-content;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .affine-embed-html-title-icon {
    display: flex;
    width: 20px;
    height: 20px;
    justify-content: center;
    align-items: center;
  }

  .affine-embed-html-title-icon img,
  .affine-embed-html-title-icon object,
  .affine-embed-html-title-icon svg {
    width: 20px;
    height: 20px;
    fill: var(--affine-background-primary-color);
  }

  .affine-embed-html-title-text {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;

    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-primary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-sm);
    font-style: normal;
    font-weight: 600;
    line-height: 22px;
  }
`;

export const HtmlIcon = html`<svg
  width="20"
  height="20"
  viewBox="0 0 20 20"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M6.66667 1.875C5.40101 1.875 4.375 2.90101 4.375 4.16667V6.66667C4.375 7.01184 4.65482 7.29167 5 7.29167C5.34518 7.29167 5.625 7.01184 5.625 6.66667V4.16667C5.625 3.59137 6.09137 3.125 6.66667 3.125H12.9349C13.2563 3.125 13.5598 3.27341 13.7571 3.52714L15.8222 6.18232C15.9645 6.36517 16.0417 6.5902 16.0417 6.82185V15C16.0417 15.5753 15.5753 16.0417 15 16.0417H6.66667C6.09137 16.0417 5.625 15.5753 5.625 15V13.75C5.625 13.4048 5.34518 13.125 5 13.125C4.65482 13.125 4.375 13.4048 4.375 13.75V15C4.375 16.2657 5.40101 17.2917 6.66667 17.2917H15C16.2657 17.2917 17.2917 16.2657 17.2917 15V6.82185C17.2917 6.31223 17.1218 5.81716 16.8089 5.4149L14.7438 2.75972C14.3096 2.2015 13.642 1.875 12.9349 1.875H6.66667ZM2.30713 11.4758C2.30713 11.7936 2.47945 11.9727 2.78158 11.9727C3.0837 11.9727 3.25602 11.7936 3.25602 11.4758V10.6679H4.3929V11.4758C4.3929 11.7936 4.56523 11.9727 4.86735 11.9727C5.16947 11.9727 5.3418 11.7936 5.3418 11.4758V9.12821C5.3418 8.81043 5.16947 8.63139 4.86735 8.63139C4.56523 8.63139 4.3929 8.81043 4.3929 9.12821V9.91374H3.25602V9.12821C3.25602 8.81043 3.0837 8.63139 2.78158 8.63139C2.47945 8.63139 2.30713 8.81043 2.30713 9.12821V11.4758ZM6.51672 11.4758C6.51672 11.7936 6.68905 11.9727 6.99117 11.9727C7.29329 11.9727 7.46562 11.7936 7.46562 11.4758V9.44377H7.9423C8.19295 9.44377 8.3608 9.30725 8.3608 9.06555C8.3608 8.82385 8.19743 8.68734 7.9423 8.68734H6.04004C5.78491 8.68734 5.62154 8.82385 5.62154 9.06555C5.62154 9.30725 5.78939 9.44377 6.04004 9.44377H6.51672V11.4758ZM9.05457 11.9727C8.79049 11.9727 8.64054 11.8138 8.64054 11.534V9.25354C8.64054 8.85518 8.85986 8.63139 9.25598 8.63139C9.58944 8.63139 9.76624 8.76343 9.90051 9.11479L10.46 10.5717H10.4779L11.0352 9.11479C11.1694 8.76343 11.3462 8.63139 11.6797 8.63139C12.0758 8.63139 12.2951 8.85518 12.2951 9.25354V11.534C12.2951 11.8138 12.1452 11.9727 11.8811 11.9727C11.617 11.9727 11.4671 11.8138 11.4671 11.534V10.0458H11.4492L10.8069 11.6638C10.742 11.8272 10.639 11.901 10.4712 11.901C10.3011 11.901 10.1914 11.825 10.1288 11.6638L9.48649 10.0458H9.46859V11.534C9.46859 11.8138 9.31864 11.9727 9.05457 11.9727ZM12.745 11.4199C12.745 11.7377 12.9173 11.9167 13.2194 11.9167H14.5868C14.8419 11.9167 15.0053 11.7802 15.0053 11.5385C15.0053 11.2968 14.8374 11.1603 14.5868 11.1603H13.6938V9.12821C13.6938 8.81043 13.5215 8.63139 13.2194 8.63139C12.9173 8.63139 12.745 8.81043 12.745 9.12821V11.4199Z"
    fill="#77757D"
  />
</svg> `;
