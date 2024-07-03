import {
  DocsService,
  type Framework,
  GlobalContextService,
  WorkspaceLocalState,
  WorkspaceScope,
} from '@toeverything/infra';

import { CollectionService } from '../collection';
import { DocsSearchService } from '../docs-search';
import { WorkspacePropertiesAdapter } from '../properties';
import { WorkbenchService } from '../workbench';
import { QuickSearch } from './entities/quick-search';
import { CollectionsQuickSearchSession } from './impls/collections';
import { CommandsQuickSearchSession } from './impls/commands';
import { CreationQuickSearchSession } from './impls/creation';
import { DocsQuickSearchSession } from './impls/docs';
import { RecentDocsQuickSearchSession } from './impls/recent-docs';
import { CMDKQuickSearchService } from './services/cmdk';
import { DocDisplayMetaService } from './services/doc-display-meta';
import { QuickSearchService } from './services/quick-search';
import { RecentDocsService } from './services/recent-pages';

export { QuickSearch } from './entities/quick-search';
export { QuickSearchService, RecentDocsService };
export { CollectionsQuickSearchSession } from './impls/collections';
export { CommandsQuickSearchSession } from './impls/commands';
export { CreationQuickSearchSession } from './impls/creation';
export { DocsQuickSearchSession } from './impls/docs';
export { RecentDocsQuickSearchSession } from './impls/recent-docs';
export type { QuickSearchItem } from './types/item';
export { QuickSearchContainer } from './views/container';

export function configureQuickSearchModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(QuickSearchService)
    .service(CMDKQuickSearchService, [
      QuickSearchService,
      WorkbenchService,
      DocsService,
    ])
    .service(RecentDocsService, [WorkspaceLocalState, DocsService])
    .service(DocDisplayMetaService, [WorkspacePropertiesAdapter])
    .entity(QuickSearch)
    .entity(CommandsQuickSearchSession, [GlobalContextService])
    .entity(DocsQuickSearchSession, [
      DocsSearchService,
      DocsService,
      DocDisplayMetaService,
    ])
    .entity(CreationQuickSearchSession)
    .entity(CollectionsQuickSearchSession, [CollectionService])
    .entity(RecentDocsQuickSearchSession, [
      RecentDocsService,
      DocDisplayMetaService,
    ]);
}
