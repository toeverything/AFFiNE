import {
  type Framework,
  WorkspaceDBService,
  WorkspaceScope,
} from '@toeverything/infra';

import { FolderNode } from './entities/folder-node';
import { FolderTree } from './entities/folder-tree';
import { OrganizeService } from './services/organize';
import { FolderStore } from './stores/folder';

export type { FolderNode } from './entities/folder-node';
export { OrganizeService } from './services/organize';

export function configureOrganizeModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(OrganizeService)
    .entity(FolderTree, [FolderStore])
    .entity(FolderNode, [FolderStore])
    .store(FolderStore, [WorkspaceDBService]);
}
