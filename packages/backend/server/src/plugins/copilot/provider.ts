import assert from 'node:assert';

import { Injectable } from '@nestjs/common';

import { Config } from '../../fundamentals';
import {
  CapabilityToCopilotProvider,
  CopilotConfig,
  CopilotProvider,
  CopilotProviderCapability,
  CopilotProviderType,
} from './types';

type CopilotProviderConfig = CopilotConfig[keyof CopilotConfig];

interface CopilotProviderDefinition<C extends CopilotProviderConfig> {
  // constructor signature
  new (config: C): CopilotProvider;
  // type of the provider
  readonly type: CopilotProviderType;
  // capabilities of the provider, like text to text, text to image, etc.
  readonly capabilities: CopilotProviderCapability[];
  // asserts that the config is valid for this provider
  assetsConfig(config: C): boolean;
}

// registered provider factory
const COPILOT_PROVIDER = new Map<
  CopilotProviderType,
  (config: Config) => CopilotProvider
>();

// map of capabilities to providers
const PROVIDER_CAPABILITY_MAP = new Map<
  CopilotProviderCapability,
  CopilotProviderType[]
>();

// config assertions for providers
const ASSERT_CONFIG = new Map<CopilotProviderType, (config: Config) => void>();

export function registerCopilotProvider<
  C extends CopilotProviderConfig = CopilotProviderConfig,
>(provider: CopilotProviderDefinition<C>) {
  const factory = (config: Config) => {
    assert(config.plugins.copilot);
    assert(config.plugins.copilot[provider.type]);

    return new provider(config.plugins.copilot[provider.type] as C);
  };
  // register the provider
  COPILOT_PROVIDER.set(provider.type, factory);
  // register the provider capabilities
  for (const capability of provider.capabilities) {
    const providers = PROVIDER_CAPABILITY_MAP.get(capability) || [];
    if (!providers.includes(provider.type)) {
      providers.push(provider.type);
    }
    PROVIDER_CAPABILITY_MAP.set(capability, providers);
  }
  // register the provider config assertion
  ASSERT_CONFIG.set(provider.type, (config: Config) => {
    assert(config.plugins.copilot);
    const providerConfig = config.plugins.copilot[provider.type];
    if (!providerConfig) return false;
    return provider.assetsConfig(providerConfig as C);
  });
}

/// Asserts that the config is valid for any registered providers
export function assertProvidersConfigs(config: Config) {
  return (
    Array.from(ASSERT_CONFIG.values()).findIndex(assertConfig =>
      assertConfig(config)
    ) !== -1
  );
}

@Injectable()
export class CopilotProviderService {
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

    return providerFactory(this.config);
  }

  getProvider(provider: CopilotProviderType): CopilotProvider {
    if (!this.cachedProviders.has(provider)) {
      this.cachedProviders.set(provider, this.create(provider));
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.cachedProviders.get(provider)!;
  }

  getProviderByCapability<C extends CopilotProviderCapability>(
    capability: C,
    prefer?: CopilotProviderType
  ): CapabilityToCopilotProvider[C] | null {
    const providers = PROVIDER_CAPABILITY_MAP.get(capability);
    if (Array.isArray(providers) && providers.length) {
      const selectedCapability =
        prefer && providers.includes(prefer) ? prefer : providers[0];

      const provider = this.getProvider(selectedCapability);
      assert(provider.getCapabilities().includes(capability));

      return provider as CapabilityToCopilotProvider[C];
    }
    return null;
  }
}
