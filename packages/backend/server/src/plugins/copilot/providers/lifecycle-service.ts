import { Injectable, Type } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import { OnEvent } from '../../../base';
import { CopilotProviderFactory } from './factory';
import type { CopilotProvider } from './provider';
import type { CopilotProviderExecution } from './provider-runtime-contract';
import { CopilotProviders } from './provider-tokens';
import { CopilotProviderRegistryService } from './registry-service';

@Injectable()
export class CopilotProviderLifecycleService {
  private readonly registeredByProvider = new WeakMap<
    CopilotProvider,
    Set<string>
  >();

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly factory: CopilotProviderFactory,
    private readonly registries: CopilotProviderRegistryService
  ) {}

  private getProviders(): CopilotProvider[] {
    return CopilotProviders.flatMap(token => {
      const provider = this.moduleRef.get(token as Type<CopilotProvider>, {
        strict: false,
      });
      return provider ? [provider] : [];
    });
  }

  private getRegisteredProviderIds(provider: CopilotProvider) {
    const current = this.registeredByProvider.get(provider);
    if (current) {
      return current;
    }

    const next = new Set<string>();
    this.registeredByProvider.set(provider, next);
    return next;
  }

  private async syncProvider(provider: CopilotProvider) {
    const registry = this.registries.getRegistry();
    const configuredIds = new Set<string>();

    for (const providerId of registry.byType.get(provider.type) ?? []) {
      const profile = registry.profiles.get(providerId);
      if (!profile) {
        continue;
      }

      const execution: CopilotProviderExecution = { providerId, profile };
      if (!provider.configured(execution)) {
        this.factory.unregister(providerId, provider);
        continue;
      }

      configuredIds.add(providerId);
      this.factory.register(providerId, provider);
    }

    const previous = this.getRegisteredProviderIds(provider);
    for (const providerId of previous) {
      if (!configuredIds.has(providerId)) {
        this.factory.unregister(providerId, provider);
      }
    }
    this.registeredByProvider.set(provider, configuredIds);
  }

  async syncProviders() {
    for (const provider of this.getProviders()) {
      await this.syncProvider(provider);
    }
  }

  @OnEvent('config.init')
  async onConfigInit() {
    await this.syncProviders();
  }

  @OnEvent('config.changed')
  async onConfigChanged(event: Events['config.changed']) {
    if ('copilot' in event.updates) {
      await this.syncProviders();
    }
  }
}
