import type { RuntimeConfig } from '@affine/env/global';

import packageJson from '../../package.json' assert { type: 'json' };
import type { BuildFlags } from '../config';

export function getRuntimeConfig(buildFlags: BuildFlags): RuntimeConfig {
  const buildPreset: Record<BuildFlags['channel'], RuntimeConfig> = {
    get stable() {
      return {
        appBuildType: 'stable' as const,
        serverUrlPrefix: 'https://app.affine.pro',
        appVersion: packageJson.version,
        editorVersion: packageJson.devDependencies['@blocksuite/presets'],
        githubUrl: 'https://github.com/toeverything/AFFiNE',
        changelogUrl: 'https://affine.pro/what-is-new',
        downloadUrl: 'https://affine.pro/download',
        imageProxyUrl: '/api/worker/image-proxy',
        linkPreviewUrl: '/api/worker/link-preview',
        enablePreloading: true,
        enableCaptcha: true,
        enableExperimentalFeature: true,
        allowLocalWorkspace:
          buildFlags.distribution === 'desktop' ? true : false,
        enableOrganize: true,
        enableInfoModal: true,

        // CAUTION(@forehalo): product not ready, do not enable it
        enableNewSettingUnstableApi: false,
        enableEnhanceShareMode: false,
        enableThemeEditor: false,
      };
    },
    get beta() {
      return {
        ...this.stable,
        appBuildType: 'beta' as const,
        serverUrlPrefix: 'https://insider.affine.pro',
        changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
      };
    },
    get internal() {
      return {
        ...this.stable,
        appBuildType: 'internal' as const,
        serverUrlPrefix: 'https://insider.affine.pro',
        changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
      };
    },
    // canary will be aggressive and enable all features
    get canary() {
      return {
        ...this.stable,
        appBuildType: 'canary' as const,
        serverUrlPrefix: 'https://affine.fail',
        changelogUrl: 'https://github.com/toeverything/AFFiNE/releases',
        enableInfoModal: true,
        enableOrganize: true,
        enableThemeEditor: true,
      };
    },
  };

  const currentBuild = buildFlags.channel;

  if (!(currentBuild in buildPreset)) {
    throw new Error(`BUILD_TYPE ${currentBuild} is not supported`);
  }

  const currentBuildPreset = buildPreset[currentBuild];

  const environmentPreset = {
    changelogUrl: process.env.CHANGELOG_URL ?? currentBuildPreset.changelogUrl,
    enablePreloading: process.env.ENABLE_PRELOADING
      ? process.env.ENABLE_PRELOADING === 'true'
      : currentBuildPreset.enablePreloading,
    enableNewSettingUnstableApi: process.env.ENABLE_NEW_SETTING_UNSTABLE_API
      ? process.env.ENABLE_NEW_SETTING_UNSTABLE_API === 'true'
      : currentBuildPreset.enableNewSettingUnstableApi,
    enableCaptcha: process.env.ENABLE_CAPTCHA
      ? process.env.ENABLE_CAPTCHA === 'true'
      : buildFlags.mode === 'development'
        ? false
        : currentBuildPreset.enableCaptcha,
    enableEnhanceShareMode: process.env.ENABLE_ENHANCE_SHARE_MODE
      ? process.env.ENABLE_ENHANCE_SHARE_MODE === 'true'
      : currentBuildPreset.enableEnhanceShareMode,
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
