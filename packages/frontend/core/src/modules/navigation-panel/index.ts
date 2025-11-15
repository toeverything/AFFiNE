import { type Framework } from '@toeverything/infra';

import { GlobalCache } from '../storage';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { NavigationPanelService } from './services/navigation-panel';
export { NavigationPanelService } from './services/navigation-panel';

export function configureNavigationPanelModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(NavigationPanelService, [GlobalCache, WorkspaceService]);
}
