import { execFileSync } from 'node:child_process';
import { cp, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import { join, resolve } from 'node:path';

import type { MakerOptions } from '@electron-forge/maker-base';
import { MakerBase } from '@electron-forge/maker-base';
import type { ForgePlatform } from '@electron-forge/shared-types';

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

    const args = [
      '--volname',
      appName,
      '--window-size',
      '610',
      '365',
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
    ];

    const tempDir = await mkdtemp(join(os.tmpdir(), 'electron-forge-dmg-'));
    const filePath = join(tempDir, `${appName}.app`);
    try {
      await cp(this.config.file, filePath, {
        recursive: true,
      });
      args.push(outPath, filePath);

      execFileSync('create-dmg', args, {
        cwd: dir,
        env: process.env,
        stdio: 'inherit',
        shell: true,
      });
    } finally {
      // await rm(filePath, { force: true });
    }

    return [forgeDefaultOutPath];
  }
}
