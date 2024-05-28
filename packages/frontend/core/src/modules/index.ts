import { configureQuotaModule } from '@affine/core/modules/quota';
import { configureInfraModules, type Framework } from '@toeverything/infra';

import { configureCloudModule } from './cloud';
import { configureCollectionModule } from './collection';
import { configureFindInPageModule } from './find-in-page';
import { configureNavigationModule } from './navigation';
import { configurePermissionsModule } from './permissions';
import { configureWorkspacePropertiesModule } from './properties';
import { configureRightSidebarModule } from './right-sidebar';
import { configureShareDocsModule } from './share-doc';
import { configureStorageImpls } from './storage';
import { configureTagModule } from './tag';
import { configureTelemetryModule } from './telemetry';
import { configureWorkbenchModule } from './workbench';

export function configureCommonModules(framework: Framework) {
  configureInfraModules(framework);
  configureCollectionModule(framework);
  configureNavigationModule(framework);
  configureRightSidebarModule(framework);
  configureTagModule(framework);
  configureWorkbenchModule(framework);
  configureWorkspacePropertiesModule(framework);
  configureCloudModule(framework);
  configureQuotaModule(framework);
  configurePermissionsModule(framework);
  configureShareDocsModule(framework);
  configureTelemetryModule(framework);
  configureFindInPageModule(framework);
}

export function configureImpls(framework: Framework) {
  configureStorageImpls(framework);
}
