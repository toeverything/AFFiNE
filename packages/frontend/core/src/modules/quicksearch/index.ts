import {
  DocsService,
  type Framework,
  GlobalContextService,
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { CollectionService } from '../collection';
import { DocsSearchService } from '../docs-search';
import { WorkspacePropertiesAdapter } from '../properties';
import { TagService } from '../tag';
import { WorkbenchService } from '../workbench';
import { QuickSearch } from './entities/quick-search';
import { CollectionsQuickSearchSession } from './impls/collections';
import { CommandsQuickSearchSession } from './impls/commands';
import { CreationQuickSearchSession } from './impls/creation';
import { DocsQuickSearchSession } from './impls/docs';
import { ExternalLinksQuickSearchSession } from './impls/external-links';
import { LinksQuickSearchSession } from './impls/links';
import { RecentDocsQuickSearchSession } from './impls/recent-docs';
import { TagsQuickSearchSession } from './impls/tags';
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
export { ExternalLinksQuickSearchSession } from './impls/external-links';
export { LinksQuickSearchSession } from './impls/links';
export { RecentDocsQuickSearchSession } from './impls/recent-docs';
export { TagsQuickSearchSession } from './impls/tags';
export type { QuickSearchItem } from './types/item';
export { QuickSearchContainer } from './views/container';
export { QuickSearchTagIcon } from './views/tag-icon';

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
    .entity(LinksQuickSearchSession, [
      WorkspaceService,
      DocsService,
      DocDisplayMetaService,
    ])
    .entity(ExternalLinksQuickSearchSession, [WorkspaceService])
    .entity(CreationQuickSearchSession)
    .entity(CollectionsQuickSearchSession, [CollectionService])
    .entity(TagsQuickSearchSession, [TagService])
    .entity(RecentDocsQuickSearchSession, [
      RecentDocsService,
      DocDisplayMetaService,
    ]);
}
