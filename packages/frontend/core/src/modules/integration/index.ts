import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { WorkspaceDBService } from '../db';
import { DocScope, DocService, DocsService } from '../doc';
import { CacheStorage, GlobalState } from '../storage';
import { TagService } from '../tag';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { CalendarIntegration } from './entities/calendar';
import { CalendarSubscription } from './entities/calendar-subscription';
import { ReadwiseIntegration } from './entities/readwise';
import { ReadwiseCrawler } from './entities/readwise-crawler';
import { IntegrationWriter } from './entities/writer';
import { IntegrationService } from './services/integration';
import { IntegrationPropertyService } from './services/integration-property';
import { CalendarStore } from './store/calendar';
import { IntegrationRefStore } from './store/integration-ref';
import { ReadwiseStore } from './store/readwise';

export { IntegrationService };
export { CalendarIntegration } from './entities/calendar';
export { CalendarSubscription } from './entities/calendar-subscription';
export type { CalendarEvent } from './type';
export { IntegrationTypeIcon } from './views/icon';
export { DocIntegrationPropertiesTable } from './views/properties-table';

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
    .entity(ReadwiseCrawler, [ReadwiseStore])
    .entity(IntegrationWriter, [WorkspaceService, TagService])
    .entity(ReadwiseIntegration, [
      IntegrationRefStore,
      ReadwiseStore,
      DocsService,
    ])
    .store(CalendarStore, [
      GlobalState,
      CacheStorage,
      WorkspaceService,
      WorkspaceServerService,
    ])
    .entity(CalendarIntegration, [CalendarStore])
    .entity(CalendarSubscription, [CalendarStore])
    .scope(DocScope)
    .service(IntegrationPropertyService, [DocService]);
}
