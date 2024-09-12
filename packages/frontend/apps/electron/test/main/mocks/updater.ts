import 'electron-updater'; // Prevent BaseUpdater is undefined.

import { randomBytes } from 'node:crypto';

import type { AllPublishOptions } from 'builder-util-runtime';
import { UUID } from 'builder-util-runtime';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import type { DownloadUpdateOptions } from 'electron-updater/out/AppUpdater';
import type { InstallOptions } from 'electron-updater/out/BaseUpdater';
import { BaseUpdater } from 'electron-updater/out/BaseUpdater';

import { MockedHttpExecutor } from './http-executor';

/**
 * For testing, like:
 * https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/MacUpdater.ts
 */
export class MockedUpdater extends BaseUpdater {
  httpExecutor: MockedHttpExecutor;

  constructor(options?: AllPublishOptions | null, app?: AppAdapter) {
    super(options, app);

    this.httpExecutor = new MockedHttpExecutor();
    Object.assign(this, {
      getOrCreateStagingUserId: () => {
        const id = UUID.v5(randomBytes(4096), UUID.OID);
        return id;
      },
    });
  }

  doInstall(_options: InstallOptions) {
    return true;
  }
  doDownloadUpdate(_options: DownloadUpdateOptions): Promise<string[]> {
    return Promise.resolve([]);
  }
}
