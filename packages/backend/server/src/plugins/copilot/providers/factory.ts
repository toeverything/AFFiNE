import { Injectable, Logger } from '@nestjs/common';

import { ServerFeature, ServerService } from '../../../core';
import type { FalProvider } from './fal';
import type { GeminiProvider } from './gemini';
import type { OpenAIProvider } from './openai';
import type { PerplexityProvider } from './perplexity';
import type { CopilotProvider } from './provider';
import {
  CapabilityToCopilotProvider,
  CopilotCapability,
  CopilotProviderType,
} from './types';

type TypedProvider = {
  [CopilotProviderType.Gemini]: GeminiProvider;
  [CopilotProviderType.OpenAI]: OpenAIProvider;
  [CopilotProviderType.Perplexity]: PerplexityProvider;
  [CopilotProviderType.FAL]: FalProvider;
};

@Injectable()
export class CopilotProviderFactory {
  constructor(private readonly server: ServerService) {}

  private readonly logger = new Logger(CopilotProviderFactory.name);

  readonly #providers = new Map<CopilotProviderType, CopilotProvider>();

  getProvider<P extends CopilotProviderType>(provider: P): TypedProvider[P] {
    return this.#providers.get(provider) as TypedProvider[P];
  }

  async getProviderByCapability<C extends CopilotCapability>(
    capability: C,
    filter: {
      model?: string;
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<CapabilityToCopilotProvider[C] | null> {
    this.logger.debug(
      `Resolving copilot provider for capability: ${capability}`
    );
    let candidate: CopilotProvider | null = null;
    for (const [type, provider] of this.#providers.entries()) {
      // we firstly match by capability
      if (provider.capabilities.includes(capability)) {
        // use the first match if no filter provided
        if (!filter.model && !filter.prefer) {
          candidate = provider;
          this.logger.debug(`Copilot provider candidate found: ${type}`);
          break;
        }

        if (
          (!filter.model || (await provider.isModelAvailable(filter.model))) &&
          (!filter.prefer || filter.prefer === type)
        ) {
          candidate = provider;
          this.logger.debug(`Copilot provider candidate found: ${type}`);
          break;
        }
      }
    }

    return candidate as CapabilityToCopilotProvider[C] | null;
  }

  async getProviderByModel<C extends CopilotCapability>(
    model: string,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<CapabilityToCopilotProvider[C] | null> {
    this.logger.debug(`Resolving copilot provider for model: ${model}`);

    let candidate: CopilotProvider | null = null;
    for (const [type, provider] of this.#providers.entries()) {
      // we firstly match by model
      if (await provider.isModelAvailable(model)) {
        candidate = provider;
        this.logger.debug(`Copilot provider candidate found: ${type}`);

        // then we match by prefer filter
        if (!filter.prefer || filter.prefer === type) {
          candidate = provider;
        }
      }
    }

    return candidate as CapabilityToCopilotProvider[C] | null;
  }

  register(provider: CopilotProvider) {
    this.#providers.set(provider.type, provider);
    this.logger.log(`Copilot provider [${provider.type}] registered.`);
    this.server.enableFeature(ServerFeature.Copilot);
  }

  unregister(provider: CopilotProvider) {
    this.#providers.delete(provider.type);
    this.logger.log(`Copilot provider [${provider.type}] unregistered.`);
    if (this.#providers.size === 0) {
      this.server.disableFeature(ServerFeature.Copilot);
    }
  }
}
