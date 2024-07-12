export { Workbench } from './entities/workbench';
export { ViewScope } from './scopes/view';
export { WorkbenchService } from './services/workbench';
export { useIsActiveView } from './view/use-is-active-view';
export { ViewBody, ViewHeader, ViewSidebarTab } from './view/view-islands';
export { WorkbenchLink } from './view/workbench-link';
export { WorkbenchRoot } from './view/workbench-root';

import { type Framework, WorkspaceScope } from '@toeverything/infra';

import { SidebarTab } from './entities/sidebar-tab';
import { View } from './entities/view';
import { Workbench } from './entities/workbench';
import { ViewScope } from './scopes/view';
import { ViewService } from './services/view';
import { WorkbenchService } from './services/workbench';

export function configureWorkbenchModule(services: Framework) {
  services
    .scope(WorkspaceScope)
    .service(WorkbenchService)
    .entity(Workbench)
    .entity(View)
    .scope(ViewScope)
    .service(ViewService, [ViewScope])
    .entity(SidebarTab);
}
