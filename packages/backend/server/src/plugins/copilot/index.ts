import { ServerFeature } from '../../core/config';
import { FeatureManagementService, FeatureService } from '../../core/features';
import { QuotaService } from '../../core/quota';
import { PermissionService } from '../../core/workspaces/permission';
import { Plugin } from '../registry';
import { CopilotController } from './controller';
import { ChatMessageCache } from './message';
import { PromptService } from './prompt';
import {
  assertProvidersConfigs,
  CopilotProviderService,
  FalProvider,
  OpenAIProvider,
  registerCopilotProvider,
} from './providers';
import { CopilotResolver, UserCopilotResolver } from './resolver';
import { ChatSessionService } from './session';

registerCopilotProvider(FalProvider);
registerCopilotProvider(OpenAIProvider);

@Plugin({
  name: 'copilot',
  providers: [
    PermissionService,
    FeatureService,
    FeatureManagementService,
    QuotaService,
    ChatSessionService,
    CopilotResolver,
    ChatMessageCache,
    UserCopilotResolver,
    PromptService,
    CopilotProviderService,
  ],
  controllers: [CopilotController],
  contributesTo: ServerFeature.Copilot,
  if: config => {
    if (config.flavor.graphql) {
      return assertProvidersConfigs(config);
    }
    return false;
  },
})
export class CopilotModule {}

export type { CopilotConfig } from './types';
