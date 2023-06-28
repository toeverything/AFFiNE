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
  internal: {},
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
buildPreset.internal = buildPreset.stable;

const currentBuild = process.env.BUILD_ENV || 'stable';

const currentBuildPreset = buildPreset[currentBuild];

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
