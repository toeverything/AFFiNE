import { Scope } from '@toeverything/infra';

import type { View } from '../entities/view';

export class ViewScope extends Scope<{
  view: View;
}> {}
