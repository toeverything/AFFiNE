export * from './manager';
export * from './page';
export * from './record';
export * from './record-list';
export * from './service-scope';

import type { ServiceCollection } from '../di';
import { ServiceProvider } from '../di';
import { CleanupService } from '../lifecycle';
import { Workspace, WorkspaceLocalState, WorkspaceScope } from '../workspace';
import { BlockSuitePageContext, PageRecordContext } from './context';
import { PageManager } from './manager';
import { Doc } from './page';
import { PageRecordList } from './record-list';
import { PageScope } from './service-scope';

export function configurePageServices(services: ServiceCollection) {
  services
    .scope(WorkspaceScope)
    .add(PageManager, [Workspace, PageRecordList, ServiceProvider])
    .add(PageRecordList, [Workspace, WorkspaceLocalState]);

  services
    .scope(PageScope)
    .add(CleanupService)
    .add(Doc, [PageRecordContext, BlockSuitePageContext, ServiceProvider]);
}
