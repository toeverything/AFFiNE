import type { DocState } from './types';

export interface DatasourceDocAdapter {
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

/**
 * query the datasource from source, and save the latest update to target
 *
 * @example
 *  bindDataSource(socketIO, indexedDB)
 *  bindDataSource(socketIO, sqlite)
 */
export async function syncDataSource(
  listDocGuids: () => string[],
  remoteDataSource: DatasourceDocAdapter,
  localDataSource: DatasourceDocAdapter
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
