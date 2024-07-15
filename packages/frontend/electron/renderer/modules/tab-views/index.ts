import { WorkspacePropertiesAdapter } from '@affine/core/modules/properties';
import {
  configureWorkbenchCommonModule,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { type Framework, WorkspaceScope } from '@toeverything/infra';

export function configureDesktopWorkbenchModule(services: Framework) {
  configureWorkbenchCommonModule(services);
  services
    .scope(WorkspaceScope)
    .service(DesktopTabViewsService, [
      WorkbenchService,
      WorkspacePropertiesAdapter,
    ]);
}
