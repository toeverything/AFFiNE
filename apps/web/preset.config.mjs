// @ts-check
import 'dotenv/config';
/**
 * @type {import('@affine/env').BlockSuiteFeatureFlags}
 */
export const blockSuiteFeatureFlags = {
  enable_database: true,
  enable_slash_menu: true,
  enable_edgeless_toolbar: true,
  enable_block_hub: true,
  enable_drag_handle: true,
  enable_surface: true,
  enable_linked_page: true,
  enable_bookmark_operation: process.env.ENABLE_BOOKMARK_OPERATION === 'true',
};

/**
 * @type {import('@affine/env').BuildFlags}
 */
export const buildFlags = {
  enableAllPageFilter:
    !!process.env.VERCEL ||
    (process.env.ENABLE_ALL_PAGE_FILTER
      ? process.env.ENABLE_ALL_PAGE_FILTER === 'true'
      : false),
  enableImagePreviewModal: process.env.ENABLE_IMAGE_PREVIEW_MODAL
    ? process.env.ENABLE_IMAGE_PREVIEW_MODAL === 'true'
    : true,
  enableTestProperties: process.env.ENABLE_TEST_PROPERTIES
    ? process.env.ENABLE_TEST_PROPERTIES === 'true'
    : true,
  enableLegacyCloud: process.env.ENABLE_LEGACY_PROVIDER
    ? process.env.ENABLE_LEGACY_PROVIDER === 'true'
    : true,
  enableBroadCastChannelProvider: Boolean(
    process.env.ENABLE_BC_PROVIDER ?? '1'
  ),
  enableDebugPage: Boolean(
    process.env.ENABLE_DEBUG_PAGE ?? process.env.NODE_ENV === 'development'
  ),
  changelogUrl:
    process.env.CHANGELOG_URL ??
    'https://affine.pro/blog/whats-new-affine-0518',
};
