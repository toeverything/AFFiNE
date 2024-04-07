import { configureInfraModules, type Framework } from '@toeverything/infra';

import { configureCollectionModule } from './collection';
import { configureNavigationModule } from './navigation';
import { configureWorkspacePropertiesModule } from './properties';
import { configureRightSidebarModule } from './right-sidebar';
import { configureTagModule } from './tag';
import { configureWorkbenchModule } from './workbench';

export function configureCommonModules(framework: Framework) {
  configureInfraModules(framework);
  configureCollectionModule(framework);
  configureNavigationModule(framework);
  configureRightSidebarModule(framework);
  configureTagModule(framework);
  configureWorkbenchModule(framework);
  configureWorkspacePropertiesModule(framework);
}
