import { embedNoteContentStyles } from '@blocksuite/affine-block-embed';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html } from 'lit';

export const styles = css`
  .affine-embed-linked-doc-block {
    box-sizing: border-box;
    display: flex;
    width: 100%;
    height: 100%;
    border-radius: 8px;
    border: 1px solid var(--affine-background-tertiary-color);
    background: ${unsafeCSSVarV2('layer/background/primary')};
    user-select: none;
    position: relative;
  }

  .affine-embed-linked-doc-block.comment-highlighted {
    outline: 2px solid ${unsafeCSSVarV2('block/comment/highlightUnderline')};
  }

  .affine-embed-linked-doc-block.in-canvas {
    border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    background: ${unsafeCSSVarV2('layer/background/linkedDocOnEdgeless')};
  }

  .affine-embed-linked-doc-content {
    flex-grow: 1;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-self: stretch;
    gap: 4px;
    padding: 12px;
    max-width: 100%;
  }

  .affine-embed-linked-doc-content-title {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
    align-self: stretch;
  }

  .affine-embed-linked-doc-content-title-icon {
    display: flex;
    width: 16px;
    height: 16px;
    justify-content: center;
    align-items: center;
    color: ${unsafeCSSVarV2('icon/primary')};
  }
  .affine-embed-linked-doc-content-title-icon img,
  .affine-embed-linked-doc-content-title-icon object,
  .affine-embed-linked-doc-content-title-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-background-primary-color);
  }

  .affine-embed-linked-doc-content-title-text {
    flex-grow: 1;
    position: relative;
    height: 22px;
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

  .affine-embed-linked-doc-content-note.render {
    display: none;
    overflow: hidden;
    pointer-events: none;
    flex: 1;
  }

  ${embedNoteContentStyles}

  .affine-embed-linked-doc-content-note.alias,
  .affine-embed-linked-doc-content-note.default {
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    position: relative;
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

    p {
      padding: 0 2px;
    }
  }

  .affine-embed-linked-doc-content-note.alias {
    color: var(--affine-text-primary-color);
  }

  .affine-embed-linked-doc-card-content-reload,
  .affine-embed-linked-doc-content-date {
    display: flex;
    height: 20px;
    align-items: flex-end;
    justify-content: flex-start;
    gap: 8px;
    width: max-content;
    max-width: 100%;
    line-height: 20px;
  }

  .affine-embed-linked-doc-card-content-reload-button {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    color: ${unsafeCSSVarV2('button/primary')};
  }
  .affine-embed-linked-doc-card-content-reload-button svg {
    width: 12px;
    height: 12px;
  }
  .affine-embed-linked-doc-card-content-reload-button > span {
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

  .affine-embed-linked-doc-content-date > span {
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

  .affine-embed-linked-doc-banner {
    margin: 12px 12px 0px 0px;
    width: 204px;
    min-width: 204px;
    max-width: 100%;
    height: 102px;
    pointer-events: none;
  }
  .affine-embed-linked-doc-banner img,
  .affine-embed-linked-doc-banner object,
  .affine-embed-linked-doc-banner svg {
    width: 204px;
    max-width: 100%;
    height: 102px;
    object-fit: cover;
    border-radius: 4px;
  }

  .affine-embed-linked-doc-block.loading {
    .affine-embed-linked-doc-content-date {
      display: none;
    }
  }

  .affine-embed-linked-doc-block:not(.loading):not(.note-empty) {
    .affine-embed-linked-doc-content-note.render {
      display: block;
    }

    .affine-embed-linked-doc-content-note.default {
      display: none;
    }
  }

  .affine-embed-linked-doc-block:not(.loading):not(.banner-empty) {
    .affine-embed-linked-doc-banner.default {
      display: none;
    }
  }

  .affine-embed-linked-doc-block:not(.loading):not(.deleted):not(.error):not(
      .empty
    ).banner-empty {
    .affine-embed-linked-doc-content {
      width: 100%;
      height: 100%;
    }

    .affine-embed-linked-doc-banner.default {
      display: none;
    }
  }
  .affine-embed-linked-doc-block:not(.loading).error,
  .affine-embed-linked-doc-block:not(.loading).deleted {
    background: var(--affine-background-secondary-color);

    .affine-embed-linked-doc-content-note.render {
      display: none;
    }
    .affine-embed-linked-doc-content-note.default {
      display: block;
    }

    .affine-embed-linked-doc-content-date {
      display: none;
    }

    .affine-embed-linked-doc-banner.default {
      display: block;
    }
  }
  .affine-embed-linked-doc-block.horizontalThin {
    .affine-embed-linked-doc-banner {
      height: 66px;
    }

    .affine-embed-linked-doc-banner img,
    .affine-embed-linked-doc-banner object,
    .affine-embed-linked-doc-banner svg {
      height: 66px;
    }

    .affine-embed-linked-doc-content {
      gap: 12px;
    }
  }
  .affine-embed-linked-doc-block.list {
    .affine-embed-linked-doc-content {
      width: 100%;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }

    .affine-embed-linked-doc-content-title {
      width: calc(100% - 204px);
    }

    .affine-embed-linked-doc-content-note {
      display: none !important;
    }

    .affine-embed-linked-doc-content-date {
      width: 204px;
      justify-content: flex-end;
    }

    .affine-embed-linked-doc-banner {
      display: none !important;
    }
  }
  .affine-embed-linked-doc-block.vertical {
    flex-direction: column-reverse;

    .affine-embed-linked-doc-content {
      width: 100%;
    }

    .affine-embed-linked-doc-banner {
      width: 340px;
      height: 170px;
      margin-left: 12px;
    }
    .affine-embed-linked-doc-banner img,
    .affine-embed-linked-doc-banner object,
    .affine-embed-linked-doc-banner svg {
      width: 340px;
      height: 170px;
    }
  }
  .affine-embed-linked-doc-block.vertical:not(.loading):not(.deleted):not(
      .error
    ):not(.empty).banner-empty {
    .affine-embed-linked-doc-content {
      width: 100%;
      height: 100%;
    }

    .affine-embed-linked-doc-banner.default {
      display: none;
    }

    .affine-embed-linked-doc-content-note {
      -webkit-line-clamp: 16;
    }

    .affine-embed-linked-doc-content-date {
      flex-grow: unset;
      align-items: center;
    }
  }
  .affine-embed-linked-doc-block.cube {
    .affine-embed-linked-doc-content {
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
    }

    .affine-embed-linked-doc-content-title {
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
    }

    .affine-embed-linked-doc-content-title-text {
      -webkit-line-clamp: 2;
    }

    .affine-embed-linked-doc-content-note {
      display: none !important;
    }

    .affine-embed-linked-doc-banner {
      display: none !important;
    }
  }
`;

export const LinkedDocDeletedIcon = html`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M7.33331 1.5C6.32079 1.5 5.49997 2.32081 5.49997 3.33333V4.09994H2.66664C2.35368 4.09994 2.09998 4.35364 2.09998 4.6666C2.09998 4.97956 2.35368 5.23327 2.66664 5.23327H2.87251L3.41279 12.7973C3.48132 13.7567 4.27963 14.5 5.24147 14.5H10.7585C11.7203 14.5 12.5186 13.7567 12.5872 12.7973L13.1274 5.23327H13.3333C13.6463 5.23327 13.9 4.97956 13.9 4.6666C13.9 4.35364 13.6463 4.09994 13.3333 4.09994H10.5V3.33333C10.5 2.32081 9.67916 1.5 8.66664 1.5H7.33331ZM9.49997 4.09994V3.33333C9.49997 2.8731 9.12688 2.5 8.66664 2.5H7.33331C6.87307 2.5 6.49997 2.8731 6.49997 3.33333V4.09994H9.49997ZM12.1249 5.23327H3.87505L4.41025 12.726C4.4414 13.1621 4.80427 13.5 5.24147 13.5H10.7585C11.1957 13.5 11.5585 13.1621 11.5897 12.726L12.1249 5.23327ZM7.16664 7.33333C7.16664 7.05719 6.94278 6.83333 6.66664 6.83333C6.3905 6.83333 6.16664 7.05719 6.16664 7.33333V11.3333C6.16664 11.6095 6.3905 11.8333 6.66664 11.8333C6.94278 11.8333 7.16664 11.6095 7.16664 11.3333V7.33333ZM9.33331 6.83333C9.60945 6.83333 9.83331 7.05719 9.83331 7.33333V11.3333C9.83331 11.6095 9.60945 11.8333 9.33331 11.8333C9.05716 11.8333 8.83331 11.6095 8.83331 11.3333V7.33333C8.83331 7.05719 9.05716 6.83333 9.33331 6.83333Z"
    fill="#A8A8A0"
  />
</svg> `;

export const LightLinkedPageEmptySmallBanner = html`<svg
  width="204"
  height="102"
  viewBox="0 0 204 102"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_9783)">
    <g filter="url(#filter0_d_3075_9783)">
      <rect
        x="58"
        y="3"
        width="105.778"
        height="120"
        rx="4"
        transform="rotate(8 58 3)"
        fill="white"
        fill-opacity="0.1"
        shape-rendering="crispEdges"
      />
      <rect
        x="71.6174"
        y="21.071"
        width="52"
        height="7"
        rx="3"
        transform="rotate(8 71.6174 21.071)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="69.8083"
        y="33.9445"
        width="73.7781"
        height="4"
        rx="2"
        transform="rotate(8 69.8083 33.9445)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="68.4165"
        y="43.8472"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 68.4165 43.8472)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="67.0249"
        y="53.7499"
        width="73.7781"
        height="4"
        rx="2"
        transform="rotate(8 67.0249 53.7499)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="65.6331"
        y="63.6526"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 65.6331 63.6526)"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="64.2415"
        y="73.5553"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 64.2415 73.5553)"
        fill="black"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_9783"
      x="36.2993"
      y="-2"
      width="131.449"
      height="143.554"
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
      <feGaussianBlur stdDeviation="2.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9783"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_9783"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_9783">
      <rect width="204" height="102" fill="white" />
    </clipPath>
  </defs>
</svg> `;

export const DarkLinkedPageEmptySmallBanner = html`<svg
  width="204"
  height="102"
  viewBox="0 0 204 102"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_12065)">
    <g filter="url(#filter0_d_3075_12065)">
      <rect
        x="58"
        y="3"
        width="105.778"
        height="120"
        rx="4"
        transform="rotate(8 58 3)"
        fill="white"
        fill-opacity="0.1"
        shape-rendering="crispEdges"
      />
      <rect
        x="71.6175"
        y="21.071"
        width="52"
        height="7"
        rx="3"
        transform="rotate(8 71.6175 21.071)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="69.8083"
        y="33.9445"
        width="73.7781"
        height="4"
        rx="2"
        transform="rotate(8 69.8083 33.9445)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="68.4165"
        y="43.8472"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 68.4165 43.8472)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="67.0248"
        y="53.7499"
        width="73.7781"
        height="4"
        rx="2"
        transform="rotate(8 67.0248 53.7499)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="65.6331"
        y="63.6526"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 65.6331 63.6526)"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="64.2413"
        y="73.5553"
        width="39"
        height="4"
        rx="2"
        transform="rotate(8 64.2413 73.5553)"
        fill="white"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_12065"
      x="36.2992"
      y="-2"
      width="131.449"
      height="143.554"
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
      <feGaussianBlur stdDeviation="2.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_12065"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_12065"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_12065">
      <rect width="204" height="102" fill="white" />
    </clipPath>
  </defs>
</svg> `;

export const LightLinkedPageEmptyLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_10418)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="#F4F4F5"
    />
    <g filter="url(#filter0_d_3075_10418)">
      <rect
        width="268"
        height="300"
        transform="translate(36 26)"
        fill="white"
      />
      <rect
        x="77"
        y="56.3567"
        width="131.747"
        height="18"
        rx="9"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="88.3567"
        width="186.925"
        height="10"
        rx="5"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="112.357"
        width="98.8106"
        height="10"
        rx="5"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="136.357"
        width="186.925"
        height="10"
        rx="5"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="160.357"
        width="98.8106"
        height="10"
        rx="5"
        fill="black"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_10418"
      x="12"
      y="15"
      width="316"
      height="348"
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
      <feOffset dy="13" />
      <feGaussianBlur stdDeviation="12" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_10418"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_10418"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_10418">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg>`;

export const DarkLinkedPageEmptyLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_13652)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="white"
      fill-opacity="0.1"
    />
    <g filter="url(#filter0_d_3075_13652)">
      <rect
        width="268"
        height="300"
        transform="translate(36 26)"
        fill="white"
        fill-opacity="0.06"
      />
      <rect
        x="77"
        y="56.3567"
        width="131.747"
        height="18"
        rx="9"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="88.3567"
        width="186.925"
        height="10"
        rx="5"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="112.357"
        width="98.8106"
        height="10"
        rx="5"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="136.357"
        width="186.925"
        height="10"
        rx="5"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="77"
        y="160.357"
        width="98.8106"
        height="10"
        rx="5"
        fill="white"
        fill-opacity="0.1"
      />
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_13652"
      x="8"
      y="11"
      width="324"
      height="356"
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
      <feOffset dy="13" />
      <feGaussianBlur stdDeviation="14" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.44 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_13652"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_13652"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_13652">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const LightLinkedPageDeletedSmallBanner = html`<svg
  width="204"
  height="66"
  viewBox="0 0 204 66"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g filter="url(#filter0_d_3075_418)">
    <rect width="53" height="66" transform="translate(49 22)" fill="white" />
    <rect
      x="57.0168"
      y="30.8"
      width="26.0545"
      height="3.85"
      rx="1.925"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="38.5"
      width="36.9664"
      height="2.2"
      rx="1.1"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="44"
      width="19.5409"
      height="2.2"
      rx="1.1"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="49.5"
      width="36.9664"
      height="2.2"
      rx="1.1"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="55"
      width="19.5409"
      height="2.2"
      rx="1.1"
      fill="black"
      fill-opacity="0.1"
    />
  </g>
  <path
    d="M157.341 17.6783L144.153 14.3561L144.708 12.2671C145.628 8.80601 143.153 5.189 139.18 4.18818L129.588 1.77201C125.616 0.771194 121.65 2.7656 120.73 6.22672L120.175 8.31566L106.987 4.99344C103.676 4.15945 100.371 5.82152 99.6047 8.70569L98.4946 12.8836C98.188 14.0373 99.013 15.2429 100.337 15.5766L157.885 30.0735C159.209 30.4072 160.531 29.7424 160.837 28.5886L161.948 24.4108C162.714 21.5266 160.651 18.5123 157.341 17.6783ZM125.525 7.4348C125.831 6.28327 127.157 5.61692 128.478 5.9499L138.07 8.36606C139.391 8.69904 140.218 9.90752 139.912 11.059L139.357 13.148L124.97 9.52375L125.525 7.4348Z"
    fill="#E6E6E6"
  />
  <path
    d="M98.6798 34.2639C98.2253 34.2631 97.8625 34.6108 97.8834 35.0271L99.9152 75.4671C100.103 79.2098 103.451 82.1461 107.536 82.1528L146.222 82.216C150.307 82.2227 153.665 79.2973 153.866 75.5553L156.037 35.1222C156.06 34.7059 155.698 34.3571 155.243 34.3563L98.6798 34.2639ZM137.141 40.1651C137.143 38.8748 138.285 37.8316 139.693 37.8339C141.1 37.8362 142.238 38.8831 142.236 40.1734L142.183 70.5327C142.181 71.823 141.039 72.8662 139.632 72.8639C138.225 72.8616 137.086 71.8147 137.089 70.5244L137.141 40.1651ZM124.404 40.1443C124.406 38.854 125.548 37.8108 126.956 37.8131C128.363 37.8154 129.501 38.8623 129.499 40.1526L129.447 70.5119C129.444 71.8022 128.303 72.8454 126.895 72.8431C125.488 72.8408 124.349 71.7938 124.352 70.5036L124.404 40.1443ZM111.667 40.1234C111.669 38.8332 112.811 37.79 114.219 37.7923C115.626 37.7946 116.764 38.8415 116.762 40.1318L116.71 70.4911C116.707 71.7813 115.566 72.8245 114.158 72.8222C112.751 72.8199 111.613 71.773 111.615 70.4827L111.667 40.1234Z"
    fill="#E6E6E6"
  />
  <defs>
    <filter
      id="filter0_d_3075_418"
      x="46"
      y="19"
      width="59"
      height="72"
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
      <feGaussianBlur stdDeviation="1.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_418"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_418"
        result="shape"
      />
    </filter>
  </defs>
</svg> `;

export const DarkLinkedPageDeletedSmallBanner = html`<svg
  width="204"
  height="66"
  viewBox="0 0 204 66"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g filter="url(#filter0_d_3075_12843)">
    <rect
      width="53"
      height="66"
      transform="translate(49 22)"
      fill="white"
      fill-opacity="0.08"
    />
    <rect
      x="57.0168"
      y="30.8"
      width="26.0545"
      height="3.85"
      rx="1.925"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="38.5"
      width="36.9664"
      height="2.2"
      rx="1.1"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="44"
      width="19.5409"
      height="2.2"
      rx="1.1"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="49.5"
      width="36.9664"
      height="2.2"
      rx="1.1"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="57.0168"
      y="55"
      width="19.5409"
      height="2.2"
      rx="1.1"
      fill="white"
      fill-opacity="0.1"
    />
  </g>
  <path
    d="M157.341 17.6783L144.153 14.3561L144.708 12.2671C145.628 8.80601 143.153 5.189 139.18 4.18818L129.588 1.77201C125.616 0.771194 121.65 2.7656 120.73 6.22672L120.175 8.31566L106.987 4.99344C103.676 4.15945 100.371 5.82152 99.6048 8.70569L98.4946 12.8836C98.1881 14.0373 99.013 15.2429 100.337 15.5766L157.885 30.0735C159.209 30.4072 160.531 29.7424 160.837 28.5886L161.948 24.4108C162.714 21.5266 160.651 18.5123 157.341 17.6783ZM125.525 7.4348C125.831 6.28327 127.157 5.61692 128.478 5.9499L138.07 8.36606C139.391 8.69904 140.218 9.90752 139.912 11.059L139.357 13.148L124.97 9.52375L125.525 7.4348Z"
    fill="#646464"
  />
  <path
    d="M98.6798 34.2639C98.2253 34.2631 97.8625 34.6108 97.8834 35.0271L99.9152 75.4671C100.103 79.2098 103.451 82.1461 107.536 82.1528L146.222 82.216C150.307 82.2227 153.665 79.2973 153.866 75.5553L156.037 35.1222C156.06 34.7059 155.698 34.3571 155.243 34.3563L98.6798 34.2639ZM137.141 40.1651C137.143 38.8748 138.285 37.8316 139.693 37.8339C141.1 37.8362 142.238 38.8831 142.236 40.1734L142.183 70.5327C142.181 71.823 141.04 72.8662 139.632 72.8639C138.225 72.8616 137.086 71.8147 137.089 70.5244L137.141 40.1651ZM124.404 40.1443C124.406 38.854 125.548 37.8108 126.956 37.8131C128.363 37.8154 129.501 38.8623 129.499 40.1526L129.447 70.5119C129.444 71.8022 128.303 72.8454 126.895 72.8431C125.488 72.8408 124.35 71.7938 124.352 70.5036L124.404 40.1443ZM111.667 40.1234C111.669 38.8332 112.811 37.79 114.219 37.7923C115.626 37.7946 116.764 38.8415 116.762 40.1318L116.71 70.4911C116.707 71.7813 115.566 72.8245 114.158 72.8222C112.751 72.8199 111.613 71.773 111.615 70.4827L111.667 40.1234Z"
    fill="#646464"
  />
  <defs>
    <filter
      id="filter0_d_3075_12843"
      x="46"
      y="19"
      width="59"
      height="72"
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
      <feGaussianBlur stdDeviation="1.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_12843"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_12843"
        result="shape"
      />
    </filter>
  </defs>
</svg> `;

export const LightLinkedPageDeletedLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_695)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="white"
    />
    <g filter="url(#filter0_d_3075_695)">
      <rect
        width="124"
        height="154"
        transform="translate(41 61)"
        fill="white"
      />
      <rect
        x="59.7562"
        y="81.5333"
        width="60.9578"
        height="8.98333"
        rx="4.49167"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="99.5"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="112.333"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="125.167"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="138"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="black"
        fill-opacity="0.1"
      />
    </g>
    <path
      d="M296.961 47.9114L266.018 40.1164L267.32 35.215C269.478 27.0941 263.671 18.6074 254.349 16.2592L231.845 10.5901C222.524 8.2418 213.218 12.9213 211.06 21.0422L209.758 25.9436L178.815 18.1486C171.047 16.1917 163.292 20.0915 161.494 26.8587L158.889 36.6614C158.17 39.3685 160.105 42.1973 163.213 42.98L298.237 76.9947C301.344 77.7775 304.446 76.2177 305.166 73.5106L307.77 63.7079C309.568 56.9407 304.729 49.8682 296.961 47.9114ZM222.312 23.8768C223.03 21.1749 226.139 19.6115 229.241 20.3927L251.745 26.0619C254.846 26.8431 256.786 29.6786 256.068 32.3805L254.766 37.2818L221.01 28.7781L222.312 23.8768Z"
      fill="#E6E6E6"
    />
    <path
      d="M159.323 86.8265C158.256 86.8248 157.405 87.6405 157.454 88.6173L162.221 183.503C162.662 192.284 170.517 199.174 180.103 199.19L270.871 199.338C280.457 199.354 288.336 192.49 288.807 183.71L293.902 88.8403C293.955 87.8637 293.106 87.0452 292.04 87.0435L159.323 86.8265ZM249.566 100.673C249.571 97.6453 252.25 95.1976 255.552 95.203C258.854 95.2084 261.525 97.6648 261.52 100.692L261.397 171.925C261.391 174.952 258.712 177.4 255.41 177.395C252.108 177.389 249.437 174.933 249.443 171.906L249.566 100.673ZM219.68 100.624C219.686 97.5965 222.365 95.1488 225.667 95.1542C228.969 95.1596 231.64 97.616 231.635 100.643L231.512 171.876C231.506 174.904 228.827 177.351 225.525 177.346C222.223 177.341 219.552 174.884 219.557 171.857L219.68 100.624ZM189.795 100.575C189.801 97.5476 192.48 95.0999 195.782 95.1053C199.084 95.1107 201.755 97.5671 201.749 100.595L201.626 171.827C201.621 174.855 198.942 177.302 195.64 177.297C192.338 177.292 189.667 174.835 189.672 171.808L189.795 100.575Z"
      fill="#E6E6E6"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_3075_695"
      x="27"
      y="51"
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
        result="effect1_dropShadow_3075_695"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_695"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_695">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const DarkLinkedPageDeletedLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_10008)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="#141414"
    />
    <g filter="url(#filter0_d_3075_10008)">
      <rect
        width="124"
        height="154"
        transform="translate(41 61)"
        fill="white"
        fill-opacity="0.06"
      />
      <rect
        x="59.7562"
        y="81.5333"
        width="60.9578"
        height="8.98333"
        rx="4.49167"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="99.5"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="112.333"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="125.167"
        width="86.4875"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="59.7562"
        y="138"
        width="45.7183"
        height="5.13333"
        rx="2.56667"
        fill="white"
        fill-opacity="0.1"
      />
    </g>
    <path
      d="M296.961 47.9114L266.018 40.1164L267.32 35.215C269.478 27.0941 263.671 18.6074 254.349 16.2592L231.845 10.5901C222.524 8.2418 213.218 12.9213 211.06 21.0422L209.758 25.9436L178.815 18.1486C171.047 16.1917 163.292 20.0915 161.494 26.8587L158.889 36.6614C158.17 39.3685 160.105 42.1973 163.213 42.98L298.237 76.9947C301.344 77.7775 304.446 76.2177 305.166 73.5106L307.77 63.7079C309.568 56.9407 304.729 49.8682 296.961 47.9114ZM222.312 23.8768C223.03 21.1749 226.139 19.6115 229.241 20.3927L251.745 26.0619C254.846 26.8431 256.786 29.6786 256.068 32.3805L254.766 37.2818L221.01 28.7781L222.312 23.8768Z"
      fill="#313131"
    />
    <path
      d="M159.323 86.8265C158.256 86.8248 157.405 87.6405 157.454 88.6173L162.221 183.503C162.662 192.284 170.517 199.174 180.103 199.19L270.871 199.338C280.457 199.354 288.336 192.49 288.807 183.71L293.902 88.8403C293.955 87.8637 293.106 87.0452 292.04 87.0435L159.323 86.8265ZM249.566 100.673C249.571 97.6453 252.25 95.1976 255.552 95.203C258.854 95.2084 261.525 97.6648 261.52 100.692L261.397 171.925C261.391 174.952 258.712 177.4 255.41 177.395C252.108 177.389 249.437 174.933 249.443 171.906L249.566 100.673ZM219.68 100.624C219.686 97.5965 222.365 95.1488 225.667 95.1542C228.969 95.1596 231.64 97.616 231.635 100.643L231.512 171.876C231.506 174.904 228.827 177.351 225.525 177.346C222.223 177.341 219.552 174.884 219.557 171.857L219.68 100.624ZM189.795 100.575C189.801 97.5476 192.48 95.0999 195.782 95.1053C199.084 95.1107 201.755 97.5671 201.749 100.595L201.626 171.827C201.621 174.855 198.942 177.302 195.64 177.297C192.338 177.292 189.667 174.835 189.672 171.808L189.795 100.575Z"
      fill="#313131"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_3075_10008"
      x="17"
      y="41"
      width="172"
      height="202"
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
      <feGaussianBlur stdDeviation="12" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_10008"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_10008"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_10008">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const LightLinkedEdgelessEmptySmallBanner = html`<svg
  width="204"
  height="102"
  viewBox="0 0 204 102"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_9806)">
    <g filter="url(#filter0_d_3075_9806)">
      <g clip-path="url(#clip1_3075_9806)">
        <rect
          x="46"
          y="5"
          width="125.328"
          height="85.42"
          rx="4"
          transform="rotate(8 46 5)"
          fill="white"
          fill-opacity="0.1"
          shape-rendering="crispEdges"
        />
        <rect
          x="58.1663"
          y="19.0759"
          width="43.8649"
          height="32.392"
          rx="4"
          transform="rotate(8 58.1663 19.0759)"
          fill="#EEEEEE"
        />
        <rect
          x="110.528"
          y="62.3364"
          width="43.8649"
          height="21.7263"
          rx="4"
          transform="rotate(8 110.528 62.3364)"
          fill="#EEEEEE"
        />
        <rect
          x="54.2542"
          y="62.8047"
          width="41.6532"
          height="4.74028"
          rx="2.37014"
          transform="rotate(8 54.2542 62.8047)"
          fill="black"
          fill-opacity="0.1"
        />
        <rect
          x="52.9346"
          y="72.1931"
          width="29.8576"
          height="4.74028"
          rx="2.37014"
          transform="rotate(8 52.9346 72.1931)"
          fill="black"
          fill-opacity="0.1"
        />
        <path
          d="M102.665 41.4729C102.118 41.396 101.612 41.7771 101.536 42.324C101.459 42.8709 101.84 43.3765 102.387 43.4534L102.665 41.4729ZM105.394 43.876C105.941 43.9529 106.447 43.5719 106.523 43.025C106.6 42.478 106.219 41.9724 105.672 41.8955L105.394 43.876ZM111.687 42.7408C111.14 42.6639 110.634 43.045 110.557 43.5919C110.481 44.1388 110.862 44.6445 111.409 44.7213L111.687 42.7408ZM117.423 45.5666C117.97 45.6435 118.476 45.2625 118.553 44.7155C118.629 44.1686 118.248 43.663 117.702 43.5861L117.423 45.5666ZM123.716 44.4314C123.169 44.3545 122.664 44.7356 122.587 45.2825C122.51 45.8294 122.891 46.3351 123.438 46.4119L123.716 44.4314ZM129.077 47.7514C129.553 48.0319 130.166 47.8737 130.446 47.3979C130.727 46.9222 130.569 46.3091 130.093 46.0286L129.077 47.7514ZM134.305 51.618C134.166 51.0834 133.621 50.7622 133.086 50.9007C132.551 51.0392 132.23 51.5849 132.369 52.1195L134.305 51.618ZM132.272 56.7004C132.195 57.2473 132.576 57.753 133.123 57.8298C133.67 57.9067 134.176 57.5256 134.252 56.9787L132.272 56.7004ZM133.747 60.5748C133.824 60.0279 133.443 59.5222 132.896 59.4453C132.349 59.3685 131.843 59.7495 131.766 60.2964L133.747 60.5748ZM102.387 43.4534L105.394 43.876L105.672 41.8955L102.665 41.4729L102.387 43.4534ZM111.409 44.7213L117.423 45.5666L117.702 43.5861L111.687 42.7408L111.409 44.7213ZM123.438 46.4119L126.445 46.8346L126.723 44.854L123.716 44.4314L123.438 46.4119ZM126.445 46.8346C127.406 46.9696 128.293 47.2891 129.077 47.7514L130.093 46.0286C129.086 45.4351 127.949 45.0263 126.723 44.854L126.445 46.8346ZM132.369 52.1195C132.597 53.0007 132.66 53.9414 132.525 54.9024L134.505 55.1807C134.677 53.9549 134.598 52.7492 134.305 51.618L132.369 52.1195ZM132.525 54.9024L132.272 56.7004L134.252 56.9787L134.505 55.1807L132.525 54.9024ZM131.766 60.2964L131.514 62.0945L133.494 62.3728L133.747 60.5748L131.766 60.2964Z"
          fill="black"
          fill-opacity="0.3"
        />
        <path
          d="M136.622 38.7233C145.813 33.9965 156.074 29.1384 149.749 37.1115C143.424 45.0846 137.142 57.4286 151.255 49.3745"
          stroke="black"
          stroke-opacity="0.3"
          stroke-width="1.90521"
          stroke-linecap="round"
        />
      </g>
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_9806"
      x="29.1118"
      y="0"
      width="145.997"
      height="112.031"
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
      <feGaussianBlur stdDeviation="2.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9806"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_9806"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_9806">
      <rect width="204" height="102" fill="white" />
    </clipPath>
    <clipPath id="clip1_3075_9806">
      <rect
        x="46"
        y="5"
        width="125.328"
        height="85.42"
        rx="4"
        transform="rotate(8 46 5)"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const DarkLinkedEdgelessEmptySmallBanner = html`<svg
  width="204"
  height="102"
  viewBox="0 0 204 102"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_9829)">
    <g filter="url(#filter0_d_3075_9829)">
      <g clip-path="url(#clip1_3075_9829)">
        <rect
          x="46"
          y="5"
          width="125.328"
          height="85.42"
          rx="4"
          transform="rotate(8 46 5)"
          fill="white"
          fill-opacity="0.1"
          shape-rendering="crispEdges"
        />
        <rect
          x="58.1662"
          y="19.0759"
          width="43.8649"
          height="32.392"
          rx="4"
          transform="rotate(8 58.1662 19.0759)"
          fill="#303030"
        />
        <rect
          x="110.528"
          y="62.3364"
          width="43.8649"
          height="21.7263"
          rx="4"
          transform="rotate(8 110.528 62.3364)"
          fill="#303030"
        />
        <rect
          x="54.2541"
          y="62.8047"
          width="41.6532"
          height="4.74028"
          rx="2.37014"
          transform="rotate(8 54.2541 62.8047)"
          fill="white"
          fill-opacity="0.1"
        />
        <rect
          x="52.9347"
          y="72.1931"
          width="29.8576"
          height="4.74028"
          rx="2.37014"
          transform="rotate(8 52.9347 72.1931)"
          fill="white"
          fill-opacity="0.1"
        />
        <path
          d="M102.665 41.4729C102.118 41.396 101.613 41.7771 101.536 42.324C101.459 42.8709 101.84 43.3765 102.387 43.4534L102.665 41.4729ZM105.394 43.876C105.941 43.9529 106.447 43.5719 106.524 43.025C106.6 42.478 106.219 41.9724 105.672 41.8955L105.394 43.876ZM111.687 42.7408C111.14 42.6639 110.634 43.045 110.558 43.5919C110.481 44.1388 110.862 44.6445 111.409 44.7213L111.687 42.7408ZM117.423 45.5666C117.97 45.6435 118.476 45.2625 118.553 44.7155C118.63 44.1686 118.248 43.663 117.702 43.5861L117.423 45.5666ZM123.716 44.4314C123.169 44.3545 122.664 44.7356 122.587 45.2825C122.51 45.8294 122.891 46.3351 123.438 46.4119L123.716 44.4314ZM129.077 47.7514C129.553 48.0319 130.166 47.8737 130.446 47.3979C130.727 46.9222 130.569 46.3091 130.093 46.0286L129.077 47.7514ZM134.305 51.618C134.166 51.0834 133.621 50.7622 133.086 50.9007C132.551 51.0392 132.23 51.5849 132.369 52.1195L134.305 51.618ZM132.272 56.7004C132.195 57.2473 132.576 57.753 133.123 57.8298C133.67 57.9067 134.176 57.5256 134.252 56.9787L132.272 56.7004ZM133.747 60.5748C133.824 60.0279 133.443 59.5222 132.896 59.4453C132.349 59.3685 131.843 59.7495 131.767 60.2964L133.747 60.5748ZM102.387 43.4534L105.394 43.876L105.672 41.8955L102.665 41.4729L102.387 43.4534ZM111.409 44.7213L117.423 45.5666L117.702 43.5861L111.687 42.7408L111.409 44.7213ZM123.438 46.4119L126.445 46.8346L126.723 44.854L123.716 44.4314L123.438 46.4119ZM126.445 46.8346C127.406 46.9696 128.293 47.2891 129.077 47.7514L130.093 46.0286C129.086 45.4351 127.949 45.0263 126.723 44.854L126.445 46.8346ZM132.369 52.1195C132.597 53.0007 132.66 53.9414 132.525 54.9024L134.505 55.1807C134.677 53.9549 134.598 52.7492 134.305 51.618L132.369 52.1195ZM132.525 54.9024L132.272 56.7004L134.252 56.9787L134.505 55.1807L132.525 54.9024ZM131.767 60.2964L131.514 62.0945L133.494 62.3728L133.747 60.5748L131.767 60.2964Z"
          fill="white"
          fill-opacity="0.3"
        />
        <path
          d="M136.622 38.7233C145.813 33.9965 156.074 29.1384 149.749 37.1115C143.424 45.0846 137.142 57.4286 151.254 49.3745"
          stroke="white"
          stroke-opacity="0.3"
          stroke-width="1.90521"
          stroke-linecap="round"
        />
      </g>
    </g>
  </g>
  <defs>
    <filter
      id="filter0_d_3075_9829"
      x="29.1118"
      y="0"
      width="145.997"
      height="112.031"
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
      <feGaussianBlur stdDeviation="2.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.17 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9829"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_9829"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_9829">
      <rect width="204" height="102" fill="white" />
    </clipPath>
    <clipPath id="clip1_3075_9829">
      <rect
        x="46"
        y="5"
        width="125.328"
        height="85.42"
        rx="4"
        transform="rotate(8 46 5)"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const LightLinkedEdgelessEmptyLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_9936)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="white"
      fill-opacity="0.1"
    />
    <g filter="url(#filter0_dd_3075_9936)">
      <rect x="32" y="19.3782" width="119" height="78" rx="8" fill="#EEEEEE" />
    </g>
    <g filter="url(#filter1_dd_3075_9936)">
      <rect x="189" y="102.378" width="119" height="54" rx="8" fill="#EEEEEE" />
    </g>
    <rect
      x="35.999"
      y="120.552"
      width="113"
      height="11"
      rx="5.5"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="35.999"
      y="145.378"
      width="81"
      height="11"
      rx="5.5"
      fill="black"
      fill-opacity="0.1"
    />
    <path
      d="M160 57.1802C159.172 57.1802 158.5 57.8517 158.5 58.6802C158.5 59.5086 159.172 60.1802 160 60.1802V57.1802ZM164.75 60.1802C165.578 60.1802 166.25 59.5086 166.25 58.6802C166.25 57.8517 165.578 57.1802 164.75 57.1802V60.1802ZM174.25 57.1802C173.422 57.1802 172.75 57.8517 172.75 58.6802C172.75 59.5086 173.422 60.1802 174.25 60.1802V57.1802ZM183.75 60.1802C184.578 60.1802 185.25 59.5086 185.25 58.6802C185.25 57.8517 184.578 57.1802 183.75 57.1802V60.1802ZM193.25 57.1802C192.422 57.1802 191.75 57.8517 191.75 58.6802C191.75 59.5086 192.422 60.1802 193.25 60.1802V57.1802ZM202.75 60.1802C203.578 60.1802 204.25 59.5086 204.25 58.6802C204.25 57.8517 203.578 57.1802 202.75 57.1802V60.1802ZM212.25 57.1802C211.422 57.1802 210.75 57.8517 210.75 58.6802C210.75 59.5086 211.422 60.1802 212.25 60.1802V57.1802ZM221.75 60.1802C222.578 60.1802 223.25 59.5086 223.25 58.6802C223.25 57.8517 222.578 57.1802 221.75 57.1802V60.1802ZM231.25 57.1802C230.422 57.1802 229.75 57.8517 229.75 58.6802C229.75 59.5086 230.422 60.1802 231.25 60.1802V57.1802ZM240.019 60.9763C240.784 61.2937 241.662 60.9306 241.979 60.1653C242.296 59.4001 241.933 58.5225 241.168 58.2052L240.019 60.9763ZM248.475 65.5121C248.158 64.7469 247.28 64.3838 246.515 64.7011C245.75 65.0185 245.387 65.8961 245.704 66.6613L248.475 65.5121ZM246.5 78.1288C246.5 78.9572 247.172 79.6288 248 79.6288C248.828 79.6288 249.5 78.9572 249.5 78.1288H246.5ZM249.5 93.0259C249.5 92.1975 248.828 91.5259 248 91.5259C247.172 91.5259 246.5 92.1975 246.5 93.0259H249.5ZM160 60.1802H164.75V57.1802H160V60.1802ZM174.25 60.1802H183.75V57.1802H174.25V60.1802ZM193.25 60.1802H202.75V57.1802H193.25V60.1802ZM212.25 60.1802H221.75V57.1802H212.25V60.1802ZM231.25 60.1802H236V57.1802H231.25V60.1802ZM236 60.1802C237.426 60.1802 238.783 60.4638 240.019 60.9763L241.168 58.2052C239.574 57.5442 237.828 57.1802 236 57.1802V60.1802ZM245.704 66.6613C246.216 67.8973 246.5 69.2537 246.5 70.6802H249.5C249.5 68.8525 249.136 67.106 248.475 65.5121L245.704 66.6613ZM246.5 70.6802V78.1288H249.5V70.6802H246.5ZM246.5 93.0259V100.475H249.5V93.0259H246.5Z"
      fill="black"
      fill-opacity="0.3"
    />
    <path
      d="M250.185 35.7596C273.092 19.591 298.824 2.66568 284.842 26.4733C270.86 50.2808 258.644 85.8144 293.517 58.8491"
      stroke="black"
      stroke-opacity="0.3"
      stroke-width="3"
      stroke-linecap="round"
    />
  </g>
  <path
    d="M0.5 4C0.5 2.067 2.067 0.5 4 0.5H336C337.933 0.5 339.5 2.067 339.5 4V169.5H0.5V4Z"
    stroke="#E3E2E4"
  />
  <defs>
    <filter
      id="filter0_dd_3075_9936"
      x="22"
      y="19.3782"
      width="139"
      height="98"
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
      <feMorphology
        radius="3"
        operator="erode"
        in="SourceAlpha"
        result="effect1_dropShadow_3075_9936"
      />
      <feOffset dy="4" />
      <feGaussianBlur stdDeviation="3" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9936"
      />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feMorphology
        radius="2"
        operator="erode"
        in="SourceAlpha"
        result="effect2_dropShadow_3075_9936"
      />
      <feOffset dy="10" />
      <feGaussianBlur stdDeviation="6" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="effect1_dropShadow_3075_9936"
        result="effect2_dropShadow_3075_9936"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect2_dropShadow_3075_9936"
        result="shape"
      />
    </filter>
    <filter
      id="filter1_dd_3075_9936"
      x="179"
      y="102.378"
      width="139"
      height="74"
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
      <feMorphology
        radius="3"
        operator="erode"
        in="SourceAlpha"
        result="effect1_dropShadow_3075_9936"
      />
      <feOffset dy="4" />
      <feGaussianBlur stdDeviation="3" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9936"
      />
      <feColorMatrix
        in="SourceAlpha"
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
        result="hardAlpha"
      />
      <feMorphology
        radius="2"
        operator="erode"
        in="SourceAlpha"
        result="effect2_dropShadow_3075_9936"
      />
      <feOffset dy="10" />
      <feGaussianBlur stdDeviation="6" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.1 0"
      />
      <feBlend
        mode="normal"
        in2="effect1_dropShadow_3075_9936"
        result="effect2_dropShadow_3075_9936"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect2_dropShadow_3075_9936"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_9936">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const DarkLinkedEdgelessEmptyLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    d="M0.5 4C0.5 2.067 2.067 0.5 4 0.5H336C337.933 0.5 339.5 2.067 339.5 4V169.5H0.5V4Z"
    fill="#141414"
  />
  <path
    d="M0.5 4C0.5 2.067 2.067 0.5 4 0.5H336C337.933 0.5 339.5 2.067 339.5 4V169.5H0.5V4Z"
    stroke="#2E2E2E"
  />
  <rect x="32" y="19.3782" width="119" height="78" rx="8" fill="#303030" />
  <rect x="189" y="102.378" width="119" height="54" rx="8" fill="#303030" />
  <rect
    x="35.999"
    y="120.552"
    width="113"
    height="11"
    rx="5.5"
    fill="white"
    fill-opacity="0.1"
  />
  <rect
    x="35.999"
    y="145.378"
    width="81"
    height="11"
    rx="5.5"
    fill="white"
    fill-opacity="0.1"
  />
  <path
    d="M160 57.1802C159.172 57.1802 158.5 57.8517 158.5 58.6802C158.5 59.5086 159.172 60.1802 160 60.1802V57.1802ZM164.75 60.1802C165.578 60.1802 166.25 59.5086 166.25 58.6802C166.25 57.8517 165.578 57.1802 164.75 57.1802V60.1802ZM174.25 57.1802C173.422 57.1802 172.75 57.8517 172.75 58.6802C172.75 59.5086 173.422 60.1802 174.25 60.1802V57.1802ZM183.75 60.1802C184.578 60.1802 185.25 59.5086 185.25 58.6802C185.25 57.8517 184.578 57.1802 183.75 57.1802V60.1802ZM193.25 57.1802C192.422 57.1802 191.75 57.8517 191.75 58.6802C191.75 59.5086 192.422 60.1802 193.25 60.1802V57.1802ZM202.75 60.1802C203.578 60.1802 204.25 59.5086 204.25 58.6802C204.25 57.8517 203.578 57.1802 202.75 57.1802V60.1802ZM212.25 57.1802C211.422 57.1802 210.75 57.8517 210.75 58.6802C210.75 59.5086 211.422 60.1802 212.25 60.1802V57.1802ZM221.75 60.1802C222.578 60.1802 223.25 59.5086 223.25 58.6802C223.25 57.8517 222.578 57.1802 221.75 57.1802V60.1802ZM231.25 57.1802C230.422 57.1802 229.75 57.8517 229.75 58.6802C229.75 59.5086 230.422 60.1802 231.25 60.1802V57.1802ZM240.019 60.9763C240.784 61.2937 241.662 60.9306 241.979 60.1653C242.296 59.4001 241.933 58.5225 241.168 58.2052L240.019 60.9763ZM248.475 65.5121C248.158 64.7469 247.28 64.3838 246.515 64.7011C245.75 65.0185 245.387 65.8961 245.704 66.6613L248.475 65.5121ZM246.5 78.1288C246.5 78.9572 247.172 79.6288 248 79.6288C248.828 79.6288 249.5 78.9572 249.5 78.1288H246.5ZM249.5 93.0259C249.5 92.1975 248.828 91.5259 248 91.5259C247.172 91.5259 246.5 92.1975 246.5 93.0259H249.5ZM160 60.1802H164.75V57.1802H160V60.1802ZM174.25 60.1802H183.75V57.1802H174.25V60.1802ZM193.25 60.1802H202.75V57.1802H193.25V60.1802ZM212.25 60.1802H221.75V57.1802H212.25V60.1802ZM231.25 60.1802H236V57.1802H231.25V60.1802ZM236 60.1802C237.426 60.1802 238.783 60.4638 240.019 60.9763L241.168 58.2052C239.574 57.5442 237.828 57.1802 236 57.1802V60.1802ZM245.704 66.6613C246.216 67.8973 246.5 69.2537 246.5 70.6802H249.5C249.5 68.8525 249.136 67.106 248.475 65.5121L245.704 66.6613ZM246.5 70.6802V78.1288H249.5V70.6802H246.5ZM246.5 93.0259V100.475H249.5V93.0259H246.5Z"
    fill="white"
    fill-opacity="0.3"
  />
  <path
    d="M250.185 35.7596C273.092 19.591 298.824 2.66568 284.842 26.4733C270.86 50.2808 258.644 85.8144 293.517 58.8491"
    stroke="white"
    stroke-opacity="0.3"
    stroke-width="3"
    stroke-linecap="round"
  />
</svg> `;

export const LightLinkedEdgelessDeletedSmallBanner = html`<svg
  width="204"
  height="66"
  viewBox="0 0 204 66"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g filter="url(#filter0_d_3075_9990)">
    <rect
      x="35.446"
      y="22.3057"
      width="66"
      height="44.9836"
      rx="2"
      fill="white"
    />
    <rect
      x="42.8223"
      y="28.7544"
      width="23.1"
      height="17.0581"
      rx="2"
      fill="#EAEAEA"
    />
    <rect
      x="73.2991"
      y="47.4768"
      width="23.1"
      height="11.4414"
      rx="2"
      fill="#EAEAEA"
    />
    <rect
      x="43.9871"
      y="51.8455"
      width="21.9353"
      height="2.49631"
      rx="1.24816"
      fill="black"
      fill-opacity="0.1"
    />
    <rect
      x="43.9871"
      y="56.8379"
      width="15.7235"
      height="2.49631"
      rx="1.24816"
      fill="black"
      fill-opacity="0.1"
    />
    <path
      d="M67.6697 37.6997H80.752C82.9612 37.6997 84.752 39.4906 84.752 41.6997V45.8127"
      stroke="black"
      stroke-opacity="0.3"
      stroke-linecap="round"
      stroke-dasharray="4 4"
    />
    <path
      d="M85.1761 33.2503C89.6228 30.1117 94.6178 26.8262 91.9036 31.4477C89.1895 36.0691 86.8182 42.9668 93.5876 37.7324"
      stroke="black"
      stroke-opacity="0.3"
      stroke-linecap="round"
    />
  </g>
  <path
    d="M157.341 17.6782L144.153 14.356L144.708 12.267C145.628 8.80589 143.153 5.18888 139.18 4.18806L129.588 1.77189C125.616 0.771072 121.65 2.76548 120.73 6.2266L120.175 8.31554L106.987 4.99332C103.676 4.15932 100.371 5.82139 99.6047 8.70557L98.4946 12.8835C98.188 14.0372 99.013 15.2428 100.337 15.5764L157.885 30.0734C159.209 30.407 160.531 29.7423 160.837 28.5885L161.948 24.4106C162.714 21.5265 160.651 18.5122 157.341 17.6782ZM125.525 7.43468C125.831 6.28315 127.157 5.6168 128.478 5.94978L138.07 8.36594C139.391 8.69892 140.218 9.9074 139.912 11.0589L139.357 13.1479L124.97 9.52362L125.525 7.43468Z"
    fill="#E6E6E6"
  />
  <path
    d="M98.6798 34.2638C98.2253 34.263 97.8625 34.6107 97.8834 35.027L99.9152 75.467C100.103 79.2096 103.451 82.146 107.536 82.1526L146.222 82.2159C150.307 82.2226 153.665 79.2972 153.866 75.5551L156.037 35.122C156.06 34.7058 155.698 34.3569 155.243 34.3562L98.6798 34.2638ZM137.141 40.165C137.143 38.8747 138.285 37.8315 139.693 37.8338C141.1 37.8361 142.238 38.883 142.236 40.1733L142.183 70.5326C142.181 71.8229 141.039 72.8661 139.632 72.8638C138.225 72.8615 137.086 71.8145 137.089 70.5243L137.141 40.165ZM124.404 40.1441C124.406 38.8539 125.548 37.8107 126.956 37.813C128.363 37.8153 129.501 38.8622 129.499 40.1525L129.447 70.5118C129.444 71.802 128.303 72.8452 126.895 72.8429C125.488 72.8406 124.349 71.7937 124.352 70.5034L124.404 40.1441ZM111.667 40.1233C111.669 38.8331 112.811 37.7899 114.219 37.7922C115.626 37.7945 116.764 38.8414 116.762 40.1317L116.71 70.491C116.707 71.7812 115.566 72.8244 114.158 72.8221C112.751 72.8198 111.613 71.7729 111.615 70.4826L111.667 40.1233Z"
    fill="#E6E6E6"
  />
  <defs>
    <filter
      id="filter0_d_3075_9990"
      x="32.446"
      y="19.3057"
      width="72"
      height="50.9836"
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
      <feGaussianBlur stdDeviation="1.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_9990"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_9990"
        result="shape"
      />
    </filter>
  </defs>
</svg> `;

export const DarkLinkedEdgelessDeletedSmallBanner = html`<svg
  width="204"
  height="66"
  viewBox="0 0 204 66"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g filter="url(#filter0_d_3075_2681)">
    <rect
      x="35.446"
      y="22.3057"
      width="66"
      height="44.9836"
      rx="2"
      fill="white"
      fill-opacity="0.08"
      shape-rendering="crispEdges"
    />
    <rect
      x="42.8223"
      y="28.7544"
      width="23.1"
      height="17.0581"
      rx="2"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="73.299"
      y="47.4768"
      width="23.1"
      height="11.4414"
      rx="2"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="43.987"
      y="51.8455"
      width="21.9353"
      height="2.49631"
      rx="1.24816"
      fill="white"
      fill-opacity="0.1"
    />
    <rect
      x="43.987"
      y="56.8379"
      width="15.7235"
      height="2.49631"
      rx="1.24816"
      fill="white"
      fill-opacity="0.1"
    />
    <path
      d="M67.6696 37.6997H80.7519C82.9611 37.6997 84.7519 39.4906 84.7519 41.6997V45.8127"
      stroke="white"
      stroke-opacity="0.3"
      stroke-linecap="round"
      stroke-dasharray="4 4"
    />
    <path
      d="M85.1761 33.2503C89.6228 30.1117 94.6177 26.8262 91.9036 31.4477C89.1895 36.0691 86.8182 42.9668 93.5876 37.7324"
      stroke="white"
      stroke-opacity="0.3"
      stroke-linecap="round"
    />
  </g>
  <path
    d="M157.341 17.6782L144.153 14.356L144.708 12.267C145.628 8.80589 143.153 5.18888 139.18 4.18806L129.588 1.77189C125.616 0.771072 121.65 2.76548 120.73 6.2266L120.175 8.31554L106.987 4.99332C103.676 4.15932 100.371 5.82139 99.6047 8.70557L98.4946 12.8835C98.188 14.0372 99.013 15.2428 100.337 15.5764L157.885 30.0734C159.209 30.407 160.531 29.7423 160.837 28.5885L161.948 24.4106C162.714 21.5265 160.651 18.5122 157.341 17.6782ZM125.525 7.43468C125.831 6.28315 127.157 5.6168 128.478 5.94978L138.07 8.36594C139.391 8.69892 140.218 9.9074 139.912 11.0589L139.357 13.1479L124.97 9.52362L125.525 7.43468Z"
    fill="#646464"
  />
  <path
    d="M98.6798 34.2638C98.2253 34.263 97.8625 34.6107 97.8834 35.027L99.9152 75.467C100.103 79.2096 103.451 82.146 107.536 82.1526L146.222 82.2159C150.307 82.2226 153.665 79.2972 153.866 75.5551L156.037 35.122C156.06 34.7058 155.698 34.3569 155.243 34.3562L98.6798 34.2638ZM137.141 40.165C137.143 38.8747 138.285 37.8315 139.693 37.8338C141.1 37.8361 142.238 38.883 142.236 40.1733L142.183 70.5326C142.181 71.8229 141.039 72.8661 139.632 72.8638C138.225 72.8615 137.086 71.8145 137.089 70.5243L137.141 40.165ZM124.404 40.1441C124.406 38.8539 125.548 37.8107 126.956 37.813C128.363 37.8153 129.501 38.8622 129.499 40.1525L129.447 70.5118C129.444 71.802 128.303 72.8452 126.895 72.8429C125.488 72.8406 124.349 71.7937 124.352 70.5034L124.404 40.1441ZM111.667 40.1233C111.669 38.8331 112.811 37.7899 114.219 37.7922C115.626 37.7945 116.764 38.8414 116.762 40.1317L116.71 70.491C116.707 71.7812 115.566 72.8244 114.158 72.8221C112.751 72.8198 111.613 71.7729 111.615 70.4826L111.667 40.1233Z"
    fill="#646464"
  />
  <defs>
    <filter
      id="filter0_d_3075_2681"
      x="32.446"
      y="19.3057"
      width="72"
      height="50.9836"
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
      <feGaussianBlur stdDeviation="1.5" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_2681"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_2681"
        result="shape"
      />
    </filter>
  </defs>
</svg> `;

export const LightLinkedEdgelessDeletedLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_10039)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="white"
    />
    <g filter="url(#filter0_d_3075_10039)">
      <path
        d="M30 71C30 68.7909 31.7909 67 34 67H175C177.209 67 179 68.7909 179 71V170H30V71Z"
        fill="white"
      />
      <rect
        x="46.6523"
        y="81.7659"
        width="52.15"
        height="39.0585"
        rx="4"
        fill="#EEEEEE"
      />
      <rect x="115" y="125" width="53" height="30" rx="4" fill="#EEEEEE" />
      <rect
        x="49.282"
        y="134.638"
        width="49.5206"
        height="5.71587"
        rx="2.85793"
        fill="black"
        fill-opacity="0.1"
      />
      <rect
        x="49.282"
        y="146.07"
        width="35.4971"
        height="5.71587"
        rx="2.85793"
        fill="black"
        fill-opacity="0.1"
      />
      <path
        d="M102.747 102.248H135.312C138.625 102.248 141.312 104.934 141.312 108.248V120.824"
        stroke="black"
        stroke-opacity="0.3"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="bevel"
        stroke-dasharray="5 5"
      />
      <path
        d="M142.269 92.0603C152.308 84.8737 163.585 77.3509 157.457 87.9327C151.33 98.5146 145.977 114.308 161.259 102.323"
        stroke="black"
        stroke-opacity="0.3"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <path
      d="M305.571 53.002L275.744 45.4883L276.999 40.7638C279.079 32.9359 273.482 24.7555 264.497 22.492L242.805 17.0275C233.819 14.7639 224.849 19.2746 222.77 27.1025L221.514 31.8269L191.688 24.3132C184.2 22.427 176.725 26.186 174.992 32.709L172.481 42.158C171.788 44.7674 173.653 47.4941 176.649 48.2486L306.801 81.0358C309.796 81.7903 312.786 80.2868 313.479 77.6774L315.99 68.2285C317.723 61.7055 313.058 54.8882 305.571 53.002ZM233.616 29.8347C234.308 27.2304 237.304 25.7233 240.294 26.4764L261.986 31.9409C264.975 32.694 266.846 35.4272 266.153 38.0315L264.898 42.756L232.36 34.5592L233.616 29.8347Z"
      fill="#E6E6E6"
    />
    <path
      d="M172.9 90.5127C171.872 90.511 171.051 91.2973 171.099 92.2389L175.694 183.7C176.119 192.165 183.69 198.806 192.93 198.821L280.423 198.964C289.663 198.979 297.258 192.363 297.712 183.9L302.623 92.4538C302.673 91.5125 301.855 90.7235 300.827 90.7218L172.9 90.5127ZM259.886 103.859C259.891 100.941 262.473 98.5817 265.657 98.5869C268.84 98.5921 271.414 100.96 271.409 103.878L271.29 172.54C271.285 175.458 268.703 177.818 265.52 177.813C262.337 177.807 259.763 175.44 259.768 172.521L259.886 103.859ZM231.08 103.812C231.085 100.894 233.667 98.5346 236.85 98.5398C240.033 98.545 242.607 100.913 242.602 103.831L242.484 172.493C242.479 175.411 239.896 177.771 236.713 177.766C233.53 177.76 230.956 175.393 230.961 172.474L231.08 103.812ZM202.273 103.765C202.278 100.847 204.86 98.4875 208.043 98.4927C211.226 98.4979 213.801 100.866 213.796 103.784L213.677 172.446C213.672 175.364 211.09 177.724 207.907 177.718C204.723 177.713 202.149 175.345 202.154 172.427L202.273 103.765Z"
      fill="#E6E6E6"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_3075_10039"
      x="26"
      y="63"
      width="157"
      height="111"
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
      <feGaussianBlur stdDeviation="2" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0.258824 0 0 0 0 0.254902 0 0 0 0 0.286275 0 0 0 0.14 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_10039"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_10039"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_10039">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;

export const DarkLinkedEdgelessDeletedLargeBanner = html`<svg
  width="340"
  height="170"
  viewBox="0 0 340 170"
  fill="none"
  xmlns="http://www.w3.org/2000/svg"
>
  <g clip-path="url(#clip0_3075_10071)">
    <path
      d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
      fill="#141414"
    />
    <g filter="url(#filter0_d_3075_10071)">
      <path
        d="M30 71C30 68.7909 31.7909 67 34 67H175C177.209 67 179 68.7909 179 71V170H30V71Z"
        fill="white"
        fill-opacity="0.06"
        shape-rendering="crispEdges"
      />
      <rect
        x="46.6523"
        y="81.7659"
        width="52.15"
        height="39.0585"
        rx="4"
        fill="#303030"
      />
      <rect x="115" y="125" width="53" height="30" rx="4" fill="#303030" />
      <rect
        x="49.282"
        y="134.638"
        width="49.5206"
        height="5.71587"
        rx="2.85793"
        fill="white"
        fill-opacity="0.1"
      />
      <rect
        x="49.282"
        y="146.07"
        width="35.4971"
        height="5.71587"
        rx="2.85793"
        fill="white"
        fill-opacity="0.1"
      />
      <path
        d="M102.747 102.248H135.312C138.625 102.248 141.312 104.934 141.312 108.248V120.824"
        stroke="white"
        stroke-opacity="0.3"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="bevel"
        stroke-dasharray="5 5"
      />
      <path
        d="M142.269 92.0603C152.308 84.8737 163.585 77.3509 157.457 87.9327C151.33 98.5146 145.977 114.308 161.259 102.323"
        stroke="white"
        stroke-opacity="0.3"
        stroke-width="2"
        stroke-linecap="round"
      />
    </g>
    <path
      d="M305.571 53.002L275.744 45.4883L276.999 40.7638C279.079 32.9359 273.482 24.7555 264.497 22.492L242.805 17.0275C233.819 14.7639 224.849 19.2746 222.77 27.1025L221.514 31.8269L191.688 24.3132C184.2 22.427 176.725 26.186 174.992 32.709L172.481 42.158C171.788 44.7674 173.653 47.4941 176.649 48.2486L306.801 81.0358C309.796 81.7903 312.786 80.2868 313.479 77.6774L315.99 68.2285C317.723 61.7055 313.058 54.8882 305.571 53.002ZM233.616 29.8347C234.308 27.2304 237.304 25.7233 240.294 26.4764L261.986 31.9409C264.975 32.694 266.846 35.4272 266.153 38.0315L264.898 42.756L232.36 34.5592L233.616 29.8347Z"
      fill="#313131"
    />
    <path
      d="M172.9 90.5127C171.872 90.511 171.051 91.2973 171.099 92.2389L175.694 183.7C176.119 192.165 183.69 198.806 192.93 198.821L280.423 198.964C289.663 198.979 297.258 192.363 297.712 183.9L302.623 92.4538C302.673 91.5125 301.855 90.7235 300.827 90.7218L172.9 90.5127ZM259.886 103.859C259.891 100.941 262.473 98.5817 265.657 98.5869C268.84 98.5921 271.414 100.96 271.409 103.878L271.29 172.54C271.285 175.458 268.703 177.818 265.52 177.813C262.337 177.807 259.763 175.44 259.768 172.521L259.886 103.859ZM231.08 103.812C231.085 100.894 233.667 98.5346 236.85 98.5398C240.033 98.545 242.607 100.913 242.602 103.831L242.484 172.493C242.479 175.411 239.896 177.771 236.713 177.766C233.53 177.76 230.956 175.393 230.961 172.474L231.08 103.812ZM202.273 103.765C202.278 100.847 204.86 98.4875 208.043 98.4927C211.226 98.4979 213.801 100.866 213.796 103.784L213.677 172.446C213.672 175.364 211.09 177.724 207.907 177.718C204.723 177.713 202.149 175.345 202.154 172.427L202.273 103.765Z"
      fill="#313131"
    />
  </g>
  <defs>
    <filter
      id="filter0_d_3075_10071"
      x="26"
      y="63"
      width="157"
      height="111"
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
      <feGaussianBlur stdDeviation="2" />
      <feComposite in2="hardAlpha" operator="out" />
      <feColorMatrix
        type="matrix"
        values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.24 0"
      />
      <feBlend
        mode="normal"
        in2="BackgroundImageFix"
        result="effect1_dropShadow_3075_10071"
      />
      <feBlend
        mode="normal"
        in="SourceGraphic"
        in2="effect1_dropShadow_3075_10071"
        result="shape"
      />
    </filter>
    <clipPath id="clip0_3075_10071">
      <path
        d="M0 4C0 1.79086 1.79086 0 4 0H336C338.209 0 340 1.79086 340 4V170H0V4Z"
        fill="white"
      />
    </clipPath>
  </defs>
</svg> `;
