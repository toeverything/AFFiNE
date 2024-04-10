import { ServerFeature } from '../../core/config';
import { PermissionService } from '../../core/workspaces/permission';
import { Plugin } from '../registry';
import { PromptService } from './prompt';
import {
  assertProvidersConfigs,
  CopilotProviderService,
  OpenAIProvider,
  registerCopilotProvider,
} from './providers';
import { ChatSessionService } from './session';

registerCopilotProvider(OpenAIProvider);

@Plugin({
  name: 'copilot',
  providers: [
    PermissionService,
    ChatSessionService,
    PromptService,
    CopilotProviderService,
  ],
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
