import { Entity } from '@toeverything/infra';

import { createIsland } from '../../../utils/island';

export class RightSidebarView extends Entity {
  readonly body = createIsland();
  readonly header = createIsland();
}
