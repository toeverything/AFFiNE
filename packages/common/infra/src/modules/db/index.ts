import type { Framework } from '../../framework';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DB } from './entities/db';
import { Table } from './entities/table';
import { WorkspaceDBService } from './services/db';

export { AFFiNE_WORKSPACE_DB_SCHEMA } from './schema';
export { WorkspaceDBService } from './services/db';
export { transformWorkspaceDBLocalToCloud } from './services/db';

export function configureWorkspaceDBModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceDBService, [WorkspaceService])
    .entity(DB)
    .entity(Table, [WorkspaceService]);
}
