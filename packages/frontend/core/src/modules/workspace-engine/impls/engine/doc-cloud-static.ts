import type { FetchService } from '@affine/core/modules/cloud';

export class CloudStaticDocStorage {
  name = 'cloud-static';
  constructor(
    private readonly workspaceId: string,
    private readonly fetchService: FetchService
  ) {}

  async pull(
    docId: string
  ): Promise<{ data: Uint8Array; state?: Uint8Array | undefined } | null> {
    const response = await this.fetchService.fetch(
      `/api/workspaces/${this.workspaceId}/docs/${docId}`,
      {
        priority: 'high',
      } as any
    );
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();

      return { data: new Uint8Array(arrayBuffer) };
    }

    return null;
  }
}
