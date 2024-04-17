import { Service } from '@toeverything/infra';

import { RightSidebar } from '../entities/right-sidebar';

export class RightSidebarService extends Service {
  rightSidebar = this.framework.createEntity(RightSidebar);
}
