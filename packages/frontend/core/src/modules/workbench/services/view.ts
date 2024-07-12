import { Service } from '@toeverything/infra';

import type { ViewScope } from '../scopes/view';

export class ViewService extends Service {
  view = this.scope.props.view;

  constructor(private readonly scope: ViewScope) {
    super();
  }
}
