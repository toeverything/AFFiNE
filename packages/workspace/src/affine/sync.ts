import type { Doc } from 'yjs';

import { createCloudBlobStorage } from '../blob/cloud-blob-storage';
import { createSQLiteStorage } from '../blob/sqlite-blob-storage';
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
    await window.apis.db.applyDocUpdate(
      rootGuid,
      update,
      rootGuid === doc.guid ? undefined : doc.guid
    );
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
  if (environment.isDesktop) {
    const workspaces = await CRUD.list();
    const downloadCloudPromises = workspaces.map(workspace =>
      downloadRecursive(workspace.id, workspace.blockSuiteWorkspace.doc, signal)
    );
    const syncBlobPromises = workspaces.map(async workspace => {
      const cloudBlobStorage = createCloudBlobStorage(workspace.id);
      const sqliteBlobStorage = createSQLiteStorage(workspace.id);
      return Promise.all([
        cloudBlobStorage.crud.list(),
        sqliteBlobStorage.crud.list(),
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
                await sqliteBlobStorage.crud.set(key, value);
              }
            })
          ),
          ...missingCloudKeys.map(key =>
            sqliteBlobStorage.crud.get(key).then(async value => {
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
}

export async function stopSync() {
  abortController?.abort();
}
