import { Service } from '@toeverything/infra';

import { I18n } from '../entities/i18n';

export class I18nService extends Service {
  public readonly i18n = this.framework.createEntity(I18n);
}
