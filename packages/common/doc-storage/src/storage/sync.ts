import { Storage, type StorageOptions } from './storage';

export interface SyncStorageOptions extends StorageOptions {}

export interface PeerClock {
  docId: string;
  clock: number;
}

export abstract class SyncStorage<
  Opts extends SyncStorageOptions = SyncStorageOptions,
> extends Storage<Opts> {
  abstract getPeerClocks(peer: string): Promise<Record<string, number>>;
  abstract setPeerClock(
    peer: string,
    docId: string,
    clock: number
  ): Promise<void>;

  abstract getPeerPushedClocks(peer: string): Promise<Record<string, number>>;
  abstract setPeerPushedClock(
    peer: string,
    docId: string,
    clock: number
  ): Promise<void>;
}
