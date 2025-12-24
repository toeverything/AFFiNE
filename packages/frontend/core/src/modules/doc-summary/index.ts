import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { FeatureFlagService } from '../feature-flag';
import { CacheStorage } from '../storage';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DocSummaryService } from './services/doc-summary';
import { DocSummaryStore } from './stores/doc-summary';

export { DocSummaryService };

export function configureDocSummaryModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(DocSummaryService, [
      WorkspaceService,
      DocSummaryStore,
      FeatureFlagService,
    ])
    .store(DocSummaryStore, [
      WorkspaceService,
      WorkspaceServerService,
      CacheStorage,
    ]);
}
