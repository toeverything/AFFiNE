import type { CopilotProviderExecution } from '../provider-runtime-contract';
import { CopilotProviderType } from '../types';
import { getVertexAnthropicBaseUrl, type VertexProviderConfig } from '../utils';
import { AnthropicProvider } from './anthropic';

export type AnthropicVertexConfig = VertexProviderConfig;

export class AnthropicVertexProvider extends AnthropicProvider<AnthropicVertexConfig> {
  override readonly type = CopilotProviderType.AnthropicVertex;

  override configured(execution?: CopilotProviderExecution): boolean {
    const config = this.getConfig(execution);
    if (!config.location || !config.googleAuthOptions) return false;
    return !!config.project || !!getVertexAnthropicBaseUrl(config);
  }
}
