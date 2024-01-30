export * from './context';
export * from './list';
export * from './manager';
export * from './page';
export * from './service-scope';

import { type ServiceCollection, ServiceProvider } from '../di';
import { CleanupService } from '../lifecycle';
import { Workspace, WorkspaceScope } from '../workspace';
import { BlockSuitePageContext, PageMetaContext } from './context';
import { PageListService } from './list';
import { PageManager } from './manager';
import { Page } from './page';
import { PageScope } from './service-scope';

export function configurePageServices(services: ServiceCollection) {
  services
    .scope(WorkspaceScope)
    .add(PageListService, [Workspace])
    .add(PageManager, [Workspace, ServiceProvider]);
  services
    .scope(PageScope)
    .add(CleanupService)
    .add(Page, [PageMetaContext, BlockSuitePageContext, ServiceProvider]);
}
