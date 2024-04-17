export { Workbench } from './entities/workbench';
export { ViewScope as View } from './scopes/view';
export { WorkbenchService } from './services/workbench';
export { useIsActiveView } from './view/use-is-active-view';
export { ViewBodyIsland } from './view/view-body-island';
export { ViewHeaderIsland } from './view/view-header-island';
export { WorkbenchLink } from './view/workbench-link';
export { WorkbenchRoot } from './view/workbench-root';

import { type Framework, WorkspaceScope } from '@toeverything/infra';

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
    .scope(ViewScope)
    .entity(View, [ViewScope])
    .service(ViewService);
}
