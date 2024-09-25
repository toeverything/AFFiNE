import { type Framework, GlobalState } from '@toeverything/infra';

import { AppSidebar } from './entities/app-sidebar';
import { AppSidebarLocalStateImpl } from './impls/storage';
import { AppSidebarLocalState } from './providers/storage';
import { AppSidebarService } from './services/app-sidebar';

export * from './services/app-sidebar';

export function configureAppSidebarModule(framework: Framework) {
  framework
    .service(AppSidebarService)
    .entity(AppSidebar, [AppSidebarLocalState])
    .impl(AppSidebarLocalState, AppSidebarLocalStateImpl, [GlobalState]);
}
