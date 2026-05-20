import { Injectable } from '@nestjs/common';

import { CopilotProviderSideError, UserFriendlyError } from '../../../base';
import { CopilotProvider } from './provider';
import type {
  CopilotProviderExecution,
  ProviderDriverSpec,
} from './provider-runtime-contract';
import { CopilotProviderType } from './types';

export type FalConfig = {
  apiKey: string;
};

@Injectable()
export class FalProvider extends CopilotProvider<FalConfig> {
  override type = CopilotProviderType.FAL;

  protected resolveModelBackendKind() {
    return 'fal' as const;
  }

  override configured(execution?: CopilotProviderExecution): boolean {
    return !!this.getConfig(execution).apiKey;
  }

  private createNativeConfig(execution?: CopilotProviderExecution) {
    return {
      base_url: 'https://fal.run',
      auth_token: this.getConfig(execution).apiKey,
    };
  }

  override getDriverSpec(): ProviderDriverSpec {
    return {
      createBackendConfig: execution => this.createNativeConfig(execution),
      mapError: error => this.handleError(error),
      chat: false,
      structured: false,
      embedding: false,
      rerank: false,
      image: {},
    };
  }

  private handleError(e: any) {
    if (e instanceof UserFriendlyError) {
      // pass through user friendly errors
      return e;
    } else {
      const error = new CopilotProviderSideError({
        provider: this.type,
        kind: 'unexpected_response',
        message: e?.message || 'Unexpected fal response',
      });
      return error;
    }
  }
}
