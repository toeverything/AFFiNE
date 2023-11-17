import { fetchWithTraceReport } from '@affine/graphql';

const hashMap = new Map<string, CloudDoc>();
type DocPublishMode = 'edgeless' | 'page';

export type CloudDoc = {
  arrayBuffer: ArrayBuffer;
  publishMode: DocPublishMode;
};

export async function downloadBinaryFromCloud(
  rootGuid: string,
  pageGuid: string
): Promise<CloudDoc | null> {
  const cached = hashMap.get(`${rootGuid}/${pageGuid}`);
  if (cached) {
    return cached;
  }
  const response = await fetchWithTraceReport(
    runtimeConfig.serverUrlPrefix +
      `/api/workspaces/${rootGuid}/docs/${pageGuid}`,
    {
      priority: 'high',
    }
  );
  if (response.ok) {
    const publishMode = (response.headers.get('publish-mode') ||
      'page') as DocPublishMode;
    const arrayBuffer = await response.arrayBuffer();
    hashMap.set(`${rootGuid}/${pageGuid}`, { arrayBuffer, publishMode });

    // return both arrayBuffer and publish mode
    return { arrayBuffer, publishMode };
  }

  return null;
}
