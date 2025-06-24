import { Injectable, Logger } from '@nestjs/common';

import { SearchProviderNotFound } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { SearchProviderType } from './config';
import type { SearchProvider } from './providers/def';

@Injectable()
export class SearchProviderFactory {
  constructor(private readonly server: ServerService) {}

  private readonly logger = new Logger(SearchProviderFactory.name);
  readonly #providers = new Map<SearchProviderType, SearchProvider>();
  #providerType: SearchProviderType | undefined;

  get(): SearchProvider {
    const provider =
      this.#providerType && this.#providers.get(this.#providerType);
    if (!provider) {
      throw new SearchProviderNotFound();
    }
    return provider;
  }

  register(provider: SearchProvider) {
    if (this.#providers.has(provider.type)) {
      return;
    }
    this.#providerType = provider.type;
    this.#providers.set(provider.type, provider);
    this.logger.log(`Search provider [${provider.type}] registered.`);
    this.server.enableFeature(ServerFeature.Indexer);
  }

  unregister(provider: SearchProvider) {
    if (!this.#providers.has(provider.type)) {
      return;
    }
    this.#providers.delete(provider.type);
    this.logger.log(`Search provider [${provider.type}] unregistered.`);
    if (this.#providers.size === 0) {
      this.server.disableFeature(ServerFeature.Indexer);
    }
  }
}
