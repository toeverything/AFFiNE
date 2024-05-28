import { Service } from '@toeverything/infra';

import { FindInPage } from '../entities/find-in-page';

export class FindInPageService extends Service {
  public readonly findInPage = this.framework.createEntity(FindInPage);
}
