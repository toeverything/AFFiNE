import { embedNoteContentStyles } from '@blocksuite/affine-block-embed';
import {
  EMBED_CARD_HEIGHT,
  EMBED_CARD_WIDTH,
} from '@blocksuite/affine-shared/consts';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html } from 'lit';

export const blockStyles = css`
  affine-embed-synced-doc-block {
    --embed-padding: 24px;
  }
  affine-embed-synced-doc-block[data-page-mode] {
    width: calc(100% + var(--embed-padding) * 2);
    margin-left: calc(-1 * var(--embed-padding));
    margin-right: calc(-1 * var(--embed-padding));
  }
  .edgeless-block-portal-embed
    > affine-embed-synced-doc-block[data-nested-editor] {
    position: relative;
    display: block;
    left: 0px;
    top: 0px;
    width: 100%;
    height: 100%;
  }

  .edgeless-block-portal-embed
    .affine-embed-synced-doc-editor
    .affine-page-root-block-container {
    width: 100%;
  }

  .edgeless-block-portal-embed .affine-embed-synced-doc-container.edgeless {
    display: block;
    padding: 0;
    width: 100%;
    height: calc(${EMBED_CARD_HEIGHT.syncedDoc}px + 36px);
  }
  .edgeless-block-portal-embed .affine-embed-synced-doc-container.surface {
    border: 1px solid var(--affine-border-color);
  }

  affine-embed-synced-doc-block[data-nested-editor],
  affine-embed-edgeless-synced-doc-block[data-nested-editor] {
    .affine-embed-synced-doc-container.page {
      padding: 0 var(--embed-padding);
    }
  }

  .affine-embed-synced-doc-editor {
    pointer-events: none;
  }

  .affine-embed-synced-doc-container {
    border: 1px solid transparent;
    border-radius: 8px;
    overflow: hidden;
  }
  .affine-embed-synced-doc-container.comment-highlighted {
    outline: 2px solid ${unsafeCSSVarV2('block/comment/highlightUnderline')};
  }
  .affine-embed-synced-doc-container.show-hover-border:hover {
    border-color: var(--affine-border-color);
  }
  .affine-embed-synced-doc-container.page {
    display: block;
    width: 100%;
  }
  .affine-embed-synced-doc-container.edgeless {
    display: block;
    width: 100%;
    height: calc(${EMBED_CARD_HEIGHT.syncedDoc}px + 36px);
  }
  .affine-embed-synced-doc-header-wrapper {
    position: absolute;
    top: 0;
    left: 0;
    height: 34px;
    width: 100%;
    background-color: var(--affine-white);
    opacity: 0;
  }
  @media print {
    .affine-embed-synced-doc-header-wrapper {
      display: none;
    }
  }
  .affine-embed-synced-doc-header-wrapper.selected {
    opacity: 1;
    transition: all 0.23s ease;
  }
  .affine-embed-synced-doc-header {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    padding: 0 var(--embed-padding);
    background-color: var(--affine-hover-color);
  }
  .affine-embed-synced-doc-header svg {
    flex-shrink: 0;
  }
  .affine-embed-synced-doc-icon {
    line-height: 0;
    color: ${unsafeCSSVarV2('icon/primary')};
  }
  .affine-embed-synced-doc-title {
    font-size: 14px;
    font-weight: 600;
    line-height: 22px;
    margin-left: 8px;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .affine-embed-synced-doc-editor-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    cursor: pointer;
  }

  .affine-embed-synced-doc-editor-empty {
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    min-height: 44px;
  }

  .affine-embed-synced-doc-container.surface
    > .affine-embed-synced-doc-editor
    > .affine-embed-synced-doc-editor-empty {
    left: 0;
    justify-content: center;
  }

  .affine-embed-synced-doc-editor-empty > span {
    color: var(--affine-placeholder-color);
    font-feature-settings:
      'clig' off,
      'liga' off;
    font-family: var(--affine-font-family);
    font-size: 15px;
    font-style: normal;
    font-weight: 400;
    line-height: 24px;
  }

  .affine-embed-synced-doc-container.surface {
    border-color: ${unsafeCSSVarV2('layer/insideBorder/border')};
    background: ${unsafeCSSVarV2('layer/background/linkedDocOnEdgeless')};

    affine-preview-root {
      padding: 0 24px;
    }
  }

  .affine-embed-synced-doc-container
    > .affine-embed-synced-doc-editor.affine-page-viewport {
    background: transparent;
  }

  .affine-embed-synced-doc-container > .affine-embed-synced-doc-editor {
    width: 100%;
    height: 100%;
  }

  .affine-embed-synced-doc-editor .affine-page-root-block-container {
    width: 100%;
    max-width: 100%;
  }

  @container (max-width: 640px) {
    affine-embed-synced-doc-block {
      --embed-padding: 8px;
    }
    .affine-embed-synced-doc-title {
      font-weight: 400;
    }
    .affine-embed-synced-doc-header-wrapper {
      height: 33px;
    }
  }
`;

export const cardStyles = css`
  .affine-embed-synced-doc-card {
    margin: 0 auto;
    box-sizing: border-box;
    display: flex;
    width: 100%;
    height: ${EMBED_CARD_HEIGHT.horizontal}px;
    border-radius: 8px;
    border: 1px solid ${unsafeCSSVarV2('layer/background/tertiary')};
    background: ${unsafeCSSVarV2('layer/background/primary')};
    user-select: none;
  }

  .affine-embed-synced-doc-card-content {
    width: calc(100% - 204px);
    height: 100%;
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: 4px;
    padding: 12px;
  }

  .affine-embed-synced-doc-card-content-title {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    align-self: stretch;
  }

  .affine-embed-synced-doc-card-content-title-icon {
    display: flex;
    width: 16px;
    height: 16px;
    justify-content: center;
    align-items: center;
  }
  .affine-embed-synced-doc-card-content-title-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-background-primary-color);
  }

  .affine-embed-synced-doc-card-content-title-text {
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

  .affine-embed-synced-doc-content-note.render {
    display: none;
    overflow: hidden;
    pointer-events: none;
  }

  ${embedNoteContentStyles}

  .affine-embed-synced-doc-content-note.default {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    white-space: normal;
    word-break: break-word;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-placeholder-color);
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }

  .affine-embed-synced-doc-card-content-date,
  .affine-embed-synced-doc-card-content-reload {
    display: flex;
    flex-grow: 1;
    align-items: flex-end;
    justify-content: flex-start;
    gap: 8px;
    width: max-content;
    max-width: 100%;
    line-height: 20px;
  }

  .affine-embed-synced-doc-card-content-date > span {
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

  .affine-embed-synced-doc-card-content-reload-button {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    color: ${unsafeCSSVarV2('button/primary')};
  }
  .affine-embed-synced-doc-card-content-reload-button svg {
    width: 12px;
    height: 12px;
  }
  .affine-embed-synced-doc-card-content-reload-button > span {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    word-break: break-all;
    white-space: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 500;
    line-height: 20px;
  }

  .affine-embed-synced-doc-card-banner {
    margin: 12px 12px 0px 0px;
    width: 204px;
    max-width: 100%;
    height: 102px;
    pointer-events: none;
  }
  .affine-embed-synced-doc-card-banner.render {
    display: none;
  }
  .affine-embed-synced-doc-card-banner img,
  .affine-embed-synced-doc-card-banner object,
  .affine-embed-synced-doc-card-banner svg {
    width: 204px;
    max-width: 100%;
    height: 102px;
    object-fit: cover;
    border-radius: 4px;
  }

  .affine-embed-synced-doc-card.loading,
  .affine-embed-synced-doc-card.deleted,
  .affine-embed-synced-doc-card.error {
    .affine-embed-linked-doc-content-note.render {
      display: none;
    }
    .affine-embed-linked-doc-content-note.default {
      display: block;
    }
    .affine-embed-synced-doc-card-banner.render {
      display: none;
    }
    .affine-embed-synced-doc-card-banner.default {
      display: block;
    }
    .affine-embed-synced-doc-card-content-date {
      display: none;
    }
  }

  .affine-embed-synced-doc-card:not(.loading).deleted,
  .affine-embed-synced-doc-card:not(.loading).error {
    background: var(--affine-background-secondary-color);
  }
  .affine-embed-synced-doc-card:not(.loading):not(.error):not(
      .surface
    ).deleted {
    height: ${EMBED_CARD_HEIGHT.horizontalThin}px;
    .affine-embed-synced-doc-card-banner {
      height: 66px;
    }
    .affine-embed-synced-doc-card-banner img,
    .affine-embed-synced-doc-card-banner object,
    .affine-embed-synced-doc-card-banner svg {
      height: 66px;
    }
    .affine-embed-synced-doc-card-content {
      gap: 12px;
    }
  }

  .affine-embed-synced-doc-card:not(.loading):not(.error):not(.deleted):not(
      .note-empty
    ).cycle {
    .affine-embed-synced-doc-content-note.render {
      display: block;
    }
    .affine-embed-synced-doc-content-note.default {
      display: none;
    }
  }

  .affine-embed-synced-doc-card:not(.loading):not(.error):not(.deleted):not(
      .banner-empty
    ).cycle {
    .affine-embed-synced-doc-card-banner.render {
      display: block;
    }
    .affine-embed-synced-doc-card-banner.default {
      display: none;
    }
  }
  .affine-embed-synced-doc-card:not(.loading):not(.error):not(
      .deleted
    ).cycle.banner-empty {
    .affine-embed-synced-doc-card-content {
      width: 100%;
      height: 100%;
    }

    .affine-embed-synced-doc-card-banner.render {
      display: none;
    }

    .affine-embed-synced-doc-card-banner.default {
      display: none;
    }
  }

  .affine-embed-synced-doc-card.surface:not(.cycle) {
    width: ${EMBED_CARD_WIDTH.syncedDoc}px;
    height: ${EMBED_CARD_HEIGHT.syncedDoc}px;
    flex-direction: column-reverse;

    .affine-embed-synced-doc-card-banner.default {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      width: 100%;
      height: 267.5px;
      margin-left: 12px;
      flex-shrink: 0;
    }
    .affine-embed-synced-doc-card-banner img,
    .affine-embed-synced-doc-card-banner object,
    .affine-embed-synced-doc-card-banner svg {
      width: 340px;
      height: 170px;
    }

    .affine-embed-synced-doc-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      width: 100%;
      height: 100%;
    }

    .affine-embed-synced-doc-card-content-title {
      margin: 0 auto;
    }

    .affine-embed-synced-doc-card-content-note {
      margin: 0 auto;
      flex-grow: 0;
    }

    .affine-embed-synced-doc-card-content-reload {
      flex-grow: 0;
      margin: 0 auto;
    }
  }

  .affine-embed-synced-doc-card.surface:not(.loading):not(.error):not(
      .deleted
    ).cycle {
    width: ${EMBED_CARD_WIDTH.vertical}px;
    height: ${EMBED_CARD_HEIGHT.vertical}px;
    flex-direction: column-reverse;

    .affine-embed-synced-doc-card-content {
      width: 100%;
    }

    .affine-embed-synced-doc-card-content-note {
      -webkit-line-clamp: 6;
      max-height: 130px;
    }

    .affine-embed-synced-doc-card-content-date {
      flex-grow: 1;
      align-items: flex-end;
    }

    .affine-embed-synced-doc-card-banner {
      width: 340px;
      height: 170px;
      margin-left: 12px;
    }
    .affine-embed-synced-doc-card-banner img,
    .affine-embed-synced-doc-card-banner object,
    .affine-embed-synced-doc-card-banner svg {
      width: 340px;
      height: 170px;
    }
  }

  .affine-embed-synced-doc-card.surface:not(.loading):not(.error):not(
      .deleted
    ).cycle:not(.empty).banner-empty {
    .affine-embed-synced-doc-card-content {
      width: 100%;
      height: 100%;
    }

    .affine-embed-synced-doc-card-banner.render {
      display: none;
    }

    .affine-embed-synced-doc-card-banner.default {
      display: none;
    }

    .affine-embed-synced-doc-card-content-note {
      -webkit-line-clamp: 16;
      max-height: 320px;
    }

    .affine-embed-synced-doc-card-content-date {
      flex-grow: unset;
      align-items: center;
    }
  }

  .affine-embed-synced-doc-edgeless-header-wrapper {
    position: relative;
    z-index: 2; // Make sure the header is above the overlay
  }
`;

export const SyncedDocErrorIcon = html`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32842)">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M2.5 8C2.5 4.96243 4.96243 2.5 8 2.5C11.0376 2.5 13.5 4.96243 13.5 8C13.5 11.0376 11.0376 13.5 8 13.5C4.96243 13.5 2.5 11.0376 2.5 8ZM8 1.5C4.41015 1.5 1.5 4.41015 1.5 8C1.5 11.5899 4.41015 14.5 8 14.5C11.5899 14.5 14.5 11.5899 14.5 8C14.5 4.41015 11.5899 1.5 8 1.5ZM8.66667 5.33333C8.66667 5.70152 8.36819 6 8 6C7.63181 6 7.33333 5.70152 7.33333 5.33333C7.33333 4.96514 7.63181 4.66667 8 4.66667C8.36819 4.66667 8.66667 4.96514 8.66667 5.33333ZM8 7.16667C8.27614 7.16667 8.5 7.39052 8.5 7.66667V11C8.5 11.2761 8.27614 11.5 8 11.5C7.72386 11.5 7.5 11.2761 7.5 11V7.66667C7.5 7.39052 7.72386 7.16667 8 7.16667Z"
      fill="#EB4335"
    />
  </g>
  <defs>
    <clipPath id="clip0_6122_32842">
      <rect width="16" height="16" fill="white" />
    </clipPath>
  </defs>
</svg>`;

export const SyncedDocDeletedIcon = html`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32858)">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M7.33343 1.5C6.32091 1.5 5.5001 2.32081 5.5001 3.33333V4.09994H2.66676C2.3538 4.09994 2.1001 4.35364 2.1001 4.6666C2.1001 4.97956 2.3538 5.23327 2.66676 5.23327H2.87263L3.41292 12.7973C3.48144 13.7567 4.27975 14.5 5.24159 14.5H10.7586C11.7204 14.5 12.5188 13.7567 12.5873 12.7973L13.1276 5.23327H13.3334C13.6464 5.23327 13.9001 4.97956 13.9001 4.6666C13.9001 4.35364 13.6464 4.09994 13.3334 4.09994H10.5001V3.33333C10.5001 2.32081 9.67929 1.5 8.66676 1.5H7.33343ZM9.5001 4.09994V3.33333C9.5001 2.8731 9.127 2.5 8.66676 2.5H7.33343C6.87319 2.5 6.5001 2.8731 6.5001 3.33333V4.09994H9.5001ZM12.125 5.23327H3.87518L4.41037 12.726C4.44152 13.1621 4.80439 13.5 5.24159 13.5H10.7586C11.1958 13.5 11.5587 13.1621 11.5898 12.726L12.125 5.23327ZM7.16676 7.33333C7.16676 7.05719 6.94291 6.83333 6.66676 6.83333C6.39062 6.83333 6.16676 7.05719 6.16676 7.33333V11.3333C6.16676 11.6095 6.39062 11.8333 6.66676 11.8333C6.94291 11.8333 7.16676 11.6095 7.16676 11.3333V7.33333ZM9.33343 6.83333C9.60957 6.83333 9.83343 7.05719 9.83343 7.33333V11.3333C9.83343 11.6095 9.60957 11.8333 9.33343 11.8333C9.05729 11.8333 8.83343 11.6095 8.83343 11.3333V7.33333C8.83343 7.05719 9.05729 6.83333 9.33343 6.83333Z"
      fill="#77757D"
    />
  </g>
  <defs>
    <clipPath id="clip0_6122_32858">
      <rect width="16" height="16" fill="white" />
    </clipPath>
  </defs>
</svg>`;

export const LightSyncedDocEmptyBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32989)">
    <g filter="url(#filter0_d_6122_32989)">
      <rect
        x="96.667"
        y="5.5"
        width="176.297"
        height="200"
        rx="6.66667"
        transform="rotate(8 96.667 5.5)"
        fill="white"
        shape-rendering="crispEdges"
      />
      <rect
        x="119.363"
        y="35.6191"
        width="86.6667"
        height="11.6667"
        rx="5"
        transform="rotate(8 119.363 35.6191)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="116.348"
        y="57.0742"
        width="122.964"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 116.348 57.0742)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="114.028"
        y="73.5781"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 114.028 73.5781)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="111.708"
        y="90.083"
        width="122.964"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 111.708 90.083)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="109.389"
        y="106.588"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 109.389 106.588)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="107.069"
        y="123.092"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 107.069 123.092)"
        fill="black"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_6122_32989"
      x="60.4992"
      y="-2.83333"
      width="219.082"
      height="239.257"
      filterUnits="userSpaceOnUse"
      color-interpolation-filters="sRGB"
    >
      <feFlood flood-opacity="0" result="BackgroundImageFix" />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feOffset />
      <feGaussianBlur stdDeviation="4.16667" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_6122_32989"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_6122_32989"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_6122_32989">
      <rect
        width="340"
        height="170"
        fill="white"
        transform="translate(0 0.5)"
      />
    </clipPath>
  </defs>
</svg>`;

export const DarkSyncedDocEmptyBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_33004)">
    <g filter="url(#filter0_d_6122_33004)">
      <rect
        x="96.6667"
        y="5.5"
        width="176.297"
        height="200"
        rx="6.66667"
        transform="rotate(8 96.6667 5.5)"
        fill="#232323"
        shape-rendering="crispEdges"
      />
      <rect
        x="119.363"
        y="35.6191"
        width="86.6667"
        height="11.6667"
        rx="5"
        transform="rotate(8 119.363 35.6191)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="116.347"
        y="57.0742"
        width="122.964"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 116.347 57.0742)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="114.028"
        y="73.5781"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 114.028 73.5781)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="111.708"
        y="90.083"
        width="122.964"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 111.708 90.083)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="109.389"
        y="106.588"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 109.389 106.588)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="107.069"
        y="123.092"
        width="65"
        height="6.66667"
        rx="3.33333"
        transform="rotate(8 107.069 123.092)"
        fill="white"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_6122_33004"
      x="60.4987"
      y="-2.83333"
      width="219.082"
      height="239.257"
      filterUnits="userSpaceOnUse"
      color-interpolation-filters="sRGB"
    >
      <feFlood flood-opacity="0" result="BackgroundImageFix" />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feOffset />
      <feGaussianBlur stdDeviation="4.16667" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_6122_33004"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_6122_33004"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_6122_33004">
      <rect
        width="340"
        height="170"
        fill="white"
        transform="translate(0 0.5)"
      />
    </clipPath>
  </defs>
</svg>`;

export const LightSyncedDocErrorBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32955)">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M159.19 14.3317L178.489 53.8348L142.603 95.6828L150.082 105.622L128.309 102.546C125.587 102.162 123.07 104.067 122.687 106.802C122.304 109.537 124.201 112.065 126.923 112.45L158.585 116.922L167.84 129.222L164.27 136.241L124.382 130.606C121.66 130.222 119.143 132.127 118.76 134.862C118.377 137.597 120.274 140.125 122.996 140.51L159.476 145.663L146.19 171.778L155.104 215.74L78.791 204.961C73.3466 204.192 69.5537 199.134 70.3192 193.665L95.2679 15.4017C96.0334 9.93217 101.067 6.12164 106.512 6.89067L159.19 14.3317ZM191.977 66.6249L160.492 98.2097L165.699 107.828L210.458 114.15C213.18 114.535 215.076 117.063 214.694 119.798C214.311 122.533 211.794 124.438 209.072 124.054L171.619 118.763L178.062 130.666L174.281 137.655L206.531 142.21C209.253 142.595 211.149 145.123 210.767 147.858C210.384 150.593 207.867 152.498 205.145 152.114L169.205 147.037L155.135 173.041L157.943 216.141L233.231 226.776C238.675 227.545 243.709 223.734 244.475 218.265L259.721 109.326C260.231 105.68 257.703 102.308 254.073 101.796L208.07 95.2975C197.181 93.7594 189.595 83.6447 191.126 72.7056L191.977 66.6249ZM206.99 31.1828C207.502 27.5282 212.156 26.3192 214.367 29.2668L256.041 84.8329C258.251 87.7805 255.811 91.9418 252.173 91.4279L209.456 85.394C204.012 84.6249 200.219 79.5676 200.984 74.098L206.99 31.1828Z"
      fill="#E6E6E6"
    />
  </g>
  <defs>
    <clipPath id="clip0_6122_32955">
      <rect
        width="340"
        height="170"
        fill="white"
        transform="translate(0 0.5)"
      />
    </clipPath>
  </defs>
</svg>`;

export const DarkSyncedDocErrorBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32972)">
    <path
      fill-rule="evenodd"
      clip-rule="evenodd"
      d="M159.191 14.3317L178.489 53.8348L142.603 95.6828L150.082 105.622L128.309 102.546C125.587 102.162 123.07 104.067 122.687 106.802C122.304 109.537 124.201 112.065 126.923 112.45L158.585 116.922L167.841 129.222L164.27 136.241L124.382 130.606C121.66 130.222 119.143 132.127 118.76 134.862C118.377 137.597 120.274 140.125 122.996 140.51L159.477 145.663L146.19 171.778L155.105 215.74L78.7912 204.961C73.3469 204.192 69.5539 199.134 70.3194 193.665L95.2681 15.4017C96.0336 9.93217 101.068 6.12164 106.512 6.89067L159.191 14.3317ZM191.978 66.6249L160.492 98.2097L165.699 107.828L210.458 114.15C213.18 114.535 215.077 117.063 214.694 119.798C214.311 122.533 211.794 124.438 209.072 124.054L171.619 118.763L178.063 130.666L174.281 137.655L206.531 142.21C209.253 142.595 211.15 145.123 210.767 147.858C210.384 150.593 207.867 152.498 205.145 152.114L169.205 147.037L155.135 173.041L157.943 216.141L233.231 226.776C238.675 227.545 243.709 223.734 244.475 218.265L259.721 109.326C260.232 105.68 257.703 102.308 254.074 101.796L208.07 95.2975C197.181 93.7594 189.596 83.6447 191.127 72.7056L191.978 66.6249ZM206.991 31.1828C207.502 27.5282 212.156 26.3192 214.367 29.2668L256.041 84.8329C258.252 87.7805 255.811 91.9418 252.174 91.4279L209.456 85.394C204.012 84.6249 200.219 79.5676 200.984 74.098L206.991 31.1828Z"
      fill="#313131"
    />
  </g>
  <defs>
    <clipPath id="clip0_6122_32972">
      <rect
        width="340"
        height="170"
        fill="white"
        transform="translate(0 0.5)"
      />
    </clipPath>
  </defs>
</svg>`;

export const LightSyncedDocDeletedBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32919)">
    <g filter="url(#filter0_d_6122_32919)">
      <rect
        width="124"
        height="154"
        transform="translate(41 61.5)"
        fill="white"
      />
      <rect
        x="59.7563"
        y="82.0332"
        width="60.9578"
        height="8.98333"
        rx="4.49167"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="100"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="112.833"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="125.667"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="138.5"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
    </g>
    <path
      d="M296.961 48.4114L266.018 40.6164L267.32 35.715C269.478 27.5941 263.671 19.1074 254.349 16.7592L231.845 11.0901C222.524 8.7418 213.218 13.4213 211.06 21.5422L209.758 26.4436L178.815 18.6486C171.047 16.6917 163.292 20.5915 161.494 27.3587L158.889 37.1614C158.17 39.8685 160.105 42.6973 163.213 43.48L298.237 77.4947C301.344 78.2775 304.446 76.7177 305.166 74.0106L307.77 64.2079C309.568 57.4407 304.729 50.3682 296.961 48.4114ZM222.312 24.3768C223.03 21.6749 226.139 20.1115 229.241 20.8927L251.745 26.5619C254.846 27.3431 256.786 30.1786 256.068 32.8805L254.766 37.7818L221.01 29.2781L222.312 24.3768Z"
      fill="#E6E6E6"
    />
    <path
      d="M159.323 87.3263C158.256 87.3246 157.405 88.1403 157.454 89.1171L162.221 184.002C162.662 192.784 170.517 199.674 180.103 199.689L270.871 199.838C280.457 199.853 288.336 192.989 288.807 184.209L293.902 89.3401C293.955 88.3635 293.106 87.545 292.04 87.5432L159.323 87.3263ZM249.566 101.172C249.571 98.1451 252.25 95.6974 255.552 95.7028C258.854 95.7082 261.525 98.1646 261.52 101.192L261.397 172.425C261.391 175.452 258.712 177.9 255.41 177.895C252.108 177.889 249.437 175.433 249.443 172.405L249.566 101.172ZM219.68 101.124C219.686 98.0962 222.365 95.6485 225.667 95.6539C228.969 95.6593 231.64 98.1158 231.635 101.143L231.512 172.376C231.506 175.403 228.827 177.851 225.525 177.846C222.223 177.84 219.552 175.384 219.557 172.356L219.68 101.124ZM189.795 101.075C189.801 98.0474 192.48 95.5997 195.782 95.6051C199.084 95.6105 201.755 98.0669 201.749 101.094L201.626 172.327C201.621 175.355 198.942 177.802 195.64 177.797C192.338 177.791 189.667 175.335 189.672 172.308L189.795 101.075Z"
      fill="#E6E6E6"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_6122_32919"
      x="27"
      y="51.5"
      width="152"
      height="182"
      filterUnits="userSpaceOnUse"
      color-interpolation-filters="sRGB"
    >
      <feFlood flood-opacity="0" result="BackgroundImageFix" />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feOffset dy="4" />
      <feGaussianBlur stdDeviation="7" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_6122_32919"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_6122_32919"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_6122_32919">
      <path
        d="M0 4.5C0 2.29086 1.79086 0.5 4 0.5H336C338.209 0.5 340 2.29086 340 4.5V170.5H0V4.5Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg>`;

export const DarkSyncedDocDeletedBanner = html`<svg
  width="340"
  height="171"
  viewBox="0 0 340 171"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_6122_32937)">
    <g filter="url(#filter0_d_6122_32937)">
      <path
        d="M41 65.5C41 63.2909 42.7909 61.5 45 61.5H161C163.209 61.5 165 63.2909 165 65.5V215.5H41V65.5Z"
        fill="#363636"
        shape-rendering="crispEdges"
      />
      <rect
        x="59.7563"
        y="82.0332"
        width="60.9578"
        height="8.98333"
        rx="4.49167"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="100"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="112.833"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="125.667"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7563"
        y="138.5"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
    </g>
    <path
      d="M296.961 48.4114L266.018 40.6164L267.32 35.715C269.478 27.5941 263.671 19.1074 254.349 16.7592L231.845 11.0901C222.524 8.7418 213.218 13.4213 211.06 21.5422L209.758 26.4436L178.815 18.6486C171.047 16.6917 163.292 20.5915 161.494 27.3587L158.889 37.1614C158.17 39.8685 160.105 42.6973 163.213 43.48L298.237 77.4947C301.344 78.2775 304.446 76.7177 305.166 74.0106L307.77 64.2079C309.568 57.4407 304.729 50.3682 296.961 48.4114ZM222.312 24.3768C223.03 21.6749 226.139 20.1115 229.241 20.8927L251.745 26.5619C254.846 27.3431 256.786 30.1786 256.068 32.8805L254.766 37.7818L221.01 29.2781L222.312 24.3768Z"
      fill="#646464"
    />
    <path
      d="M159.323 87.3263C158.256 87.3246 157.405 88.1403 157.454 89.1171L162.221 184.002C162.662 192.784 170.517 199.674 180.103 199.689L270.871 199.838C280.457 199.853 288.336 192.989 288.807 184.209L293.902 89.3401C293.955 88.3635 293.106 87.545 292.04 87.5432L159.323 87.3263ZM249.566 101.172C249.571 98.1451 252.25 95.6974 255.552 95.7028C258.854 95.7082 261.525 98.1646 261.52 101.192L261.397 172.425C261.391 175.452 258.712 177.9 255.41 177.895C252.108 177.889 249.437 175.433 249.443 172.405L249.566 101.172ZM219.68 101.124C219.686 98.0962 222.365 95.6485 225.667 95.6539C228.969 95.6593 231.64 98.1158 231.635 101.143L231.512 172.376C231.506 175.403 228.827 177.851 225.525 177.846C222.223 177.84 219.552 175.384 219.557 172.356L219.68 101.124ZM189.795 101.075C189.801 98.0474 192.48 95.5997 195.782 95.6051C199.084 95.6105 201.755 98.0669 201.749 101.094L201.626 172.327C201.621 175.355 198.942 177.802 195.64 177.797C192.338 177.791 189.667 175.335 189.672 172.308L189.795 101.075Z"
      fill="#646464"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_6122_32937"
      x="27"
      y="51.5"
      width="152"
      height="182"
      filterUnits="userSpaceOnUse"
      color-interpolation-filters="sRGB"
    >
      <feFlood flood-opacity="0" result="BackgroundImageFix" />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feOffset dy="4" />
      <feGaussianBlur stdDeviation="7" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_6122_32937"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_6122_32937"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_6122_32937">
      <path
        d="M0 4.5C0 2.29086 1.79086 0.5 4 0.5H336C338.209 0.5 340 2.29086 340 4.5V170.5H0V4.5Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg>`;
