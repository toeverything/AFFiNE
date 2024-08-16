import { Service } from '@toeverything/infra';

import { ShareReader } from '../entities/share-reader';

export class ShareReaderService extends Service {
  reader = this.framework.createEntity(ShareReader);
}
