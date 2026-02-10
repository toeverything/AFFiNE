export { AIButtonProvider } from './provider/ai-button';
export { AIButtonService } from './services/ai-button';
export { AIDraftService } from './services/ai-draft';
export {
  type AIToolsConfig,
  AIToolsConfigService,
} from './services/tools-config';

import type { Framework } from '@toeverything/infra';

import { GraphQLService, ServerScope, SubscriptionService } from '../cloud';
import { FeatureFlagService } from '../feature-flag';
import { CacheStorage, GlobalStateService } from '../storage';
import { WorkspaceScope } from '../workspace';
import { AIButtonProvider } from './provider/ai-button';
import { AIButtonService } from './services/ai-button';
import { AIDraftService } from './services/ai-draft';
import { AIModelService } from './services/models';
import { AIPlaygroundService } from './services/playground';
import { AIReasoningService } from './services/reasoning';
import { AIToolsConfigService } from './services/tools-config';

export const configureAIButtonModule = (framework: Framework) => {
  framework.service(AIButtonService, container => {
    return new AIButtonService(container.getOptional(AIButtonProvider));
  });
};

export function configureAIReasoningModule(framework: Framework) {
  framework.service(AIReasoningService, [GlobalStateService]);
}

export function configureAIPlaygroundModule(framework: Framework) {
  framework.service(AIPlaygroundService, [FeatureFlagService]);
}

export function configureAIDraftModule(framework: Framework) {
  framework
    .scope(WorkspaceScope)
    .service(AIDraftService, [GlobalStateService, CacheStorage]);
}

export function configureAIToolsConfigModule(framework: Framework) {
  framework.service(AIToolsConfigService, [GlobalStateService]);
}

export function configureAIModelModule(framework: Framework) {
  framework
    .scope(ServerScope)
    .service(AIModelService, [
      GlobalStateService,
      GraphQLService,
      SubscriptionService,
    ]);
}
