import { Injectable, Logger } from '@nestjs/common';
import semver from 'semver';

import { Config, UnsupportedClientVersion } from '../../base';

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);

  constructor(private readonly config: Config) {}

  async checkVersion(clientVersion?: string) {
    const requiredVersion = this.config.client.versionControl.requiredVersion;

    const range = await this.getVersionRange(requiredVersion);
    if (!range) {
      // ignore invalid allowed version config
      return true;
    }

    if (
      !clientVersion ||
      !semver.satisfies(clientVersion, range, {
        includePrerelease: true,
      })
    ) {
      throw new UnsupportedClientVersion({
        clientVersion: clientVersion ?? 'unset_or_invalid',
        requiredVersion,
      });
    }

    return true;
  }

  private readonly cachedVersionRange = new Map<
    string,
    semver.Range | undefined
  >();
  private async getVersionRange(versionRange: string) {
    if (this.cachedVersionRange.has(versionRange)) {
      return this.cachedVersionRange.get(versionRange);
    }

    let range: semver.Range | undefined;
    try {
      range = new semver.Range(versionRange, { loose: false });
      if (!semver.validRange(range)) {
        range = undefined;
      }
    } catch {
      range = undefined;
    }

    if (!range) {
      this.logger.error(`invalid version range: ${versionRange}`);
    }

    this.cachedVersionRange.set(versionRange, range);
    return range;
  }
}
