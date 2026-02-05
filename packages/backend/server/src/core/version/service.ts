import { Injectable, Logger } from '@nestjs/common';
import semver from 'semver';

import { Config, UnsupportedClientVersion } from '../../base';

@Injectable()
export class VersionService {
  private readonly logger = new Logger(VersionService.name);
  private static readonly HARD_REQUIRED_VERSION = '>=0.25.0';

  constructor(private readonly config: Config) {}

  async checkVersion(clientVersion?: string) {
    const requiredVersion = this.config.client.versionControl.requiredVersion;

    const hardRange = await this.getVersionRange(
      VersionService.HARD_REQUIRED_VERSION
    );
    const configRange = await this.getVersionRange(requiredVersion);

    if (
      configRange &&
      (!clientVersion ||
        !semver.satisfies(clientVersion, configRange, {
          includePrerelease: true,
        }))
    ) {
      throw new UnsupportedClientVersion({
        clientVersion: clientVersion ?? 'unset_or_invalid',
        requiredVersion,
      });
    }

    if (
      hardRange &&
      (!clientVersion ||
        !semver.satisfies(clientVersion, hardRange, {
          includePrerelease: true,
        }))
    ) {
      throw new UnsupportedClientVersion({
        clientVersion: clientVersion ?? 'unset_or_invalid',
        requiredVersion: VersionService.HARD_REQUIRED_VERSION,
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
