import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { CollectionService } from '../collection';
import { WorkspaceDialogService } from '../dialogs';
import { DocsService } from '../doc';
import { DocDisplayMetaService } from '../doc-display-meta';
import { DocsSearchService } from '../docs-search';
import { FeatureFlagService } from '../feature-flag';
import { GlobalContextService } from '../global-context';
import { JournalService } from '../journal';
import { TagService } from '../tag';
import { WorkbenchService } from '../workbench';
import {
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
} from '../workspace';
import { QuickSearch } from './entities/quick-search';
import { CollectionsQuickSearchSession } from './impls/collections';
import { CommandsQuickSearchSession } from './impls/commands';
import { CreationQuickSearchSession } from './impls/creation';
import { DocsQuickSearchSession } from './impls/docs';
import { ExternalLinksQuickSearchSession } from './impls/external-links';
import { JournalsQuickSearchSession } from './impls/journals';
import { LinksQuickSearchSession } from './impls/links';
import { RecentDocsQuickSearchSession } from './impls/recent-docs';
import { TagsQuickSearchSession } from './impls/tags';
import { CMDKQuickSearchService } from './services/cmdk';
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
    .entity(QuickSearch)
    .entity(CommandsQuickSearchSession, [GlobalContextService])
    .entity(DocsQuickSearchSession, [
      WorkspaceService,
      WorkspaceServerService,
      DocsSearchService,
      DocsService,
      DocDisplayMetaService,
      FeatureFlagService,
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
    ])
    .entity(JournalsQuickSearchSession, [
      JournalService,
      WorkspaceDialogService,
      DocDisplayMetaService,
    ]);
}
