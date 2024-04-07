import { fetchWithTraceReport } from '@affine/graphql';

export class CloudStaticDocStorage {
  name = 'cloud-static';
  constructor(private readonly workspaceId: string) {}

  async pull(
    docId: string
  ): Promise<{ data: Uint8Array; state?: Uint8Array | undefined } | null> {
    const response = await fetchWithTraceReport(
      `/api/workspaces/${this.workspaceId}/docs/${docId}`,
      {
        priority: 'high',
      }
    );
    if (response.ok) {
      const arrayBuffer = await response.arrayBuffer();

      return { data: new Uint8Array(arrayBuffer) };
    }

    return null;
  }
}
