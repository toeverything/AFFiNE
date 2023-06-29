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
    enableAllPageSaving: false,
    enablePlugin: false,
    enableTestProperties: false,
    enableBroadcastChannelProvider: true,
    enableDebugPage: true,
    enableLegacyCloud: false,
    changelogUrl: 'https://affine.pro/blog/whats-new-affine-0630',
    enablePreloading: true,
    enableNewSettingModal: false,
    enableNewSettingUnstableApi: false,
    enableSQLiteProvider: false,
  },
  beta: {},
  internal: {},
  // canary will be aggressive and enable all features
  canary: {
    enableAllPageSaving: true,
    enablePlugin: true,
    enableTestProperties: true,
    enableBroadcastChannelProvider: true,
    enableDebugPage: true,
    enableLegacyCloud: false,
    changelogUrl: 'https://affine.pro/blog/whats-new-affine-0630',
    enablePreloading: true,
    enableNewSettingModal: true,
    enableNewSettingUnstableApi: false,
    enableSQLiteProvider: false,
  },
};

// beta and internal versions are the same as stable
buildPreset.beta = buildPreset.stable;
buildPreset.internal = buildPreset.stable;

const currentBuild = process.env.BUILD_TYPE || 'stable';

if (process.env.CI && !process.env.BUILD_TYPE) {
  throw new Error('BUILD_ENV is required in CI');
}

const currentBuildPreset = buildPreset[currentBuild];

const environmentPreset = {
  enablePlugin: process.env.ENABLE_PLUGIN
    ? process.env.ENABLE_PLUGIN === 'true'
    : currentBuildPreset.enablePlugin,
  enableAllPageSaving: process.env.ENABLE_ALL_PAGE_SAVING
    ? process.env.ENABLE_ALL_PAGE_FILTER === 'true'
    : currentBuildPreset.enableAllPageSaving,
  enableTestProperties: process.env.ENABLE_TEST_PROPERTIES
    ? process.env.ENABLE_TEST_PROPERTIES === 'true'
    : currentBuildPreset.enableTestProperties,
  enableLegacyCloud: process.env.ENABLE_LEGACY_PROVIDER
    ? process.env.ENABLE_LEGACY_PROVIDER === 'true'
    : currentBuildPreset.enableLegacyCloud,
  enableBroadcastChannelProvider: process.env.ENABLE_BC_PROVIDER
    ? process.env.ENABLE_BC_PROVIDER !== 'false'
    : currentBuildPreset.enableBroadcastChannelProvider,
  changelogUrl: process.env.CHANGELOG_URL ?? currentBuildPreset.changelogUrl,
  enablePreloading: process.env.ENABLE_PRELOADING
    ? process.env.ENABLE_PRELOADING === 'true'
    : currentBuildPreset.enablePreloading,
  enableNewSettingModal: process.env.ENABLE_NEW_SETTING_MODAL
    ? process.env.ENABLE_NEW_SETTING_MODAL === 'true'
    : currentBuildPreset.enableNewSettingModal,
  enableSQLiteProvider: process.env.ENABLE_SQLITE_PROVIDER
    ? process.env.ENABLE_SQLITE_PROVIDER === 'true'
    : currentBuildPreset.enableSQLiteProvider,
  enableNewSettingUnstableApi: process.env.ENABLE_NEW_SETTING_UNSTABLE_API
    ? process.env.ENABLE_NEW_SETTING_UNSTABLE_API === 'true'
    : currentBuildPreset.enableNewSettingUnstableApi,
};

/**
 * @type {import('@affine/env').BuildFlags}
 */
const buildFlags = {
  ...currentBuildPreset,
  // environment preset will overwrite current build preset
  // this environment variable is for debug proposes only
  // do not put them into CI
  ...(process.env.CI ? {} : environmentPreset),
};

export { buildFlags };
