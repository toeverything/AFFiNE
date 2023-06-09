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
  enable_bookmark_operation:
    process.env.NX_ENABLE_BOOKMARK_OPERATION === 'true',
};

/**
 * @type {import('@affine/env').BuildFlags}
 */
export const buildFlags = {
  enablePlugin: process.env.NX_ENABLE_PLUGIN === 'true',
  enableAllPageFilter: process.env.NX_ENABLE_ALL_PAGE_FILTER
    ? process.env.NX_ENABLE_ALL_PAGE_FILTER === 'true'
    : false,
  enableImagePreviewModal: process.env.NX_ENABLE_IMAGE_PREVIEW_MODAL
    ? process.env.NX_ENABLE_IMAGE_PREVIEW_MODAL === 'true'
    : true,
  enableTestProperties: process.env.NX_ENABLE_TEST_PROPERTIES
    ? process.env.NX_ENABLE_TEST_PROPERTIES === 'true'
    : true,
  enableLegacyCloud: process.env.NX_ENABLE_LEGACY_PROVIDER
    ? process.env.NX_ENABLE_LEGACY_PROVIDER === 'true'
    : true,
  enableBroadCastChannelProvider: Boolean(
    process.env.NX_ENABLE_BC_PROVIDER ?? '1'
  ),
  enableDebugPage: Boolean(
    process.env.NX_ENABLE_DEBUG_PAGE ??
      process.env.NX_NODE_ENV === 'development'
  ),
  changelogUrl:
    process.env.NX_CHANGELOG_URL ??
    'http://affine.pro/blog/whats-new-affine-0601',
  enablePreloading:
    process.env.NX_ENABLE_PRELOADING === undefined
      ? true
      : process.env.NX_ENABLE_PRELOADING === 'true',
};
