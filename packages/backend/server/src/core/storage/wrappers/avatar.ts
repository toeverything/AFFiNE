import { Injectable } from '@nestjs/common';

import type { BlobInputType, PutObjectMetadata } from '../../../base';
import { Config, OnEvent, toBuffer, URLHelper } from '../../../base';
import { StorageRuntimeProvider } from '../../storage-runtime';

@Injectable()
export class AvatarStorage {
  get config() {
    return this.AFFiNEConfig.storages.avatar;
  }

  constructor(
    private readonly AFFiNEConfig: Config,
    private readonly url: URLHelper,
    private readonly rt: StorageRuntimeProvider
  ) {}

  async put(key: string, blob: BlobInputType, metadata?: PutObjectMetadata) {
    await this.rt.putObject('avatar', key, await toBuffer(blob), metadata);
    let link = this.config.publicPath + key;

    if (link.startsWith('/')) {
      link = this.url.link(link);
    }

    return link;
  }

  get(key: string) {
    return this.rt.getObject('avatar', key);
  }

  delete(link: string) {
    return this.rt.deleteObject('avatar', link.split('/').pop() as string);
  }

  @OnEvent('user.deleted')
  async onUserDeleted(user: Events['user.deleted']) {
    if (user.avatarUrl) {
      await this.delete(user.avatarUrl);
    }
  }
}
