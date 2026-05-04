import { CopilotProviderSideError, UserFriendlyError } from '../../../base';
import { type LlmBackendConfig } from '../../../native';
import { CopilotProvider } from './provider';
import {
  type CopilotProviderExecution,
  type ProviderDriverSpec,
} from './provider-runtime-contract';
import { CopilotProviderType, ModelOutputType } from './types';

export const DEFAULT_DIMENSIONS = 256;

export type MorphConfig = {
  apiKey?: string;
};

export class MorphProvider extends CopilotProvider<MorphConfig> {
  readonly type = CopilotProviderType.Morph;

  protected resolveModelBackendKind() {
    return 'morph' as const;
  }

  override configured(execution?: CopilotProviderExecution): boolean {
    return !!this.getConfig(execution).apiKey;
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected morph response',
    });
  }

  private createNativeConfig(
    execution?: CopilotProviderExecution
  ): LlmBackendConfig {
    return {
      base_url: 'https://api.morphllm.com',
      auth_token: this.getConfig(execution).apiKey ?? '',
    };
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: {
        resolveOutputType: kind =>
          kind === 'streamObject' ? null : ModelOutputType.Text,
      },
      structured: false,
      embedding: false,
      rerank: false,
    };
  }
}
