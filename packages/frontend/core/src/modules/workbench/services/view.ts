import { Service } from '@toeverything/infra';

import { View } from '../entities/view';

export class ViewService extends Service {
  view = this.framework.createEntity(View);
}
