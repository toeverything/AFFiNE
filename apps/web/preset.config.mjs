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
  enable_bookmark_operation: false,
};

/**
 * @type {Record<string, import('@affine/env').BuildFlags>}
 */
const buildPreset = {
  stable: {
    enableAllPageFilter: true,
    enablePlugin: false,
    enableTestProperties: false,
    enableBroadcastChannelProvider: true,
    enableDebugPage: true,
    enableLegacyCloud: false,
    changelogUrl: 'https://affine.pro/blog/what-is-new-affine-0620',
    enablePreloading: true,
    enableNewSettingModal: false,
    enableSQLiteProvider: false,
  },
  beta: {},
  // canary will be aggressive and enable all features
  canary: {
    enableAllPageFilter: true,
    enablePlugin: true,
    enableTestProperties: true,
    enableBroadcastChannelProvider: true,
    enableDebugPage: true,
    enableLegacyCloud: false,
    changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
    enablePreloading: true,
    enableNewSettingModal: true,
    enableSQLiteProvider: true,
  },
};

// beta and internal versions are the same as stable
buildPreset.beta = buildPreset.stable;
buildPreset.canary = buildPreset.stable;

const currentBuild = process.env.BUILD_ENV || 'stable';

const currentBuildPreset = buildPreset[currentBuild];

const environmentPreset = {
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

/**
 * @type {import('@affine/env').BuildFlags}
 */
const buildFlags = {
  ...currentBuildPreset,
  // environment preset will overwrite current build preset
  // this environment variable is for debug proposes only
  // do not put them into CI
  ...environmentPreset,
};

export { buildFlags };
