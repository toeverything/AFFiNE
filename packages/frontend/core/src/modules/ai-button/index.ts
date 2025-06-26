export { AIButtonProvider } from './provider/ai-button';
export { AIButtonService } from './services/ai-button';

import type { Framework } from '@toeverything/infra';

import { FeatureFlagService } from '../feature-flag';
import { GlobalStateService } from '../storage';
import { AIButtonProvider } from './provider/ai-button';
import { AIButtonService } from './services/ai-button';
import { AINetworkSearchService } from './services/network-search';
import { AIPlaygroundService } from './services/playground';
import { AIReasoningService } from './services/reasoning';

export const configureAIButtonModule = (framework: Framework) => {
  framework.service(AIButtonService, container => {
    return new AIButtonService(container.getOptional(AIButtonProvider));
  });
};

export function configureAINetworkSearchModule(framework: Framework) {
  framework.service(AINetworkSearchService, [
    GlobalStateService,
    FeatureFlagService,
  ]);
}

export function configureAIReasoningModule(framework: Framework) {
  framework.service(AIReasoningService, [GlobalStateService]);
}

export function configureAIPlaygroundModule(framework: Framework) {
  framework.service(AIPlaygroundService, [FeatureFlagService]);
}
