import { Service } from '@toeverything/infra';

import { Share } from '../entities/share-info';

export class ShareService extends Service {
  share = this.framework.createEntity(Share);
}
