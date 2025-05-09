import { DummyConnection } from '../../connection';
import {
  type BlobRecord,
  BlobStorageBase,
  type ListedBlobRecord,
} from '../blob';

export class DummyBlobStorage extends BlobStorageBase {
  override readonly isReadonly = true;
  override get(
    _key: string,
    _signal?: AbortSignal
  ): Promise<BlobRecord | null> {
    return Promise.resolve(null);
  }
  override set(_blob: BlobRecord, _signal?: AbortSignal): Promise<void> {
    return Promise.resolve();
  }
  override delete(
    _key: string,
    _permanently: boolean,
    _signal?: AbortSignal
  ): Promise<void> {
    return Promise.resolve();
  }
  override release(_signal?: AbortSignal): Promise<void> {
    return Promise.resolve();
  }
  override list(_signal?: AbortSignal): Promise<ListedBlobRecord[]> {
    return Promise.resolve([]);
  }
  override connection = new DummyConnection();
}
