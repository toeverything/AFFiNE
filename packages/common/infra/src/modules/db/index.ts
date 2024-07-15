import type { Framework } from '../../framework';
import { WorkspaceScope, WorkspaceService } from '../workspace';
import { DBService } from './services/db';

export { AFFiNE_DB_SCHEMA } from './schema';
export { DBService } from './services/db';

export function configureDBModule(framework: Framework) {
  framework.scope(WorkspaceScope).service(DBService, [WorkspaceService]);
}
