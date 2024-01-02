import { Injectable } from '@nestjs/common';

import { Config } from '../../../config';
import {
  BlobInputType,
  createStorageProvider,
  PutObjectMetadata,
  StorageProvider,
} from '../providers';

@Injectable()
export class AvatarStorage {
  public readonly provider: StorageProvider;

  constructor({ storage }: Config) {
    this.provider = createStorageProvider(storage, 'avatar');
  }

  put(key: string, blob: BlobInputType, metadata?: PutObjectMetadata) {
    return this.provider.put(key, blob, metadata);
  }

  get(key: string) {
    return this.provider.get(key);
  }

  async delete(key: string) {
    return this.provider.delete(key);
  }
}
