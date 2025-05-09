import type { Framework } from '@toeverything/infra';

import { WorkspaceServerService } from '../cloud/services/workspace-server';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { WorkspaceDB } from './entities/db';
import { WorkspaceDBTable } from './entities/table';
import { WorkspaceDBService } from './services/db';

export type { DocCustomPropertyInfo, DocProperties } from './schema';
export { WorkspaceDBService } from './services/db';

export function configureWorkspaceDBModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceDBService, [WorkspaceService, WorkspaceServerService])
    .entity(WorkspaceDB)
    .entity(WorkspaceDBTable, [WorkspaceService]);
}
