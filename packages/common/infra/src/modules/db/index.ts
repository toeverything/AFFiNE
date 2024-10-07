import type { Framework } from '../../framework';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { WorkspaceDB } from './entities/db';
import { WorkspaceDBTable } from './entities/table';
import { WorkspaceDBService } from './services/db';

export type { DocProperties } from './schema';
export { WorkspaceDBService } from './services/db';
export { transformWorkspaceDBLocalToCloud } from './services/db';

export function configureWorkspaceDBModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceDBService, [WorkspaceService])
    .entity(WorkspaceDB)
    .entity(WorkspaceDBTable, [WorkspaceService]);
}
