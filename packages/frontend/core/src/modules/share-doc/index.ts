export { ShareDocsListService } from './services/share-docs-list';
export { ShareInfoService } from './services/share-info';

import { type Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud';
import { DocScope, DocService } from '../doc';
import {
  WorkspaceLocalCache,
  WorkspaceScope,
  WorkspaceService,
} from '../workspace';
import { ShareDocsList } from './entities/share-docs-list';
import { ShareInfo } from './entities/share-info';
import { ShareDocsListService } from './services/share-docs-list';
import { ShareInfoService } from './services/share-info';
import { ShareStore } from './stores/share';
import { ShareDocsStore } from './stores/share-docs';

export function configureShareDocsModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ShareDocsListService, [WorkspaceService])
    .store(ShareDocsStore, [WorkspaceServerService])
    .entity(ShareDocsList, [
      WorkspaceService,
      ShareDocsStore,
      WorkspaceLocalCache,
    ])
    .scope(DocScope)
    .service(ShareInfoService)
    .entity(ShareInfo, [WorkspaceService, DocService, ShareStore])
    .store(ShareStore, [WorkspaceServerService]);
}
