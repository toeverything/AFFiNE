import { Store } from '@toeverything/infra';

export class TemplateDownloaderStore extends Store {
  constructor() {
    super();
  }

  async download(snapshotUrl: string) {
    const response = await globalThis.fetch(snapshotUrl, {
      priority: 'high',
    } as any);
    const arrayBuffer = await response.arrayBuffer();

    return { data: new Uint8Array(arrayBuffer) };
  }
}
