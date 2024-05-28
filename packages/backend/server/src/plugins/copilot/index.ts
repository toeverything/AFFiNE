import './config';

import { ServerFeature } from '../../core/config';
import { FeatureModule } from '../../core/features';
import { QuotaModule } from '../../core/quota';
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
import { CopilotStorage } from './storage';

registerCopilotProvider(FalProvider);
registerCopilotProvider(OpenAIProvider);

@Plugin({
  name: 'copilot',
  imports: [FeatureModule, QuotaModule],
  providers: [
    PermissionService,
    ChatSessionService,
    CopilotResolver,
    ChatMessageCache,
    UserCopilotResolver,
    PromptService,
    CopilotProviderService,
    CopilotStorage,
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
