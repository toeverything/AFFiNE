import {
  DocsService,
  type Framework,
  WorkspaceLocalState,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { QuickSearch } from './entities/quick-search';
import { QuickSearchService } from './services/quick-search';
import { RecentPagesService } from './services/recent-pages';

export * from './entities/quick-search';
export { QuickSearchService, RecentPagesService };

export function configureQuickSearchModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(QuickSearchService)
    .service(RecentPagesService, [WorkspaceLocalState, DocsService])
    .entity(QuickSearch, [DocsService, WorkspaceService]);
}
