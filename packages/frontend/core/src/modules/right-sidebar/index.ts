export { RightSidebar } from './entities/right-sidebar';
export { RightSidebarService } from './services/right-sidebar';
export { RightSidebarContainer } from './view/container';
export { RightSidebarViewIsland } from './view/view-island';

import {
  type Framework,
  GlobalState,
  WorkspaceScope,
} from '@toeverything/infra';

import { RightSidebar } from './entities/right-sidebar';
import { RightSidebarView } from './entities/right-sidebar-view';
import { RightSidebarService } from './services/right-sidebar';

export function configureRightSidebarModule(services: Framework) {
  services
    .scope(WorkspaceScope)
    .service(RightSidebarService)
    .entity(RightSidebar, [GlobalState])
    .entity(RightSidebarView);
}
