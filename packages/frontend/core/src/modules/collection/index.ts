export { CollectionService } from './services/collection';

import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { CollectionService } from './services/collection';

export function configureCollectionModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(CollectionService, [WorkspaceService]);
}
