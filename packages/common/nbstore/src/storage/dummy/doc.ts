import { DummyConnection } from '../../connection';
import {
  type DocClock,
  type DocClocks,
  type DocDiff,
  type DocRecord,
  type DocStorage,
  type DocUpdate,
} from '../doc';

export class DummyDocStorage implements DocStorage {
  spaceId = '';
  readonly storageType = 'doc';
  readonly isReadonly = true;
  getDoc(_docId: string): Promise<DocRecord | null> {
    return Promise.resolve(null);
  }
  getDocDiff(_docId: string, _state?: Uint8Array): Promise<DocDiff | null> {
    return Promise.resolve(null);
  }
  pushDocUpdate(update: DocUpdate, _origin?: string): Promise<DocClock> {
    return Promise.resolve({
      docId: update.docId,
      timestamp: new Date(),
    });
  }
  getDocTimestamp(_docId: string): Promise<DocClock | null> {
    return Promise.resolve(null);
  }
  getDocTimestamps(_after?: Date): Promise<DocClocks> {
    return Promise.resolve({});
  }
  deleteDoc(_docId: string): Promise<void> {
    return Promise.resolve();
  }
  subscribeDocUpdate(
    _callback: (update: DocRecord, origin?: string) => void
  ): () => void {
    return () => {};
  }
  connection = new DummyConnection();
}
