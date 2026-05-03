import { CopilotProviderSideError, UserFriendlyError } from '../../../../base';
import {
  type LlmBackendConfig,
  llmResolveRequestIntentOptions,
} from '../../../../native';
import { CopilotProvider } from '../provider';
import { hasProviderModelBehaviorFlag } from '../provider-model-runtime';
import {
  type CopilotProviderExecution,
  type ProviderDriverSpec,
} from '../provider-runtime-contract';
import { CopilotProviderType } from '../types';
import {
  getGoogleAuth,
  getVertexAnthropicBaseUrl,
  type VertexAnthropicProviderConfig,
} from '../utils';

export abstract class AnthropicProvider<T> extends CopilotProvider<T> {
  protected resolveModelBackendKind() {
    return this.type === CopilotProviderType.AnthropicVertex
      ? ('anthropic_vertex' as const)
      : ('anthropic' as const);
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: {
        resolveRequestOptions: async context => {
          const requestIntent = await llmResolveRequestIntentOptions({
            protocol: context.protocol,
            backendConfig: context.backendConfig,
            reasoning: {
              enabled: context.options.reasoning,
              supported: hasProviderModelBehaviorFlag(
                context.model,
                'reasoning_budget_12000'
              ),
              budgetTokens: hasProviderModelBehaviorFlag(
                context.model,
                'reasoning_budget_12000'
              )
                ? 12000
                : undefined,
            },
          });

          return {
            attachmentCapability: this.getAttachCapability(
              context.model,
              context.outputType
            ),
            reasoning: requestIntent.reasoning,
          };
        },
      },
      structured: false,
      embedding: false,
      rerank: false,
    };
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected anthropic response',
    });
  }

  private async createNativeConfig(
    execution?: CopilotProviderExecution
  ): Promise<LlmBackendConfig> {
    const config = this.getConfig(execution);
    if (this.type === CopilotProviderType.AnthropicVertex) {
      const vertexConfig = config as VertexAnthropicProviderConfig;
      const auth = await getGoogleAuth(vertexConfig, 'anthropic');
      const { Authorization: authHeader } = auth.headers();
      const token = authHeader.replace(/^Bearer\s+/i, '');
      const baseUrl = getVertexAnthropicBaseUrl(vertexConfig) || auth.baseUrl;
      return {
        base_url: baseUrl || '',
        auth_token: token,
        headers: { Authorization: authHeader },
      };
    }

    const officialConfig = config as { apiKey: string; baseURL?: string };
    const baseUrl = officialConfig.baseURL || 'https://api.anthropic.com/v1';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: officialConfig.apiKey,
    };
  }
}
