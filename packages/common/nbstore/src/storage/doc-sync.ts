import type { Connection } from '../connection';
import type { DocClock, DocClocks } from './doc';
import { type Storage } from './storage';

export interface DocSyncStorage extends Storage {
  readonly storageType: 'docSync';

  getPeerRemoteClock(peer: string, docId: string): Promise<DocClock | null>;
  getPeerRemoteClocks(peer: string): Promise<DocClocks>;
  setPeerRemoteClock(peer: string, clock: DocClock): Promise<void>;
  getPeerPulledRemoteClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null>;
  getPeerPulledRemoteClocks(peer: string): Promise<DocClocks>;
  setPeerPulledRemoteClock(peer: string, clock: DocClock): Promise<void>;
  getPeerPushedClock(peer: string, docId: string): Promise<DocClock | null>;
  getPeerPushedClocks(peer: string): Promise<DocClocks>;
  setPeerPushedClock(peer: string, clock: DocClock): Promise<void>;
  clearClocks(): Promise<void>;
}

export abstract class DocSyncStorageBase implements DocSyncStorage {
  readonly storageType = 'docSync';
  abstract readonly connection: Connection;

  abstract getPeerRemoteClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null>;
  abstract getPeerRemoteClocks(peer: string): Promise<DocClocks>;
  abstract setPeerRemoteClock(peer: string, clock: DocClock): Promise<void>;
  abstract getPeerPulledRemoteClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null>;
  abstract getPeerPulledRemoteClocks(peer: string): Promise<DocClocks>;
  abstract setPeerPulledRemoteClock(
    peer: string,
    clock: DocClock
  ): Promise<void>;
  abstract getPeerPushedClock(
    peer: string,
    docId: string
  ): Promise<DocClock | null>;
  abstract getPeerPushedClocks(peer: string): Promise<DocClocks>;
  abstract setPeerPushedClock(peer: string, clock: DocClock): Promise<void>;
  abstract clearClocks(): Promise<void>;
}
