import { Store } from '@toeverything/infra';

import type { FetchService } from '../../cloud';

export class TemplateDownloaderStore extends Store {
  constructor(private readonly fetchService: FetchService) {
    super();
  }

  async download(workspaceId: string, docId: string) {
    const response = await this.fetchService.fetch(
      `/api/workspaces/${workspaceId}/docs/${docId}`,
      {
        priority: 'high',
      } as any
    );
    const arrayBuffer = await response.arrayBuffer();

    return { data: new Uint8Array(arrayBuffer) };
  }
}
