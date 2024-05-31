import type { Framework } from '@toeverything/infra';

import { PeekViewEntity } from './entities/peek-view';
import { PeekViewService } from './services/peek-view';

export function configurePeekViewModule(framework: Framework) {
  framework.service(PeekViewService).entity(PeekViewEntity);
}

export { PeekViewEntity, PeekViewService };
export { PeekViewManagerModal, useInsidePeekView } from './view';
