import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html } from 'lit';

export const styles = css`
  .affine-embed-loom-block {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 12px;

    width: 100%;
    height: 100%;

    border-radius: 8px;
    border: 1px solid ${unsafeCSSVarV2('layer/background/tertiary')};

    background: ${unsafeCSSVarV2('layer/background/primary')};
    user-select: none;
  }

  .affine-embed-loom-video {
    flex-grow: 1;
    width: 100%;
  }

  .affine-embed-loom-video img,
  .affine-embed-loom-video object,
  .affine-embed-loom-video svg {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 4px;
  }

  .affine-embed-loom-video-iframe-container {
    position: relative;
    height: 100%;
  }

  .affine-embed-loom-video-iframe-container > iframe {
    width: 100%;
    height: 100%;
    border-radius: 4px;
  }

  .affine-embed-loom-video-iframe-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  .affine-embed-loom-video-iframe-overlay.hide {
    display: none;
  }

  .affine-embed-loom-content {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: fit-content;
  }

  .affine-embed-loom-content-header {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;

    align-self: stretch;
  }

  .affine-embed-loom-content-title-icon {
    display: flex;
    width: 20px;
    height: 20px;
    justify-content: center;
    align-items: center;
  }

  .affine-embed-loom-content-title-icon img,
  .affine-embed-loom-content-title-icon object,
  .affine-embed-loom-content-title-icon svg {
    width: 20px;
    height: 20px;
    fill: var(--affine-background-primary-color);
  }

  .affine-embed-loom-content-title-text {
    flex: 1 0 0;

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

  .affine-embed-loom-content-description {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;

    flex: 1 0 0;
    align-self: stretch;

    word-break: break-word;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-primary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }

  .affine-embed-loom-content-url {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    width: max-content;
    max-width: 100%;
    cursor: pointer;
  }
  .affine-embed-loom-content-url > span {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;

    word-break: break-all;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-secondary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }
  .affine-embed-loom-content-url:hover > span {
    color: var(--affine-link-color);
  }
  .affine-embed-loom-content-url:hover .open-icon {
    fill: var(--affine-link-color);
  }

  .affine-embed-loom-content-url-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
  }
  .affine-embed-loom-content-url-icon .open-icon {
    height: 12px;
    width: 12px;
    fill: var(--affine-text-secondary-color);
  }

  .affine-embed-loom-block.loading {
    .affine-embed-loom-content-title-text {
      color: var(--affine-placeholder-color);
    }
  }

  .affine-embed-loom-block.selected {
    .affine-embed-loom-content-url > span {
      color: var(--affine-link-color);
    }
    .affine-embed-loom-content-url .open-icon {
      fill: var(--affine-link-color);
    }
  }
`;

export const LoomIcon = html`<svg
  width="20"
  height="20"
  viewBox="0 0 20 20"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_1780_25276)">
    <path
      d="M18.3333 9.07327H13.4597L17.6805 6.63642L16.7536 5.03052L12.5328 7.46736L14.9691 3.24695L13.3632 2.3195L10.9269 6.5399V1.66669H9.073V6.54037L6.63577 2.3195L5.03036 3.24648L7.46713 7.4669L3.24638 5.03052L2.31942 6.63596L6.54017 9.07281H1.66663V10.9268H6.53971L2.31942 13.3636L3.24638 14.9695L7.46667 12.5331L5.0299 16.7535L6.63577 17.6805L9.07254 13.4597V18.3334H10.9265V13.4601L13.3628 17.6805L14.9686 16.7535L12.5319 12.5327L16.7526 14.9695L17.6796 13.3636L13.4593 10.9272H18.3323V9.07327H18.3333ZM9.99996 12.5215C8.60206 12.5215 7.469 11.3884 7.469 9.99047C7.469 8.59253 8.60206 7.45943 9.99996 7.45943C11.3979 7.45943 12.5309 8.59253 12.5309 9.99047C12.5309 11.3884 11.3979 12.5215 9.99996 12.5215Z"
      fill="#625DF5"
    />
  </g>
  <defs>
    <clipPath id="clip0_1780_25276">
      <rect width="20" height="20" fill="white" />
    </clipPath>
  </defs>
</svg>`;
