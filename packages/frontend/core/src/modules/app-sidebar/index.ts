import { type Framework, GlobalState } from '@toeverything/infra';

import { AppSidebar } from './entities/app-sidebar';
import { AppSidebarStateImpl } from './impls/storage';
import { AppSidebarState } from './providers/storage';
import { AppSidebarService } from './services/app-sidebar';

export * from './services/app-sidebar';

export function configureAppSidebarModule(framework: Framework) {
  framework
    .service(AppSidebarService)
    .entity(AppSidebar, [AppSidebarState])
    .impl(AppSidebarState, AppSidebarStateImpl, [GlobalState]);
}
