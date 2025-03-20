import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { WorkspaceDBService } from '../db';
import { DocScope, DocService, DocsService } from '../doc';
import { GlobalState } from '../storage';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { ReadwiseIntegration } from './entities/readwise';
import { ReadwiseCrawler } from './entities/readwise-crawler';
import { IntegrationWriter } from './entities/writer';
import { IntegrationService } from './services/integration';
import { IntegrationPropertyService } from './services/integration-property';
import { IntegrationRefStore } from './store/integration-ref';
import { ReadwiseStore } from './store/readwise';

export { IntegrationService };
export { IntegrationTypeIcon } from './views/icon';

export function configureIntegrationModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(IntegrationRefStore, [WorkspaceDBService, DocsService])
    .store(ReadwiseStore, [
      GlobalState,
      WorkspaceService,
      WorkspaceServerService,
    ])
    .service(IntegrationService)
    .entity(IntegrationWriter, [WorkspaceService])
    .entity(ReadwiseCrawler, [ReadwiseStore])
    .entity(ReadwiseIntegration, [
      IntegrationRefStore,
      ReadwiseStore,
      DocsService,
    ])
    .scope(DocScope)
    .service(IntegrationPropertyService, [DocService]);
}
