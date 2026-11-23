import type { Framework } from '@toeverything/infra';

import { WorkspaceDBService } from '../db';
import { WorkspaceScope } from '../workspace';
import { ExplorerIconService } from './services/explorer-icon';
import { ExplorerIconStore } from './store/explorer-icon';

export function configureExplorerIconModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(ExplorerIconStore, [WorkspaceDBService])
    .service(ExplorerIconService, [ExplorerIconStore]);
}
