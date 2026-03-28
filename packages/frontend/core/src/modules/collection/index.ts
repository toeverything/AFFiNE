export { Collection } from './entities/collection';
export type { CollectionMeta } from './services/collection';
export { CollectionService } from './services/collection';
export { CollectionPropertiesService } from './services/collection-properties';
export { PinnedCollectionService } from './services/pinned-collection';
export type { CollectionInfo } from './stores/collection';
export type { PinnedCollectionRecord } from './stores/pinned-collection';

import { type Framework } from '@toeverything/infra';

import { CollectionRulesService } from '../collection-rules';
import { WorkspaceDBService } from '../db';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { Collection } from './entities/collection';
import { CollectionService } from './services/collection';
import { CollectionPropertiesService } from './services/collection-properties';
import { PinnedCollectionService } from './services/pinned-collection';
import { CollectionStore } from './stores/collection';
import { CollectionPropertiesStore } from './stores/collection-properties';
import { PinnedCollectionStore } from './stores/pinned-collection';

export function configureCollectionModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(CollectionService, [CollectionStore, CollectionPropertiesStore])
    .store(CollectionStore, [WorkspaceService])
    .entity(Collection, [CollectionStore, CollectionRulesService])
    .store(CollectionPropertiesStore, [WorkspaceDBService])
    .service(CollectionPropertiesService, [CollectionPropertiesStore])
    .store(PinnedCollectionStore, [WorkspaceDBService])
    .service(PinnedCollectionService, [PinnedCollectionStore]);
}
