import { resolve } from 'node:path';

import type { MakerOptions } from '@electron-forge/maker-base';
import { MakerBase } from '@electron-forge/maker-base';
import type { ForgePlatform } from '@electron-forge/shared-types';
import { execFileSync } from 'child_process';

import type { MakerDMGConfig } from './config';

export default class MakerDMG extends MakerBase<MakerDMGConfig> {
  name = 'dmg';

  defaultPlatforms: ForgePlatform[] = ['darwin', 'mas'];

  override isSupportedOnCurrentPlatform(): boolean {
    return process.platform === 'darwin';
  }

  override async make({
    dir,
    makeDir,
    appName,
    packageJSON,
    targetArch,
  }: MakerOptions): Promise<string[]> {
    const outPath = resolve(makeDir, `${this.config.name || appName}.dmg`);
    const forgeDefaultOutPath = resolve(
      makeDir,
      `${appName}-${packageJSON.version}-${targetArch}.dmg`
    );

    await this.ensureFile(outPath);

    execFileSync('create-dmg', [
      '--volname',
      appName,
      '--background',
      this.config.background,
      '--icon-size',
      '128',
      '--icon',
      `${appName}.app`,
      '176',
      '192',
      '--hide-extension',
      `${appName}.app`,
      '--app-drop-link',
      '423',
      '192',
      outPath,
      dir,
    ]);
    return [forgeDefaultOutPath];
  }
}

export { MakerDMG, type MakerDMGConfig };
