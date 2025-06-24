/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { apis, appInfo, events, sharedStorage } from '@affine/electron-api';
import { Service } from '@toeverything/infra';

import type { DesktopApiProvider } from '../provider';

export class ElectronApiImpl extends Service implements DesktopApiProvider {
  constructor() {
    super();

    if (!apis || !events || !sharedStorage || !appInfo) {
      throw new Error('Failed to initialize DesktopApiImpl');
    }
  }
  handler: typeof apis = apis;
  events: typeof events = events;
  sharedStorage: typeof sharedStorage = sharedStorage;
  appInfo: NonNullable<typeof appInfo> = appInfo!;
}
