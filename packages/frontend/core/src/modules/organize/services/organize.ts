import { Service } from '@toeverything/infra';

import { FolderNode } from '../entities/folder-node';

export class OrganizeService extends Service {
  readonly rootFolder = this.framework.createEntity(FolderNode, {
    id: null,
  });
}
