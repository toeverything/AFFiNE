export { AgentPlatformService } from './services/agent';
export { AgentPanel } from './views/agent-panel';

import type { Framework } from '@toeverything/infra';

import { WorkspaceScope } from '../workspace/scopes/workspace';
import { AgentPlatformService } from './services/agent';
import { AgentPlatformStore } from './stores/agent';

export function configureAgentPlatformModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .store(AgentPlatformStore)
    .service(AgentPlatformService, [AgentPlatformStore]);
}
