export { ShareService } from './services/share';
export { ShareDocsService } from './services/share-docs';

import {
  DocScope,
  DocService,
  type Framework,
  WorkspaceLocalCache,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { GraphQLService } from '../cloud';
import { ShareDocsList } from './entities/share-docs-list';
import { Share } from './entities/share-info';
import { ShareService } from './services/share';
import { ShareDocsService } from './services/share-docs';
import { ShareStore } from './stores/share';
import { ShareDocsStore } from './stores/share-docs';

export function configureShareDocsModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ShareDocsService, [WorkspaceService])
    .store(ShareDocsStore, [GraphQLService])
    .entity(ShareDocsList, [
      WorkspaceService,
      ShareDocsStore,
      WorkspaceLocalCache,
    ])
    .scope(DocScope)
    .service(ShareService)
    .entity(Share, [WorkspaceService, DocService, ShareStore])
    .store(ShareStore, [GraphQLService]);
}
