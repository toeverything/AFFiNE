import {
  type EmbedCardStyle,
  EmbedFigmaModel,
  EmbedGithubModel,
  EmbedHtmlModel,
  EmbedLinkedDocModel,
  EmbedLoomModel,
  EmbedSyncedDocModel,
  EmbedYoutubeModel,
  SYNCED_DEFAULT_WIDTH,
} from '@blocksuite/affine-model';

export const BLOCK_CHILDREN_CONTAINER_PADDING_LEFT = 24;
export const EDGELESS_BLOCK_CHILD_PADDING = 24;
export const EDGELESS_BLOCK_CHILD_BORDER_WIDTH = 2;

// The height of the header, which is used to calculate the scroll offset
// In AFFiNE, to avoid the option element to be covered by the header, we need to reserve the space for the header
export const PAGE_HEADER_HEIGHT = 53;

export const EMBED_CARD_MIN_WIDTH = 450;

export const EMBED_CARD_WIDTH: Record<EmbedCardStyle, number> = {
  horizontal: 752,
  horizontalThin: 752,
  list: 752,
  vertical: 364,
  cube: 170,
  cubeThick: 170,
  video: 752,
  figma: 752,
  html: 752,
  syncedDoc: SYNCED_DEFAULT_WIDTH,
  pdf: 537 + 24 + 2,
  citation: 752,
};

export const EMBED_CARD_HEIGHT: Record<EmbedCardStyle, number> = {
  horizontal: 116,
  horizontalThin: 80,
  list: 46,
  vertical: 390,
  cube: 114,
  cubeThick: 132,
  video: 544,
  figma: 544,
  html: 544,
  syncedDoc: 455,
  pdf: 759 + 46 + 24 + 2,
  citation: 52,
};

export const EMBED_BLOCK_FLAVOUR_LIST = [
  'affine:embed-github',
  'affine:embed-youtube',
  'affine:embed-figma',
  'affine:embed-linked-doc',
  'affine:embed-synced-doc',
  'affine:embed-html',
  'affine:embed-loom',
] as const;

export const EMBED_BLOCK_MODEL_LIST = [
  EmbedGithubModel,
  EmbedYoutubeModel,
  EmbedFigmaModel,
  EmbedLinkedDocModel,
  EmbedSyncedDocModel,
  EmbedHtmlModel,
  EmbedLoomModel,
] as const;

export const DEFAULT_IMAGE_PROXY_ENDPOINT =
  'https://affine-worker.toeverything.workers.dev/api/worker/image-proxy';

// https://github.com/toeverything/affine-workers/tree/main/packages/link-preview
export const DEFAULT_LINK_PREVIEW_ENDPOINT =
  'https://affine-worker.toeverything.workers.dev/api/worker/link-preview';

// This constant is used to ignore tags when exporting using html2canvas
export const CANVAS_EXPORT_IGNORE_TAGS = [
  'EDGELESS-TOOLBAR-WIDGET',
  'AFFINE-DRAG-HANDLE-WIDGET',
  'AFFINE-TOOLBAR-WIDGET',
  'AFFINE-BLOCK-SELECTION',
];

export * from './bracket-pairs.js';
export * from './note.js';
export * from './text.js';
