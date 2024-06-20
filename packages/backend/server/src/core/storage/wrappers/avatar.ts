import { Injectable } from '@nestjs/common';

import type {
  BlobInputType,
  EventPayload,
  PutObjectMetadata,
  StorageProvider,
} from '../../../fundamentals';
import {
  Config,
  OnEvent,
  StorageProviderFactory,
  URLHelper,
} from '../../../fundamentals';

@Injectable()
export class AvatarStorage {
  public readonly provider: StorageProvider;
  private readonly storageConfig: Config['storages']['avatar'];

  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly storageFactory: StorageProviderFactory
  ) {
    this.storageConfig = this.config.storages.avatar;
    this.provider = this.storageFactory.create(this.storageConfig);
  }

  async put(key: string, blob: BlobInputType, metadata?: PutObjectMetadata) {
    await this.provider.put(key, blob, metadata);
    let link = this.storageConfig.publicLinkFactory(key);

    if (link.startsWith('/')) {
      link = this.url.link(link);
    }

    return link;
  }

  get(key: string) {
    return this.provider.get(key);
  }

  delete(link: string) {
    return this.provider.delete(this.storageConfig.keyInPublicLink(link));
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: EventPayload<'user.deleted'>) {
    if (user.avatarUrl) {
      await this.delete(user.avatarUrl);
    }
  }
}
