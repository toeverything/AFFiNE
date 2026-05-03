import type { LlmBackendConfig } from '../../../../native';
import type { CopilotProviderExecution } from '../provider-runtime-contract';
import { CopilotProviderType } from '../types';
import { getGoogleAuth, type VertexProviderConfig } from '../utils';
import { GeminiProvider } from './gemini';

export type GeminiVertexConfig = VertexProviderConfig;

export class GeminiVertexProvider extends GeminiProvider<GeminiVertexConfig> {
  override readonly type = CopilotProviderType.GeminiVertex;
  override configured(execution?: CopilotProviderExecution): boolean {
    const config = this.getConfig(execution);
    return !!config.location && !!config.googleAuthOptions;
  }
  protected async resolveVertexAuth(execution?: CopilotProviderExecution) {
    return await getGoogleAuth(this.getConfig(execution), 'google');
  }

  protected override async createNativeConfig(
    execution?: CopilotProviderExecution
  ): Promise<LlmBackendConfig> {
    const auth = await this.resolveVertexAuth(execution);
    const { Authorization: authHeader } = auth.headers();

    return {
      base_url: auth.baseUrl || '',
      auth_token: authHeader.replace(/^Bearer\s+/i, ''),
    };
  }
}
