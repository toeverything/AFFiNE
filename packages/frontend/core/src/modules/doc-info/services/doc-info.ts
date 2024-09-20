import { Service } from '@toeverything/infra';

import { DocInfoModal } from '../entities/modal';

export class DocInfoService extends Service {
  public readonly modal = this.framework.createEntity(DocInfoModal);
}
