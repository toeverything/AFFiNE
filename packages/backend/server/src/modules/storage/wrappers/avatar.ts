import { Injectable } from '@nestjs/common';

import { AFFiNEStorageConfig, Config } from '../../../config';
import { type EventPayload, OnEvent } from '../../../event';
import {
  BlobInputType,
  createStorageProvider,
  PutObjectMetadata,
  StorageProvider,
} from '../providers';

@Injectable()
export class AvatarStorage {
  public readonly provider: StorageProvider;
  private readonly storageConfig: AFFiNEStorageConfig['storages']['avatar'];

  constructor(private readonly config: Config) {
    this.provider = createStorageProvider(this.config.storage, 'avatar');
    this.storageConfig = this.config.storage.storages.avatar;
  }

  async put(key: string, blob: BlobInputType, metadata?: PutObjectMetadata) {
    await this.provider.put(key, blob, metadata);
    let link = this.storageConfig.publicLinkFactory(key);

    if (link.startsWith('/')) {
      link = this.config.baseUrl + link;
    }

    return link;
  }

  get(key: string) {
    return this.provider.get(key);
  }

  delete(key: string) {
    return this.provider.delete(key);
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: EventPayload<'user.deleted'>) {
    if (user.avatarUrl) {
      await this.delete(user.avatarUrl);
    }
  }
}
