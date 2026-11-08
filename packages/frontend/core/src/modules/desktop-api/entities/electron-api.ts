/* oxlint-disable typescript/no-non-null-assertion */
import { Entity } from '@toeverything/infra';

import type { DesktopApiProvider } from '../provider';

export class DesktopApi extends Entity {
  constructor(public readonly provider: DesktopApiProvider) {
    super();
    if (!provider.handler || !provider.events || !provider.sharedStorage) {
      throw new Error('DesktopApiProvider is not correctly initialized');
    }
  }

  get handler() {
    return this.provider.handler!;
  }

  get events() {
    return this.provider.events!;
  }

  get sharedStorage() {
    return this.provider.sharedStorage!;
  }

  get appInfo() {
    return this.provider.appInfo;
  }
}

export class DesktopAppInfo extends Entity {
  constructor(public readonly provider: DesktopApiProvider) {
    super();
  }
}
