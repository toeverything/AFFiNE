import { DebugLogger } from '@affine/debug';
import { fetchWithTraceReport } from '@affine/graphql';
import type { ActiveDocProvider, DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import type { Doc } from 'yjs';

const Y = Workspace.Y;

const logger = new DebugLogger('affine:cloud');

const hashMap = new Map<string, ArrayBuffer>();

type DocPublishMode = 'edgeless' | 'page';

export type CloudDoc = {
  arrayBuffer: ArrayBuffer;
  publishMode: DocPublishMode;
};

export async function downloadBinaryFromCloud(
  rootGuid: string,
  pageGuid: string
): Promise<CloudDoc | boolean> {
  if (hashMap.has(`${rootGuid}/${pageGuid}`)) {
    return true;
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
    hashMap.set(`${rootGuid}/${pageGuid}`, arrayBuffer);

    // return both arrayBuffer and publish mode
    return { arrayBuffer, publishMode };
  }
  return false;
}

async function downloadBinary(rootGuid: string, doc: Doc) {
  const response = await downloadBinaryFromCloud(rootGuid, doc.guid);
  if (typeof response !== 'boolean') {
    const { arrayBuffer } = response;
    Y.applyUpdate(doc, new Uint8Array(arrayBuffer), 'affine-cloud');
  }
}

export const createCloudDownloadProvider: DocProviderCreator = (
  id,
  doc
): ActiveDocProvider => {
  let _resolve: () => void;
  let _reject: (error: unknown) => void;
  const promise = new Promise<void>((resolve, reject) => {
    _resolve = resolve;
    _reject = reject;
  });

  return {
    flavour: 'affine-cloud-download',
    active: true,
    sync() {
      downloadBinary(id, doc)
        .then(() => {
          logger.info(`Downloaded ${id}`);
          _resolve();
        })
        .catch(_reject);
    },
    get whenReady() {
      return promise;
    },
  };
};

export const createMergeCloudSnapshotProvider: DocProviderCreator = (
  id,
  doc
): ActiveDocProvider => {
  let _resolve: () => void;
  const promise = new Promise<void>(resolve => {
    _resolve = resolve;
  });

  return {
    flavour: 'affine-cloud-merge-snapshot',
    active: true,
    sync() {
      downloadBinary(id, doc)
        .then(() => {
          logger.info(`Downloaded ${id}`);
          _resolve();
        })
        // ignore error
        .catch(e => {
          console.error(e);
          _resolve();
        });
    },
    get whenReady() {
      return promise;
    },
  };
};
