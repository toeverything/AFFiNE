import { syncDataSource } from '@affine/y-provider';
import { createIndexeddbStorage } from '@blocksuite/store';
import {
  createIndexedDBDatasource,
  DEFAULT_DB_NAME,
  downloadBinary,
} from '@toeverything/y-indexeddb';
import type { Doc } from 'yjs';
import { applyUpdate } from 'yjs';

import { createCloudBlobStorage } from '../blob/cloud-blob-storage';
import { createAffineDataSource } from '.';
import { CRUD } from './crud';

let abortController: AbortController | undefined;

const downloadRootFromIndexedDB = async (
  rootGuid: string,
  doc: Doc,
  signal: AbortSignal
): Promise<void> => {
  if (signal.aborted) {
    return;
  }
  const update = await downloadBinary(rootGuid);
  if (update !== false) {
    applyUpdate(doc, update);
  }
};

export async function startSync() {
  abortController = new AbortController();
  const signal = abortController.signal;
  const workspaces = await CRUD.list();
  const syncDocPromises = workspaces.map(workspace =>
    downloadRootFromIndexedDB(
      workspace.id,
      workspace.blockSuiteWorkspace.doc,
      signal
    )
  );
  await Promise.all(syncDocPromises);
  const syncPromises = workspaces.map(workspace => {
    const remoteDataSource = createAffineDataSource(
      workspace.id,
      workspace.blockSuiteWorkspace.doc,
      workspace.blockSuiteWorkspace.awarenessStore.awareness
    );
    const indexeddbDataSource = createIndexedDBDatasource({
      dbName: DEFAULT_DB_NAME,
    });
    return syncDataSource(
      (): string[] => [
        workspace.blockSuiteWorkspace.doc.guid,
        ...[...workspace.blockSuiteWorkspace.doc.subdocs].map(doc => doc.guid),
      ],
      remoteDataSource,
      indexeddbDataSource
    );
  });

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
  await Promise.all([...syncPromises, ...syncBlobPromises]);
}

export async function stopSync() {
  abortController?.abort();
}
