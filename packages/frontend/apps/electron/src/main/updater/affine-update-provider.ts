// credits: migrated from https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/GitHubProvider.ts

import type { CustomPublishOptions } from 'builder-util-runtime';
import { newError } from 'builder-util-runtime';
import type {
  AppUpdater,
  ResolvedUpdateFileInfo,
  UpdateFileInfo,
  UpdateInfo,
} from 'electron-updater';
import { CancellationToken, Provider } from 'electron-updater';
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
  name: string;
  tag_name: string;
  published_at: string;
  assets: Array<{
    name: string;
    url: string;
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

    const channelFileName = getChannelFilename(this.getDefaultChannelName());
    const channelFileAsset = latestRelease.assets.find(({ url }) =>
      url.endsWith(channelFileName)
    );

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

    const files: UpdateFileInfo[] = [];

    result.files.forEach(file => {
      const asset = latestRelease.assets.find(({ name }) => name === file.url);
      if (asset) {
        file.url = asset.url;
      }

      // for windows, we need to determine its installer type (nsis or squirrel)
      if (process.platform === 'win32') {
        const isSquirrel = isSquirrelBuild();
        if (isSquirrel && file.url.endsWith('.nsis.exe')) {
          return;
        }
      }

      files.push(file);
    });

    if (result.releaseName == null) {
      result.releaseName = latestRelease.name;
    }

    if (result.releaseNotes == null) {
      // TODO(@forehalo): add release notes
      result.releaseNotes = '';
    }

    return {
      tag: tag,
      ...result,
    };
  }

  resolveFiles(updateInfo: GithubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    const files = getFileList(updateInfo);

    return files.map(file => ({
      url: new URL(file.url),
      info: file,
    }));
  }
}

function getChannelFilename(channel: string): string {
  return `${channel}.yml`;
}
