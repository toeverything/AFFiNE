import { type Framework } from '@toeverything/infra';

import { GlobalCache } from '../storage';
import { WorkspaceScope } from '../workspace';
import { NavigationPanelSection } from './entities/navigation-panel-section';
import { NavigationPanelService } from './services/navigation-panel';
export { NavigationPanelService } from './services/navigation-panel';
export type { CollapsibleSectionName } from './types';

export function configureNavigationPanelModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(NavigationPanelService)
    .entity(NavigationPanelSection, [GlobalCache]);
}
