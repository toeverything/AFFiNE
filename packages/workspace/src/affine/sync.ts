import { createIndexeddbStorage } from '@blocksuite/store';
import { pushBinary } from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

import { createCloudBlobStorage } from '../blob/cloud-blob-storage';
import { downloadBinaryFromCloud } from '../providers/cloud';
import { CRUD } from './crud';

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
    const update = new Uint8Array(binary);
    if (rootGuid === doc.guid) {
      // only apply the root doc
      applyUpdate(doc, update, 'affine-cloud-service');
    } else {
      await pushBinary(doc.guid, update);
    }
  }
  return Promise.all(
    [...doc.subdocs.values()].map(subdoc =>
      downloadRecursive(rootGuid, subdoc, signal)
    )
  ).then();
};

export async function startSync() {
  if (!environment.isDesktop) {
    return;
  }
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
  abortController?.abort();
}
