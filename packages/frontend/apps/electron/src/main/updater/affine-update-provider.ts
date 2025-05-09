// credits: migrated from https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/GitHubProvider.ts

import {
  CancellationToken,
  type CustomPublishOptions,
  newError,
  type UpdateInfo,
} from 'builder-util-runtime';
import type { AppUpdater, ResolvedUpdateFileInfo } from 'electron-updater';
import { Provider } from 'electron-updater';
import type { ProviderRuntimeOptions } from 'electron-updater/out/providers/Provider';
import {
  getFileList,
  parseUpdateInfo,
} from 'electron-updater/out/providers/Provider';

import type { buildType } from '../config';
import { isSquirrelBuild } from './utils';

interface GithubUpdateInfo extends UpdateInfo {
  tag: string;
}

interface GithubRelease {
  url: string;
  name: string;
  tag_name: string;
  body: string;
  draft: boolean;
  prerelease: boolean;
  created_at: string;
  published_at: string;
  assets: Array<{
    name: string;
    url: string;
    size: number;
  }>;
}

interface UpdateProviderOptions {
  feedUrl?: string;
  channel: typeof buildType;
}

export class AFFiNEUpdateProvider extends Provider<GithubUpdateInfo> {
  static configFeed(options: UpdateProviderOptions): CustomPublishOptions {
    return {
      provider: 'custom',
      feedUrl: 'https://affine.pro/api/worker/releases',
      updateProvider: AFFiNEUpdateProvider,
      ...options,
    };
  }

  constructor(
    private readonly options: CustomPublishOptions,
    _updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super(runtimeOptions);
  }

  get feedUrl(): URL {
    const url = new URL(this.options.feedUrl);
    url.searchParams.set('channel', this.options.channel);
    url.searchParams.set('minimal', 'true');

    return url;
  }

  async getLatestVersion(): Promise<GithubUpdateInfo> {
    const cancellationToken = new CancellationToken();

    const releasesJsonStr = await this.httpRequest(
      this.feedUrl,
      {
        accept: 'application/json',
        'cache-control': 'no-cache',
      },
      cancellationToken
    );

    if (!releasesJsonStr) {
      throw new Error(
        `Failed to get releases from ${this.feedUrl.toString()}, response is empty`
      );
    }

    const releases = JSON.parse(releasesJsonStr);

    if (releases.length === 0) {
      throw new Error(
        `No published versions in channel ${this.options.channel}`
      );
    }

    const latestRelease = releases[0] as GithubRelease;
    const tag = latestRelease.tag_name;

    const channelFileName = 'latest.yml';
    const channelFileAsset = latestRelease.assets.find(
      ({ name }) => name === channelFileName
    );

    // TODO(@forehalo):
    //   we need a way to let UI thread prompt user to manually install the latest version,
    //   if we introduce breaking changes on auto updater in the future.
    //   for example we rename the release file from `latest.yml` to `release.yml`
    if (!channelFileAsset) {
      throw newError(
        `Cannot find ${channelFileName} in the latest release artifacts.`,
        'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
      );
    }

    const channelFileUrl = new URL(channelFileAsset.url);
    const channelFileContent = await this.httpRequest(channelFileUrl);

    const result = parseUpdateInfo(
      channelFileContent,
      channelFileName,
      channelFileUrl
    );

    result.files
      .filter(({ url }) =>
        availableForMyPlatformAndInstaller(
          url,
          process.platform,
          process.arch,
          isSquirrelBuild()
        )
      )
      .forEach(file => {
        const asset = latestRelease.assets.find(
          ({ name }) => name === file.url
        );
        if (asset) {
          file.url = asset.url;
        }
      });

    if (result.releaseName == null) {
      result.releaseName = latestRelease.name;
    }

    if (result.releaseNotes == null) {
      result.releaseNotes = latestRelease.body;
    }

    return {
      tag: tag,
      ...result,
    };
  }

  resolveFiles(updateInfo: GithubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    const files = getFileList(updateInfo);

    return files
      .filter(({ url }) =>
        availableForMyPlatformAndInstaller(
          url,
          process.platform,
          process.arch,
          isSquirrelBuild()
        )
      )
      .map(file => ({
        url: new URL(file.url),
        info: file,
      }));
  }
}

type VersionDistribution = 'canary' | 'beta' | 'stable';
type VersionPlatform = 'windows' | 'macos' | 'linux';
type VersionArch = 'x64' | 'arm64';
type FileParts =
  | ['affine', string, VersionDistribution, VersionPlatform, VersionArch]
  | [
      'affine',
      string,
      `${'canary' | 'beta'}.${number}`,
      VersionDistribution,
      VersionPlatform,
      VersionArch,
    ];

export function availableForMyPlatformAndInstaller(
  file: string,
  platform: NodeJS.Platform,
  arch: NodeJS.Architecture,
  // moved to parameter to make test coverage easier
  imWindowsSquirrelPkg: boolean
): boolean {
  const imArm64 = arch === 'arm64';
  const imX64 = arch === 'x64';
  const imMacos = platform === 'darwin';
  const imWindows = platform === 'win32';
  const imLinux = platform === 'linux';

  //  in form of:
  //   affine-${build}-${buildSuffix}-${distribution}-${platform}-${arch}.${installer}
  //          ^ 1.0.0    ^canary.1    ^ canary        ^windows    ^ x64  ^.nsis.exe
  const filename = file.split('/').pop();

  if (!filename) {
    return false;
  }

  const parts = filename.split('-') as FileParts;

  // fix -${arch}.${installer}
  const archDotInstaller = parts[parts.length - 1];
  const installerIdx = archDotInstaller.indexOf('.');
  if (installerIdx === -1) {
    return false;
  }
  const installer = archDotInstaller.substring(installerIdx + 1);
  parts[parts.length - 1] = archDotInstaller.substring(0, installerIdx);

  let version: {
    build: string;
    suffix?: string;
    distribution: VersionDistribution;
    platform: VersionPlatform;
    arch: VersionArch;
    installer: string;
  };

  if (parts.length === 5) {
    version = {
      build: parts[1],
      distribution: parts[2],
      platform: parts[3],
      arch: parts[4],
      installer,
    };
  } else if (parts.length === 6) {
    version = {
      build: parts[1],
      suffix: parts[2],
      distribution: parts[3],
      platform: parts[4],
      arch: parts[5],
      installer,
    };
  } else {
    return false;
  }

  function matchPlatform(platform: VersionPlatform) {
    return (
      (platform === 'windows' && imWindows) ||
      (platform === 'macos' && imMacos) ||
      (platform === 'linux' && imLinux)
    );
  }

  function matchArch(arch: VersionArch) {
    return (
      // off course we can install x64 on x64
      (imX64 && arch === 'x64') ||
      // arm64 macos can install arm64 or x64 in rosetta2
      (imArm64 && (arch === 'arm64' || imMacos))
    );
  }

  function matchInstaller(installer: string) {
    // do not allow squirrel or nsis installer to cross download each other on windows
    if (!imWindows) {
      return true;
    }

    return imWindowsSquirrelPkg
      ? installer === 'exe'
      : installer === 'nsis.exe';
  }

  return (
    matchPlatform(version.platform) &&
    matchArch(version.arch) &&
    matchInstaller(version.installer)
  );
}
