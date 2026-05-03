import { CopilotProviderSideError } from '../../../base';
import { type LlmBackendConfig } from '../../../native';
import { CopilotProvider } from './provider';
import { hasProviderModelBehaviorFlag } from './provider-model-runtime';
import {
  type CopilotProviderExecution,
  type ProviderDriverSpec,
} from './provider-runtime-contract';
import { CopilotProviderType, ModelOutputType } from './types';

export type PerplexityConfig = {
  apiKey: string;
  endpoint?: string;
};

export class PerplexityProvider extends CopilotProvider<PerplexityConfig> {
  readonly type = CopilotProviderType.Perplexity;

  protected resolveModelBackendKind() {
    return 'perplexity' as const;
  }

  override configured(execution?: CopilotProviderExecution): boolean {
    return !!this.getConfig(execution).apiKey;
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: {
        resolveOutputType: kind =>
          kind === 'streamObject' ? null : ModelOutputType.Text,
        withAttachment: false,
        resolveRequestOptions: async context => ({
          withAttachment: !hasProviderModelBehaviorFlag(
            context.model,
            'no_attachments'
          ),
          include: hasProviderModelBehaviorFlag(
            context.model,
            'citations_include'
          )
            ? ['citations']
            : undefined,
        }),
      },
      structured: false,
      embedding: false,
      rerank: false,
    };
  }

  private createNativeConfig(
    execution?: CopilotProviderExecution
  ): LlmBackendConfig {
    const config = this.getConfig(execution);
    const baseUrl = config.endpoint || 'https://api.perplexity.ai';
    return {
      base_url: baseUrl.replace(/\/v1\/?$/, ''),
      auth_token: config.apiKey,
    };
  }

  private handleError(e: any) {
    if (e instanceof CopilotProviderSideError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected perplexity response',
    });
  }
}
