import { DebugLogger } from '@affine/debug';
import { fetchWithReport } from '@affine/graphql';
import type { ActiveDocProvider, DocProviderCreator } from '@blocksuite/store';
import { Workspace } from '@blocksuite/store';
import type { Doc } from 'yjs';

const Y = Workspace.Y;

const logger = new DebugLogger('affine:cloud');

export async function downloadBinaryFromCloud(
  rootGuid: string,
  pageGuid: string
) {
  const response = await fetchWithReport(
    runtimeConfig.serverUrlPrefix +
      `/api/workspaces/${rootGuid}/docs/${pageGuid}`
  );
  if (response.ok) {
    return response.arrayBuffer();
  }
  return false;
}

async function downloadBinary(rootGuid: string, doc: Doc) {
  const buffer = await downloadBinaryFromCloud(rootGuid, doc.guid);
  if (buffer) {
    Y.applyUpdate(doc, new Uint8Array(buffer), 'affine-cloud');
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
