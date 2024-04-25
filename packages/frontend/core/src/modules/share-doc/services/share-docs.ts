import { Service } from '@toeverything/infra';

import { ShareDocsList } from '../entities/share-docs-list';

export class ShareDocsService extends Service {
  shareDocs = this.framework.createEntity(ShareDocsList);
}
