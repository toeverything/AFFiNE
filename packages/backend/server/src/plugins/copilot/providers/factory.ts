import { Injectable, Logger } from '@nestjs/common';

import { Config } from '../../../base';
import { ServerFeature, ServerService } from '../../../core';
import type { CopilotProvider } from './provider';
import {
  buildProviderRegistry,
  resolveModel,
  stripProviderPrefix,
} from './provider-registry';
import { CopilotProviderType, ModelFullConditions } from './types';

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return (
    value !== null &&
    value !== undefined &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      'function'
  );
}

@Injectable()
export class CopilotProviderFactory {
  constructor(
    private readonly server: ServerService,
    private readonly config: Config
  ) {}

  private readonly logger = new Logger(CopilotProviderFactory.name);

  readonly #providers = new Map<string, CopilotProvider>();
  readonly #boundProviders = new Map<string, CopilotProvider>();
  readonly #providerIdsByType = new Map<CopilotProviderType, Set<string>>();

  private getRegistry() {
    return buildProviderRegistry(this.config.copilot.providers);
  }

  private getPreferredProviderIds(type?: CopilotProviderType) {
    if (!type) return undefined;
    return this.#providerIdsByType.get(type);
  }

  private normalizeCond(
    providerId: string,
    cond: ModelFullConditions
  ): ModelFullConditions {
    const registry = this.getRegistry();
    const modelId = stripProviderPrefix(registry, providerId, cond.modelId);
    return { ...cond, modelId };
  }

  private normalizeMethodArgs(providerId: string, args: unknown[]) {
    const [first, ...rest] = args;
    if (
      !first ||
      typeof first !== 'object' ||
      Array.isArray(first) ||
      !('modelId' in first)
    ) {
      return args;
    }

    const cond = first as Record<string, unknown>;
    if (typeof cond.modelId !== 'string') return args;

    const registry = this.getRegistry();
    const modelId = stripProviderPrefix(registry, providerId, cond.modelId);
    return [{ ...cond, modelId }, ...rest];
  }

  private wrapAsyncIterable<T>(
    provider: CopilotProvider,
    providerId: string,
    iterable: AsyncIterable<T>
  ): AsyncIterableIterator<T> {
    const iterator = iterable[Symbol.asyncIterator]();

    return {
      next: value =>
        provider.runWithProfile(providerId, () => iterator.next(value)),
      return: value =>
        provider.runWithProfile(providerId, async () => {
          if (typeof iterator.return === 'function') {
            return iterator.return(value as never);
          }
          return { done: true, value: value as T };
        }),
      throw: error =>
        provider.runWithProfile(providerId, async () => {
          if (typeof iterator.throw === 'function') {
            return iterator.throw(error);
          }
          throw error;
        }),
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }

  private getBoundProvider(providerId: string, provider: CopilotProvider) {
    const cached = this.#boundProviders.get(providerId);
    if (cached) {
      return cached;
    }

    const wrapped = new Proxy(provider, {
      get: (target, prop, receiver) => {
        if (prop === 'providerId') {
          return providerId;
        }

        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function') {
          return value;
        }

        return (...args: unknown[]) => {
          const normalizedArgs = this.normalizeMethodArgs(providerId, args);
          const result = provider.runWithProfile(providerId, () =>
            Reflect.apply(value, provider, normalizedArgs)
          );
          if (isAsyncIterable(result)) {
            return this.wrapAsyncIterable(
              provider,
              providerId,
              result as AsyncIterable<unknown>
            );
          }
          return result;
        };
      },
    }) as CopilotProvider;

    this.#boundProviders.set(providerId, wrapped);
    return wrapped;
  }

  async getProvider(
    cond: ModelFullConditions,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<CopilotProvider | null> {
    this.logger.debug(
      `Resolving copilot provider for output type: ${cond.outputType}`
    );
    const route = resolveModel({
      registry: this.getRegistry(),
      modelId: cond.modelId,
      outputType: cond.outputType,
      availableProviderIds: this.#providers.keys(),
      preferredProviderIds: this.getPreferredProviderIds(filter.prefer),
    });

    const registry = this.getRegistry();
    for (const providerId of route.candidateProviderIds) {
      const provider = this.#providers.get(providerId);
      if (!provider) continue;

      const profile = registry.profiles.get(providerId);
      const normalizedCond = this.normalizeCond(providerId, cond);
      if (
        normalizedCond.modelId &&
        profile?.models?.length &&
        !profile.models.includes(normalizedCond.modelId)
      ) {
        continue;
      }

      const matched = await provider.runWithProfile(providerId, () =>
        provider.match(normalizedCond)
      );
      if (!matched) continue;

      this.logger.debug(
        `Copilot provider candidate found: ${provider.type} (${providerId})`
      );
      return this.getBoundProvider(providerId, provider);
    }

    return null;
  }

  async getProviderByModel(
    modelId: string,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<CopilotProvider | null> {
    this.logger.debug(`Resolving copilot provider for model: ${modelId}`);
    return this.getProvider({ modelId }, filter);
  }

  register(providerId: string, provider: CopilotProvider) {
    const existed = this.#providers.get(providerId);
    if (existed?.type && existed.type !== provider.type) {
      const ids = this.#providerIdsByType.get(existed.type);
      ids?.delete(providerId);
      if (!ids?.size) {
        this.#providerIdsByType.delete(existed.type);
      }
    }

    this.#providers.set(providerId, provider);
    this.#boundProviders.delete(providerId);

    const ids = this.#providerIdsByType.get(provider.type) ?? new Set<string>();
    ids.add(providerId);
    this.#providerIdsByType.set(provider.type, ids);

    this.logger.log(
      `Copilot provider [${provider.type}] registered as [${providerId}].`
    );
    this.server.enableFeature(ServerFeature.Copilot);
  }

  unregister(providerId: string, provider: CopilotProvider) {
    const existed = this.#providers.get(providerId);
    if (!existed || existed !== provider) {
      return;
    }

    this.#providers.delete(providerId);
    this.#boundProviders.delete(providerId);

    const ids = this.#providerIdsByType.get(provider.type);
    ids?.delete(providerId);
    if (!ids?.size) {
      this.#providerIdsByType.delete(provider.type);
    }

    this.logger.log(
      `Copilot provider [${provider.type}] unregistered from [${providerId}].`
    );
    if (this.#providers.size === 0) {
      this.server.disableFeature(ServerFeature.Copilot);
    }
  }
}
