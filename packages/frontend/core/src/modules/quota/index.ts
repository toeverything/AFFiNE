export { WorkspaceQuotaService } from './services/quota';

import { GraphQLService } from '@affine/core/modules/cloud';
import {
  type Framework,
  WorkspaceScope,
  WorkspaceService,
} from '@toeverything/infra';

import { WorkspaceQuota } from './entities/quota';
import { WorkspaceQuotaService } from './services/quota';
import { WorkspaceQuotaStore } from './stores/quota';

export function configureQuotaModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(WorkspaceQuotaService)
    .store(WorkspaceQuotaStore, [GraphQLService])
    .entity(WorkspaceQuota, [WorkspaceService, WorkspaceQuotaStore]);
}
