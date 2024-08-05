export { Workbench } from './entities/workbench';
export { ViewScope } from './scopes/view';
export { WorkbenchService } from './services/workbench';
export { useIsActiveView } from './view/use-is-active-view';
export { ViewBody, ViewHeader, ViewSidebarTab } from './view/view-islands';
export { ViewIcon, ViewTitle } from './view/view-meta';
export { WorkbenchLink } from './view/workbench-link';
export { WorkbenchRoot } from './view/workbench-root';

import {
  type Framework,
  GlobalStateService,
  WorkspaceScope,
} from '@toeverything/infra';

import { SidebarTab } from './entities/sidebar-tab';
import { View } from './entities/view';
import { Workbench } from './entities/workbench';
import { ViewScope } from './scopes/view';
import { DesktopStateSynchronizer } from './services/desktop-state-synchronizer';
import { ViewService } from './services/view';
import { WorkbenchService } from './services/workbench';
import {
  BrowserWorkbenchNewTabHandler,
  DesktopWorkbenchNewTabHandler,
  WorkbenchNewTabHandler,
} from './services/workbench-new-tab-handler';
import {
  DesktopWorkbenchDefaultState,
  InMemoryWorkbenchDefaultState,
  WorkbenchDefaultState,
} from './services/workbench-view-state';

export function configureWorkbenchCommonModule(services: Framework) {
  services
    .scope(WorkspaceScope)
    .service(WorkbenchService)
    .entity(Workbench, [WorkbenchDefaultState, WorkbenchNewTabHandler])
    .entity(View)
    .scope(ViewScope)
    .service(ViewService, [ViewScope])
    .entity(SidebarTab);
}

export function configureBrowserWorkbenchModule(services: Framework) {
  configureWorkbenchCommonModule(services);
  services
    .scope(WorkspaceScope)
    .impl(WorkbenchDefaultState, InMemoryWorkbenchDefaultState)
    .impl(WorkbenchNewTabHandler, () => BrowserWorkbenchNewTabHandler);
}

export function configureDesktopWorkbenchModule(services: Framework) {
  configureWorkbenchCommonModule(services);
  services
    .scope(WorkspaceScope)
    .impl(WorkbenchDefaultState, DesktopWorkbenchDefaultState, [
      GlobalStateService,
    ])
    .impl(WorkbenchNewTabHandler, () => DesktopWorkbenchNewTabHandler)
    .service(DesktopStateSynchronizer, [WorkbenchService]);
}
