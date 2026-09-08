import type { Connection } from '../connection';
import type { DocClock } from './doc';
import type { Storage } from './storage';

export interface DocIndexedClock extends DocClock {
  indexerVersion: number;
}

export interface IndexerSyncStorage extends Storage {
  readonly storageType: 'indexerSync';
  readonly commitsIndexAtomically: boolean;

  getDocIndexedClock(docId: string): Promise<DocIndexedClock | null>;

  setDocIndexedClock(docClock: DocIndexedClock): Promise<void>;
  setDocIndexedClocks(docClocks: DocIndexedClock[]): Promise<void>;

  clearDocIndexedClock(docId: string): Promise<void>;
}

export abstract class IndexerSyncStorageBase implements IndexerSyncStorage {
  readonly storageType = 'indexerSync';
  readonly commitsIndexAtomically: boolean = false;
  abstract connection: Connection<any>;
  abstract getDocIndexedClock(docId: string): Promise<DocIndexedClock | null>;
  abstract setDocIndexedClock(docClock: DocIndexedClock): Promise<void>;
  async setDocIndexedClocks(docClocks: DocIndexedClock[]): Promise<void> {
    for (const clock of docClocks) await this.setDocIndexedClock(clock);
  }
  abstract clearDocIndexedClock(docId: string): Promise<void>;
}
