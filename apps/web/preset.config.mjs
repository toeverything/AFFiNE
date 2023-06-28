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
  enablePlugin: process.env.ENABLE_PLUGIN === 'true',
  enableAllPageFilter:
    !!process.env.VERCEL ||
    (process.env.ENABLE_ALL_PAGE_FILTER
      ? process.env.ENABLE_ALL_PAGE_FILTER === 'true'
      : false),
  enableTestProperties: process.env.ENABLE_TEST_PROPERTIES
    ? process.env.ENABLE_TEST_PROPERTIES === 'true'
    : true,
  enableLegacyCloud: process.env.ENABLE_LEGACY_PROVIDER
    ? process.env.ENABLE_LEGACY_PROVIDER === 'true'
    : true,
  enableBroadcastChannelProvider: process.env.ENABLE_BC_PROVIDER !== 'false',
  enableDebugPage: true,
  changelogUrl:
    process.env.CHANGELOG_URL ??
    'https://affine.pro/blog/what-is-new-affine-0620',
  enablePreloading: process.env.ENABLE_PRELOADING === 'true',
  enableNewSettingModal: process.env.ENABLE_NEW_SETTING_MODAL === 'true',
  enableSQLiteProvider: process.env.ENABLE_SQLITE_PROVIDER === 'true',
};
