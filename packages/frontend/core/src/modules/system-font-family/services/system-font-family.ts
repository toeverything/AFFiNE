import { Service } from '@toeverything/infra';

import { SystemFontFamily } from '../entities/system-font-family';

export class SystemFontFamilyService extends Service {
  public readonly systemFontFamily =
    this.framework.createEntity(SystemFontFamily);
}
