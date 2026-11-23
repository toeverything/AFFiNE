import { DummyConnection } from '../../connection';
import { type DocIndexedClock, IndexerSyncStorageBase } from '../indexer-sync';

export class DummyIndexerSyncStorage extends IndexerSyncStorageBase {
  override connection = new DummyConnection();
  override getDocIndexedClock(_docId: string): Promise<DocIndexedClock | null> {
    return Promise.resolve(null);
  }
  override setDocIndexedClock(_docClock: DocIndexedClock): Promise<void> {
    return Promise.resolve();
  }
  override clearDocIndexedClock(_docId: string): Promise<void> {
    return Promise.resolve();
  }
}
