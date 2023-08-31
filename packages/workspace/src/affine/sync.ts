import { CRUD } from '@affine/workspace/affine/crud';
import { createCloudBlobStorage } from '@affine/workspace/blob/cloud-blob-storage';
import { downloadBinaryFromCloud } from '@affine/workspace/providers/cloud';
import { assertExists } from '@blocksuite/global/utils';
import { createIndexeddbStorage } from '@blocksuite/store';
import type { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

let abortController: AbortController | undefined;

const downloadRecursive = async (
  rootGuid: string,
  doc: Doc,
  signal: AbortSignal
): Promise<void> => {
  if (signal.aborted) {
    return;
  }
  const binary = await downloadBinaryFromCloud(rootGuid, doc.guid);
  if (typeof binary !== 'boolean') {
    applyUpdate(doc, new Uint8Array(binary), 'affine-cloud-service');
  }
  return Promise.all(
    [...doc.subdocs.values()].map(subdoc =>
      downloadRecursive(rootGuid, subdoc, signal)
    )
  ).then();
};

export async function startSync() {
  abortController = new AbortController();
  const signal = abortController.signal;
  const workspaces = await CRUD.list();
  const downloadCloudPromises = workspaces.map(workspace =>
    downloadRecursive(workspace.id, workspace.blockSuiteWorkspace.doc, signal)
  );
  const syncBlobPromises = workspaces.map(async workspace => {
    const cloudBlobStorage = createCloudBlobStorage(workspace.id);
    const indexeddbBlobStorage = createIndexeddbStorage(workspace.id);
    return Promise.all([
      cloudBlobStorage.crud.list(),
      indexeddbBlobStorage.crud.list(),
    ]).then(([cloudKeys, indexeddbKeys]) => {
      if (signal.aborted) {
        return;
      }
      const cloudKeysSet = new Set(cloudKeys);
      const indexeddbKeysSet = new Set(indexeddbKeys);
      // missing in indexeddb
      const missingLocalKeys = cloudKeys.filter(
        key => !indexeddbKeysSet.has(key)
      );
      // missing in cloud
      const missingCloudKeys = indexeddbKeys.filter(
        key => !cloudKeysSet.has(key)
      );
      return Promise.all([
        ...missingLocalKeys.map(key =>
          cloudBlobStorage.crud.get(key).then(async value => {
            if (signal.aborted) {
              return;
            }
            if (value) {
              await indexeddbBlobStorage.crud.set(key, value);
            }
          })
        ),
        ...missingCloudKeys.map(key =>
          indexeddbBlobStorage.crud.get(key).then(async value => {
            if (signal.aborted) {
              return;
            }
            if (value) {
              await cloudBlobStorage.crud.set(key, value);
            }
          })
        ),
      ]);
    });
  });
  await Promise.all([...downloadCloudPromises, ...syncBlobPromises]);
}

export async function stopSync() {
  assertExists(abortController);
  abortController.abort();
}
