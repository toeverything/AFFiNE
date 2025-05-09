import { Injectable } from '@nestjs/common';

import type {
  BlobInputType,
  PutObjectMetadata,
  StorageProvider,
} from '../../../base';
import {
  Config,
  OnEvent,
  StorageProviderFactory,
  URLHelper,
} from '../../../base';

@Injectable()
export class AvatarStorage {
  private provider!: StorageProvider;

  get config() {
    return this.AFFiNEConfig.storages.avatar;
  }

  constructor(
    private readonly AFFiNEConfig: Config,
    private readonly url: URLHelper,
    private readonly storageFactory: StorageProviderFactory
  ) {}

  @OnEvent('config.init')
  async onConfigInit() {
    this.provider = this.storageFactory.create(this.config.storage);
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if (event.updates.storages?.avatar?.storage) {
      this.provider = this.storageFactory.create(this.config.storage);
    }
  }

  async put(key: string, blob: BlobInputType, metadata?: PutObjectMetadata) {
    await this.provider.put(key, blob, metadata);
    let link = this.config.publicPath + key;

    if (link.startsWith('/')) {
      link = this.url.link(link);
    }

    return link;
  }

  get(key: string) {
    return this.provider.get(key);
  }

  delete(link: string) {
    return this.provider.delete(link.split('/').pop() as string);
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: Events['user.deleted']) {
    if (user.avatarUrl) {
      await this.delete(user.avatarUrl);
    }
  }
}
