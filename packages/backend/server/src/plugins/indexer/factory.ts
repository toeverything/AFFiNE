import { Injectable, Logger } from '@nestjs/common';

import { SearchProviderNotFound } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { SearchProviderName } from './config';
import type { SearchProvider } from './providers/def';

@Injectable()
export class SearchProviderFactory {
  constructor(private readonly server: ServerService) {}

  private readonly logger = new Logger(SearchProviderFactory.name);
  readonly #providers = new Map<SearchProviderName, SearchProvider>();
  #providerName: SearchProviderName | undefined;

  get(): SearchProvider {
    const provider =
      this.#providerName && this.#providers.get(this.#providerName);
    if (!provider) {
      throw new SearchProviderNotFound();
    }
    return provider;
  }

  register(provider: SearchProvider) {
    this.#providerName = provider.provider;
    this.#providers.set(provider.provider, provider);
    this.logger.log(`Search provider [${provider.provider}] registered.`);
    this.server.enableFeature(ServerFeature.Indexer);
  }

  unregister(provider: SearchProvider) {
    this.#providers.delete(provider.provider);
    this.logger.log(`Search provider [${provider.provider}] unregistered.`);
    if (this.#providers.size === 0) {
      this.server.disableFeature(ServerFeature.Indexer);
    }
  }
}
