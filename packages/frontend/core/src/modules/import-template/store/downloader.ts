import { Store } from '@toeverything/infra';

import type { FetchService } from '../../cloud';

export class TemplateDownloaderStore extends Store {
  constructor(private readonly fetchService: FetchService) {
    super();
  }

  async download(snapshotUrl: string) {
    const response = await this.fetchService.fetch(snapshotUrl, {
      priority: 'high',
    } as any);
    const arrayBuffer = await response.arrayBuffer();

    return { data: new Uint8Array(arrayBuffer) };
  }
}
