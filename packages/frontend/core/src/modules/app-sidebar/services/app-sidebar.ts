import { GlobalState, Service } from '@toeverything/infra';

import { AppSidebar } from '../entities/app-sidebar';

export class AppSidebarService extends Service {
  sidebar = this.framework.createEntity(AppSidebar, [GlobalState]);
}
