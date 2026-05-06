import { CopilotProviderSideError, UserFriendlyError } from '../../../base';
import { type LlmBackendConfig } from '../../../native';
import { CopilotProvider } from './provider';
import {
  type CopilotProviderExecution,
  type ProviderDriverSpec,
} from './provider-runtime-contract';
import { CopilotProviderType } from './types';

export type CloudflareWorkersAIConfig = {
  apiToken: string;
  accountId?: string;
  baseURL?: string;
};

export class CloudflareWorkersAIProvider extends CopilotProvider<CloudflareWorkersAIConfig> {
  override readonly type = CopilotProviderType.CloudflareWorkersAi;

  protected resolveModelBackendKind() {
    return 'cloudflare_workers_ai' as const;
  }

  override configured(execution?: CopilotProviderExecution): boolean {
    const config = this.getConfig(execution);
    return !!config.apiToken && (!!config.accountId || !!config.baseURL);
  }
  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      return e;
    }
    return new CopilotProviderSideError({
      provider: this.type,
      kind: 'unexpected_response',
      message: e?.message || 'Unexpected cloudflare workers ai response',
    });
  }

  private createNativeConfig(
    execution?: CopilotProviderExecution
  ): LlmBackendConfig {
    const config = this.getConfig(execution);
    return {
      base_url: this.resolveBaseUrl(execution),
      auth_token: config.apiToken,
    };
  }

  private resolveBaseUrl(execution?: CopilotProviderExecution) {
    const config = this.getConfig(execution);
    if (config.baseURL) {
      return config.baseURL.replace(/\/v1\/?$/, '').replace(/\/$/, '');
    }
    const accountId = config.accountId ?? '';
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`;
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      structured: false,
      embedding: false,
    };
  }
}
