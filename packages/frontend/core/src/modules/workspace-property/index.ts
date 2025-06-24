import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { WorkspaceService } from '../workspace';
import { WorkspaceScope } from '../workspace/scopes/workspace';
import { WorkspacePropertyService } from './services/workspace-property';
import { WorkspacePropertyStore } from './stores/workspace-property';

export { WorkspacePropertyService } from './services/workspace-property';
export type * from './types';

export function configureWorkspacePropertyModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspacePropertyService, [WorkspacePropertyStore])
    .store(WorkspacePropertyStore, [WorkspaceService, WorkspaceDBService]);
}
