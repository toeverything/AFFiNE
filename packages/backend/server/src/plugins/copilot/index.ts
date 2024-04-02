import { ServerFeature } from '../../core/config';
import { Plugin } from '../registry';
import { PromptService } from './prompt';
import { assertProvidersConfigs, CopilotProviderService } from './providers';

@Plugin({
  name: 'copilot',
  providers: [PromptService, CopilotProviderService],
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
