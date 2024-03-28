import { ServerFeature } from '../../core/config';
import { Plugin } from '../registry';
import { CopilotController } from './controller';
import { PromptService } from './prompt';
import { assertProvidersConfigs, ProviderService } from './providers';
import { ChatSessionService } from './session';

@Plugin({
  name: 'copilot',
  providers: [ChatSessionService, PromptService, ProviderService],
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
