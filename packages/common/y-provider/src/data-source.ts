import type { Doc as YDoc } from 'yjs';
import { applyUpdate, encodeStateAsUpdate } from 'yjs';

import type { DocState } from './types';

export interface DocDataSource {
  /**
   * request diff update from other clients
   */
  queryDocState: (
    guid: string,
    options?: {
      stateVector?: Uint8Array;
      targetClientId?: number;
    }
  ) => Promise<DocState | false>;

  /**
   * send update to the datasource
   */
  sendDocUpdate: (guid: string, update: Uint8Array) => Promise<void>;

  /**
   * listen to update from the datasource. Returns a function to unsubscribe.
   * this is optional because some datasource might not support it
   */
  onDocUpdate?(
    callback: (guid: string, update: Uint8Array) => void
  ): () => void;
}

export async function syncDocFromDataSource(
  rootDoc: YDoc,
  datasource: DocDataSource
) {
  const downloadDocStateRecursively = async (doc: YDoc) => {
    const docState = await datasource.queryDocState(doc.guid);
    if (docState) {
      applyUpdate(doc, docState.missing, 'sync-doc-from-datasource');
    }
    await Promise.all(
      [...doc.subdocs].map(async subdoc => {
        await downloadDocStateRecursively(subdoc);
      })
    );
  };
  await downloadDocStateRecursively(rootDoc);
}

export async function syncDataSourceFromDoc(
  rootDoc: YDoc,
  datasource: DocDataSource
) {
  const uploadDocStateRecursively = async (doc: YDoc) => {
    await datasource.sendDocUpdate(doc.guid, encodeStateAsUpdate(doc));
    await Promise.all(
      [...doc.subdocs].map(async subdoc => {
        await uploadDocStateRecursively(subdoc);
      })
    );
  };

  await uploadDocStateRecursively(rootDoc);
}

/**
 * query the datasource from source, and save the latest update to target
 *
 * @example
 *  bindDataSource(socketIO, indexedDB)
 *  bindDataSource(socketIO, sqlite)
 */
export async function syncDataSource(
  listDocGuids: () => string[],
  remoteDataSource: DocDataSource,
  localDataSource: DocDataSource
) {
  const guids = listDocGuids();
  await Promise.all(
    guids.map(guid => {
      return localDataSource.queryDocState(guid).then(async docState => {
        const remoteDocState = await (async () => {
          if (docState) {
            return remoteDataSource.queryDocState(guid, {
              stateVector: docState.state,
            });
          } else {
            return remoteDataSource.queryDocState(guid);
          }
        })();
        if (remoteDocState) {
          const missing = remoteDocState.missing;
          if (missing.length === 2 && missing[0] === 0 && missing[1] === 0) {
            // empty update
            return;
          }
          await localDataSource.sendDocUpdate(guid, remoteDocState.missing);
        }
      });
    })
  );
}
