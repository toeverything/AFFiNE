import { DBService, type Framework, WorkspaceScope } from '@toeverything/infra';

import { FolderNode } from './entities/folder-node';
import { OrganizeService } from './services/organize';
import { FolderStore } from './stores/folder';

export type { FolderNode } from './entities/folder-node';
export { OrganizeService } from './services/organize';

export function configureOrganizeModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(OrganizeService)
    .entity(FolderNode, [FolderStore])
    .store(FolderStore, [DBService]);
}
