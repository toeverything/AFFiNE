import type { RuntimeConfig } from '@affine/env/global';

import packageJson from '../../package.json' assert { type: 'json' };
import type { BuildFlags } from '../config';

export function getRuntimeConfig(buildFlags: BuildFlags): RuntimeConfig {
  const buildPreset: Record<BuildFlags['channel'], RuntimeConfig> = {
    stable: {
      enableTestProperties: false,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      githubUrl: 'https://github.com/toeverything/AFFiNE',
      changelogUrl: 'https://affine.pro/what-is-new',
      downloadUrl: 'https://affine.pro/download',
      imageProxyUrl: '/api/worker/image-proxy',
      linkPreviewUrl: '/api/worker/link-preview',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableCloud: true,
      enableCaptcha: true,
      enableEnhanceShareMode: false,
      enablePayment: true,
      enablePageHistory: true,
      enableExperimentalFeature: false,
      allowLocalWorkspace: buildFlags.distribution === 'desktop' ? true : false,
      serverUrlPrefix: 'https://app.affine.pro',
      appVersion: packageJson.version,
      editorVersion: packageJson.devDependencies['@blocksuite/presets'],
      appBuildType: 'stable',
    },
    get beta() {
      return {
        ...this.stable,
        enablePageHistory: true,
        serverUrlPrefix: 'https://insider.affine.pro',
        appBuildType: 'beta' as const,
      };
    },
    get internal() {
      return {
        ...this.stable,
        serverUrlPrefix: 'https://insider.affine.pro',
        appBuildType: 'internal' as const,
      };
    },
    // canary will be aggressive and enable all features
    canary: {
      enableTestProperties: true,
      enableBroadcastChannelProvider: true,
      enableDebugPage: true,
      githubUrl: 'https://github.com/toeverything/AFFiNE',
      changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
      downloadUrl: 'https://affine.pro/download',
      imageProxyUrl: '/api/worker/image-proxy',
      linkPreviewUrl: '/api/worker/link-preview',
      enablePreloading: true,
      enableNewSettingModal: true,
      enableNewSettingUnstableApi: false,
      enableCloud: true,
      enableCaptcha: true,
      enableEnhanceShareMode: false,
      enablePayment: true,
      enablePageHistory: true,
      enableExperimentalFeature: true,
      allowLocalWorkspace: buildFlags.distribution === 'desktop' ? true : false,
      serverUrlPrefix: 'https://affine.fail',
      appVersion: packageJson.version,
      editorVersion: packageJson.devDependencies['@blocksuite/presets'],
      appBuildType: 'canary',
    },
  };

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
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
    enableNewSettingUnstableApi: process.env.ENABLE_NEW_SETTING_UNSTABLE_API
      ? process.env.ENABLE_NEW_SETTING_UNSTABLE_API === 'true'
      : currentBuildPreset.enableNewSettingUnstableApi,
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
    enablePayment: process.env.ENABLE_PAYMENT
      ? process.env.ENABLE_PAYMENT !== 'false'
      : buildFlags.mode === 'development'
        ? true
        : currentBuildPreset.enablePayment,
    enablePageHistory: process.env.ENABLE_PAGE_HISTORY
      ? process.env.ENABLE_PAGE_HISTORY === 'true'
      : buildFlags.mode === 'development'
        ? true
        : currentBuildPreset.enablePageHistory,
    allowLocalWorkspace: process.env.ALLOW_LOCAL_WORKSPACE
      ? process.env.ALLOW_LOCAL_WORKSPACE === 'true'
      : buildFlags.mode === 'development'
        ? true
        : currentBuildPreset.allowLocalWorkspace,
  };

  const testEnvironmentPreset = {
    allowLocalWorkspace: true,
  };

  if (buildFlags.mode === 'development') {
    currentBuildPreset.serverUrlPrefix = 'http://localhost:8080';
  }

  return {
    isSelfHosted: process.env.SELF_HOSTED === 'true',
    ...currentBuildPreset,
    // environment preset will overwrite current build preset
    // this environment variable is for debug proposes only
    // do not put them into CI
    ...(process.env.CI ? {} : environmentPreset),

    // test environment preset will overwrite current build preset
    // this environment variable is for github workflow e2e-test only
    ...(process.env.IN_CI_TEST ? testEnvironmentPreset : {}),
  };
}
