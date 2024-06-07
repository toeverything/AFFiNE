import assert from 'node:assert';

import { Injectable, Logger } from '@nestjs/common';

import { AFFiNEConfig, Config } from '../../../fundamentals';
import { CopilotStartupConfigurations } from '../config';
import {
  CapabilityToCopilotProvider,
  CopilotCapability,
  CopilotProvider,
  CopilotProviderType,
} from '../types';

type CopilotProviderConfig =
  CopilotStartupConfigurations[keyof CopilotStartupConfigurations];

interface CopilotProviderDefinition<C extends CopilotProviderConfig> {
  // constructor signature
  new (config: C): CopilotProvider;
  // type of the provider
  readonly type: CopilotProviderType;
  // capabilities of the provider, like text to text, text to image, etc.
  readonly capabilities: CopilotCapability[];
  // asserts that the config is valid for this provider
  assetsConfig(config: C): boolean;
}

// registered provider factory
const COPILOT_PROVIDER = new Map<
  CopilotProviderType,
  (config: Config, logger: Logger) => CopilotProvider
>();

// map of capabilities to providers
const PROVIDER_CAPABILITY_MAP = new Map<
  CopilotCapability,
  CopilotProviderType[]
>();

// config assertions for providers
const ASSERT_CONFIG = new Map<
  CopilotProviderType,
  (config: AFFiNEConfig) => void
>();

export function registerCopilotProvider<
  C extends CopilotProviderConfig = CopilotProviderConfig,
>(provider: CopilotProviderDefinition<C>) {
  const type = provider.type;

  const factory = (config: Config, logger: Logger) => {
    const providerConfig = config.plugins.copilot?.[type];
    if (!provider.assetsConfig(providerConfig as C)) {
      throw new Error(
        `Invalid configuration for copilot provider ${type}: ${JSON.stringify(providerConfig)}`
      );
    }
    const instance = new provider(providerConfig as C);
    logger.debug(
      `Copilot provider ${type} registered, capabilities: ${provider.capabilities.join(', ')}`
    );

    return instance;
  };
  // register the provider
  COPILOT_PROVIDER.set(type, factory);
  // register the provider capabilities
  for (const capability of provider.capabilities) {
    const providers = PROVIDER_CAPABILITY_MAP.get(capability) || [];
    if (!providers.includes(type)) {
      providers.push(type);
    }
    PROVIDER_CAPABILITY_MAP.set(capability, providers);
  }
  // register the provider config assertion
  ASSERT_CONFIG.set(type, (config: AFFiNEConfig) => {
    assert(config.plugins.copilot);
    const providerConfig = config.plugins.copilot[type];
    if (!providerConfig) return false;
    return provider.assetsConfig(providerConfig as C);
  });
}

export function unregisterCopilotProvider(type: CopilotProviderType) {
  COPILOT_PROVIDER.delete(type);
  ASSERT_CONFIG.delete(type);
  for (const providers of PROVIDER_CAPABILITY_MAP.values()) {
    const index = providers.indexOf(type);
    if (index !== -1) {
      providers.splice(index, 1);
    }
  }
}

/// Asserts that the config is valid for any registered providers
export function assertProvidersConfigs(config: AFFiNEConfig) {
  return (
    Array.from(ASSERT_CONFIG.values()).findIndex(assertConfig =>
      assertConfig(config)
    ) !== -1
  );
}

@Injectable()
export class CopilotProviderService {
  private readonly logger = new Logger(CopilotProviderService.name);
  constructor(private readonly config: Config) {}

  private readonly cachedProviders = new Map<
    CopilotProviderType,
    CopilotProvider
  >();

  private create(provider: CopilotProviderType): CopilotProvider {
    assert(this.config.plugins.copilot);
    const providerFactory = COPILOT_PROVIDER.get(provider);

    if (!providerFactory) {
      throw new Error(`Unknown copilot provider type: ${provider}`);
    }

    return providerFactory(this.config, this.logger);
  }

  getProvider(provider: CopilotProviderType): CopilotProvider {
    if (!this.cachedProviders.has(provider)) {
      this.cachedProviders.set(provider, this.create(provider));
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.cachedProviders.get(provider)!;
  }

  async getProviderByCapability<C extends CopilotCapability>(
    capability: C,
    model?: string,
    prefer?: CopilotProviderType
  ): Promise<CapabilityToCopilotProvider[C] | null> {
    const providers = PROVIDER_CAPABILITY_MAP.get(capability);
    if (Array.isArray(providers) && providers.length) {
      let selectedProvider: CopilotProviderType | undefined = prefer;
      let currentIndex = -1;

      if (!selectedProvider) {
        currentIndex = 0;
        selectedProvider = providers[currentIndex];
      }

      while (selectedProvider) {
        // find first provider that supports the capability and model
        if (providers.includes(selectedProvider)) {
          const provider = this.getProvider(selectedProvider);
          if (provider.getCapabilities().includes(capability)) {
            if (model) {
              if (await provider.isModelAvailable(model)) {
                return provider as CapabilityToCopilotProvider[C];
              }
            } else {
              return provider as CapabilityToCopilotProvider[C];
            }
          }
        }
        currentIndex += 1;
        selectedProvider = providers[currentIndex];
      }
    }
    return null;
  }

  async getProviderByModel<C extends CopilotCapability>(
    model: string,
    prefer?: CopilotProviderType
  ): Promise<CapabilityToCopilotProvider[C] | null> {
    const providers = Array.from(COPILOT_PROVIDER.keys());
    if (providers.length) {
      let selectedProvider: CopilotProviderType | undefined = prefer;
      let currentIndex = -1;

      if (!selectedProvider) {
        currentIndex = 0;
        selectedProvider = providers[currentIndex];
      }

      while (selectedProvider) {
        const provider = this.getProvider(selectedProvider);

        if (await provider.isModelAvailable(model)) {
          return provider as CapabilityToCopilotProvider[C];
        }

        currentIndex += 1;
        selectedProvider = providers[currentIndex];
      }
    }
    return null;
  }
}

export { FalProvider } from './fal';
export { OpenAIProvider } from './openai';
