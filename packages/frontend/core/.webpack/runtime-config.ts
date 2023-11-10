import type { BlockSuiteFeatureFlags, RuntimeConfig } from '@affine/env/global';
import type { BuildFlags } from '@affine/cli/config';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json');

const editorFlags: BlockSuiteFeatureFlags = {
  enable_block_hub: true,
  enable_toggle_block: false,
  enable_bookmark_operation: false,
  enable_note_index: false,
  enable_set_remote_flag: false,
};

export function getRuntimeConfig(buildFlags: BuildFlags): RuntimeConfig {
  const buildPreset: Record<BuildFlags['channel'], RuntimeConfig> = {
    stable: {
      enablePlugin: true,
      builtinPlugins: ['/plugins/image-preview'],
      enableTestProperties: false,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      changelogUrl: 'https://affine.pro/what-is-new',
      imageProxyUrl: 'https://workers.toeverything.workers.dev/proxy/image',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableSQLiteProvider: true,
      enableMoveDatabase: false,
      enableNotificationCenter: true,
      enableCloud: true,
      enableCaptcha: true,
      enableEnhanceShareMode: false,
      enablePayment: true,
      serverUrlPrefix: 'https://insider.affine.pro', // Let insider be stable environment temporarily.
      editorFlags,
      appVersion: packageJson.version,
      editorVersion: packageJson.dependencies['@blocksuite/editor'],
    },
    get beta() {
      return {
        ...this.stable,
        serverUrlPrefix: 'https://insider.affine.pro',
      };
    },
    get internal() {
      return {
        ...this.stable,
        serverUrlPrefix: 'https://insider.affine.pro',
      };
    },
    // canary will be aggressive and enable all features
    canary: {
      enablePlugin: true,
      builtinPlugins: [
        '/plugins/copilot',
        '/plugins/hello-world',
        '/plugins/image-preview',
        '/plugins/vue-hello-world',
        '/plugins/outline',
      ],
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
      enableCloud: true,
      enableCaptcha: true,
      enableEnhanceShareMode: false,
      enablePayment: true,
      serverUrlPrefix: 'https://affine.fail',
      editorFlags,
      appVersion: packageJson.version,
      editorVersion: packageJson.dependencies['@blocksuite/editor'],
    },
  };

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
    builtinPlugins: [
      '/plugins/copilot',
      '/plugins/hello-world',
      '/plugins/image-preview',
      '/plugins/vue-hello-world',
      '/plugins/outline',
    ],
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
    enableCaptcha: process.env.ENABLE_CAPTCHA
      ? process.env.ENABLE_CAPTCHA === 'true'
      : buildFlags.mode === 'development'
      ? false
      : currentBuildPreset.enableCaptcha,
    enableEnhanceShareMode: process.env.ENABLE_ENHANCE_SHARE_MODE
      ? process.env.ENABLE_ENHANCE_SHARE_MODE === 'true'
      : currentBuildPreset.enableEnhanceShareMode,
    enableMoveDatabase: process.env.ENABLE_MOVE_DATABASE
      ? process.env.ENABLE_MOVE_DATABASE === 'true'
      : currentBuildPreset.enableMoveDatabase,
    enablePayment: process.env.ENABLE_PAYMENT
      ? process.env.ENABLE_PAYMENT !== 'false'
      : buildFlags.mode === 'development'
      ? true
      : currentBuildPreset.enablePayment,
  };

  if (buildFlags.mode === 'development') {
    currentBuildPreset.serverUrlPrefix = 'http://localhost:8080';
  }

  return {
    ...currentBuildPreset,
    // environment preset will overwrite current build preset
    // this environment variable is for debug proposes only
    // do not put them into CI
    ...(process.env.CI ? {} : environmentPreset),
  };
}
