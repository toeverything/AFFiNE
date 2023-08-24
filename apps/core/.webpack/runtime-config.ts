import type { BlockSuiteFeatureFlags, RuntimeConfig } from '@affine/env/global';
import type { BuildFlags } from '@affine/cli/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const editorFlags: BlockSuiteFeatureFlags = {
  enable_drag_handle: true,
  enable_block_hub: true,
  enable_surface: true,
  enable_edgeless_toolbar: true,
  enable_slash_menu: true,
  enable_database: true,
  enable_database_filter: false,
  enable_data_view: false,
  enable_page_tags: false,
  enable_toggle_block: false,
  enable_linked_page: true,
  enable_bookmark_operation: false,
  enable_note_index: false,

  enable_attachment_block: true,
};

export function getRuntimeConfig(buildFlags: BuildFlags): RuntimeConfig {
  const buildPreset: Record<string, RuntimeConfig> = {
    stable: {
      enablePlugin: false,
      enableTestProperties: false,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      changelogUrl: 'https://affine.pro/blog/affine-080-launch-week-day5',
      imageProxyUrl: 'https://workers.toeverything.workers.dev/proxy/image',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableSQLiteProvider: true,
      enableMoveDatabase: false,
      enableNotificationCenter: false,
      enableCloud: false,
      serverAPI: 'https://localhost:3010',
      editorFlags,
      appVersion: packageJson.version,
      editorVersion: packageJson.dependencies['@blocksuite/editor'],
    },
    // canary will be aggressive and enable all features
    canary: {
      enablePlugin: true,
      enableTestProperties: true,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
      imageProxyUrl: 'https://workers.toeverything.workers.dev/proxy/image',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableSQLiteProvider: true,
      enableMoveDatabase: false,
      enableNotificationCenter: true,
      enableCloud: false,
      serverAPI: 'https://localhost:3010',
      editorFlags,
      appVersion: packageJson.version,
      editorVersion: packageJson.dependencies['@blocksuite/editor'],
    },
  };

  // beta and internal versions are the same as stable
  buildPreset.beta = buildPreset.stable;
  buildPreset.internal = buildPreset.stable;

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
    enablePlugin: process.env.ENABLE_PLUGIN
      ? process.env.ENABLE_PLUGIN === 'true'
      : currentBuildPreset.enablePlugin,
    enableTestProperties: process.env.ENABLE_TEST_PROPERTIES
      ? process.env.ENABLE_TEST_PROPERTIES === 'true'
      : currentBuildPreset.enableTestProperties,
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
    enableNotificationCenter: process.env.ENABLE_NOTIFICATION_CENTER
      ? process.env.ENABLE_NOTIFICATION_CENTER === 'true'
      : currentBuildPreset.enableNotificationCenter,
    enableCloud: process.env.ENABLE_CLOUD
      ? process.env.ENABLE_CLOUD === 'true'
      : currentBuildPreset.enableCloud,
    enableMoveDatabase: process.env.ENABLE_MOVE_DATABASE
      ? process.env.ENABLE_MOVE_DATABASE === 'true'
      : currentBuildPreset.enableMoveDatabase,
  };

  return {
    ...currentBuildPreset,
    // environment preset will overwrite current build preset
    // this environment variable is for debug proposes only
    // do not put them into CI
    ...(process.env.CI ? {} : environmentPreset),
  };
}
