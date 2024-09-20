import type { BUILD_CONFIG_TYPE } from '@affine/env/global';

import packageJson from '../../package.json' assert { type: 'json' };
import type { BuildFlags } from '../config';

export function getBuildConfig(buildFlags: BuildFlags): BUILD_CONFIG_TYPE {
  const buildPreset: Record<BuildFlags['channel'], BUILD_CONFIG_TYPE> = {
    get stable() {
      return {
        debug: buildFlags.mode === 'development',
        distribution: buildFlags.distribution,
        isDesktopEdition: (
          ['web', 'desktop', 'admin'] as BuildFlags['distribution'][]
        ).includes(buildFlags.distribution),
        isMobileEdition: (['mobile'] as BuildFlags['distribution'][]).includes(
          buildFlags.distribution
        ),
        isElectron: buildFlags.distribution === 'desktop',
        isWeb: buildFlags.distribution === 'web',
        isMobileWeb: buildFlags.distribution === 'mobile',

        isSelfHosted: process.env.SELF_HOSTED === 'true',
        appBuildType: 'stable' as const,
        serverUrlPrefix: 'https://app.affine.pro',
        appVersion: packageJson.version,
        editorVersion: packageJson.devDependencies['@blocksuite/affine'],
        githubUrl: 'https://github.com/toeverything/AFFiNE',
        changelogUrl: 'https://affine.pro/what-is-new',
        downloadUrl: 'https://affine.pro/download',
        imageProxyUrl: '/api/worker/image-proxy',
        linkPreviewUrl: '/api/worker/link-preview',
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
