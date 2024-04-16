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
import { ShareDocsStoreService } from './services/share-docs-store';
import { ShareStoreService } from './services/share-store';

export function configureShareDocsModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(ShareDocsService)
    .service(ShareDocsStoreService, [GraphQLService])
    .entity(ShareDocsList, [
      WorkspaceService,
      ShareDocsStoreService,
      WorkspaceLocalCache,
    ])
    .scope(DocScope)
    .service(ShareService)
    .entity(Share, [WorkspaceService, DocService, ShareStoreService])
    .store(ShareStoreService, [GraphQLService]);
}
