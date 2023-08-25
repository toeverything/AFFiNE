// credits: migrated from https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/GitHubProvider.ts
import type {
  CustomPublishOptions,
  GithubOptions,
  ReleaseNoteInfo,
  XElement,
} from 'builder-util-runtime';
import { HttpError, newError, parseXml } from 'builder-util-runtime';
import {
  type AppUpdater,
  CancellationToken,
  type ResolvedUpdateFileInfo,
  type UpdateInfo,
} from 'electron-updater';
import { BaseGitHubProvider } from 'electron-updater/out/providers/GitHubProvider';
import {
  parseUpdateInfo,
  type ProviderRuntimeOptions,
  resolveFiles,
} from 'electron-updater/out/providers/Provider';
import * as semver from 'semver';

interface GithubUpdateInfo extends UpdateInfo {
  tag: string;
}

const hrefRegExp = /\/tag\/([^/]+)$/;

export class CustomGitHubProvider extends BaseGitHubProvider<GithubUpdateInfo> {
  constructor(
    options: CustomPublishOptions,
    private updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions
  ) {
    super(options as unknown as GithubOptions, 'github.com', runtimeOptions);
  }

  async getLatestVersion(): Promise<GithubUpdateInfo> {
    const cancellationToken = new CancellationToken();

    const feedXml = await this.httpRequest(
      newUrlFromBase(`${this.basePath}.atom`, this.baseUrl),
      {
        accept: 'application/xml, application/atom+xml, text/xml, */*',
      },
      cancellationToken
    );

    if (!feedXml) {
      throw new Error(
        `Cannot find feed in the remote server (${this.baseUrl.href})`
      );
    }

    const feed = parseXml(feedXml);
    // noinspection TypeScriptValidateJSTypes
    const latestRelease = feed.element(
      'entry',
      false,
      `No published versions on GitHub`
    );
    let tag: string | null = null;
    try {
      const currentChannel =
        this.options.channel ||
        this.updater?.channel ||
        (semver.prerelease(this.updater.currentVersion)?.[0] as string) ||
        null;

      if (currentChannel === null) {
        throw newError(
          `Cannot parse channel from version: ${this.updater.currentVersion}`,
          'ERR_UPDATER_INVALID_VERSION'
        );
      }

      for (const element of feed.getElements('entry')) {
        // noinspection TypeScriptValidateJSTypes
        const hrefElement = hrefRegExp.exec(
          element.element('link').attribute('href')
        );

        // If this is null then something is wrong and skip this release
        if (hrefElement === null) continue;

        // This Release's Tag
        const hrefTag = hrefElement[1];
        // Get Channel from this release's tag
        // If it is null, we believe it is stable version
        const hrefChannel =
          (semver.prerelease(hrefTag)?.[0] as string) || 'stable';

        const isNextPreRelease = hrefChannel === currentChannel;
        if (isNextPreRelease) {
          tag = hrefTag;
          break;
        }
      }
    } catch (e: any) {
      throw newError(
        `Cannot parse releases feed: ${
          e.stack || e.message
        },\nXML:\n${feedXml}`,
        'ERR_UPDATER_INVALID_RELEASE_FEED'
      );
    }

    if (tag == null) {
      throw newError(
        `No published versions on GitHub`,
        'ERR_UPDATER_NO_PUBLISHED_VERSIONS'
      );
    }

    let rawData: string | null = null;
    let channelFile = '';
    let channelFileUrl: any = '';
    const fetchData = async (channelName: string) => {
      channelFile = getChannelFilename(channelName);
      channelFileUrl = newUrlFromBase(
        this.getBaseDownloadPath(String(tag), channelFile),
        this.baseUrl
      );
      const requestOptions = this.createRequestOptions(channelFileUrl);
      try {
        return await this.executor.request(requestOptions, cancellationToken);
      } catch (e: any) {
        if (e instanceof HttpError && e.statusCode === 404) {
          throw newError(
            `Cannot find ${channelFile} in the latest release artifacts (${channelFileUrl}): ${
              e.stack || e.message
            }`,
            'ERR_UPDATER_CHANNEL_FILE_NOT_FOUND'
          );
        }
        throw e;
      }
    };

    try {
      const channel = this.updater.allowPrerelease
        ? this.getCustomChannelName(
            String(semver.prerelease(tag)?.[0] || 'latest')
          )
        : this.getDefaultChannelName();
      rawData = await fetchData(channel);
    } catch (e: any) {
      if (this.updater.allowPrerelease) {
        // Allow fallback to `latest.yml`
        rawData = await fetchData(this.getDefaultChannelName());
      } else {
        throw e;
      }
    }

    const result = parseUpdateInfo(rawData, channelFile, channelFileUrl);
    if (result.releaseName == null) {
      result.releaseName = latestRelease.elementValueOrEmpty('title');
    }

    if (result.releaseNotes == null) {
      result.releaseNotes = computeReleaseNotes(
        this.updater.currentVersion,
        this.updater.fullChangelog,
        feed,
        latestRelease
      );
    }
    return {
      tag: tag,
      ...result,
    };
  }

  private get basePath(): string {
    return `/${this.options.owner}/${this.options.repo}/releases`;
  }

  resolveFiles(updateInfo: GithubUpdateInfo): Array<ResolvedUpdateFileInfo> {
    // still replace space to - due to backward compatibility
    return resolveFiles(updateInfo, this.baseUrl, p =>
      this.getBaseDownloadPath(updateInfo.tag, p.replace(/ /g, '-'))
    );
  }

  private getBaseDownloadPath(tag: string, fileName: string): string {
    return `${this.basePath}/download/${tag}/${fileName}`;
  }
}

export interface CustomGitHubOptions {
  channel: string;
  repo: string;
  owner: string;
  releaseType: 'release' | 'prerelease';
}

function getNoteValue(parent: XElement): string {
  const result = parent.elementValueOrEmpty('content');
  // GitHub reports empty notes as <content>No content.</content>
  return result === 'No content.' ? '' : result;
}

export function computeReleaseNotes(
  currentVersion: semver.SemVer,
  isFullChangelog: boolean,
  feed: XElement,
  latestRelease: any
): string | Array<ReleaseNoteInfo> | null {
  if (!isFullChangelog) {
    return getNoteValue(latestRelease);
  }

  const releaseNotes: Array<ReleaseNoteInfo> = [];
  for (const release of feed.getElements('entry')) {
    // noinspection TypeScriptValidateJSTypes
    const versionRelease = /\/tag\/v?([^/]+)$/.exec(
      release.element('link').attribute('href')
    )?.[1];
    if (versionRelease && semver.lt(currentVersion, versionRelease)) {
      releaseNotes.push({
        version: versionRelease,
        note: getNoteValue(release),
      });
    }
  }
  return releaseNotes.sort((a, b) => semver.rcompare(a.version, b.version));
}

// addRandomQueryToAvoidCaching is false by default because in most cases URL already contains version number,
// so, it makes sense only for Generic Provider for channel files
function newUrlFromBase(
  pathname: string,
  baseUrl: URL,
  addRandomQueryToAvoidCaching = false
): URL {
  const result = new URL(pathname, baseUrl);
  // search is not propagated (search is an empty string if not specified)
  const search = baseUrl.search;
  if (search != null && search.length !== 0) {
    result.search = search;
  } else if (addRandomQueryToAvoidCaching) {
    result.search = `noCache=${Date.now().toString(32)}`;
  }
  return result;
}

function getChannelFilename(channel: string): string {
  return `${channel}.yml`;
}
