import { ServerFeature } from '../../core/config';
import { Plugin } from '../registry';
import { assertProvidersConfigs, CopilotProviderService } from './provider';

@Plugin({
  name: 'copilot',
  providers: [CopilotProviderService],
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
