import { Injectable, Logger } from '@nestjs/common';

import { ServerFeature, ServerService } from '../../../core';
import type { RequiredStructuredOutputContract } from '../runtime/contracts';
import { getProviderRuntimeHost } from '../runtime/provider-runtime-context';
import type { CopilotProvider } from './provider';
import {
  type NormalizedCopilotProviderProfile,
  resolveModel,
  stripProviderPrefix,
} from './provider-registry';
import type {
  CopilotProviderExecution,
  PreparedNativeEmbeddingExecution,
  PreparedNativeExecution,
  PreparedNativeImageExecution,
  PreparedNativeRerankExecution,
  PreparedNativeStructuredExecution,
} from './provider-runtime-contract';
import { CopilotProviderRegistryService } from './registry-service';
import {
  type CopilotChatOptions,
  type CopilotEmbeddingOptions,
  type CopilotImageOptions,
  CopilotProviderType,
  type CopilotRerankRequest,
  type CopilotStructuredOptions,
  ModelFullConditions,
  ModelOutputType,
  type PromptMessage,
} from './types';

export type ResolvedCopilotProvider = {
  providerId: string;
  provider: CopilotProvider;
  execution: CopilotProviderExecution;
  profile: NormalizedCopilotProviderProfile;
  rawModelId?: string;
  modelId?: string;
  explicitProviderId?: string;
  prepared?: PreparedNativeExecution;
  preparedStructured?: PreparedNativeStructuredExecution;
  preparedEmbedding?: PreparedNativeEmbeddingExecution;
  preparedRerank?: PreparedNativeRerankExecution;
  preparedImage?: PreparedNativeImageExecution;
};

type RoutePreparationResult = Partial<
  Pick<
    ResolvedCopilotProvider,
    | 'prepared'
    | 'preparedStructured'
    | 'preparedEmbedding'
    | 'preparedRerank'
    | 'preparedImage'
    | 'modelId'
  >
>;

@Injectable()
export class CopilotProviderFactory {
  constructor(
    private readonly server: ServerService,
    private readonly registries: CopilotProviderRegistryService
  ) {}

  private readonly logger = new Logger(CopilotProviderFactory.name);

  readonly #providers = new Map<string, CopilotProvider>();
  readonly #providerIdsByType = new Map<CopilotProviderType, Set<string>>();

  private getRegistry() {
    return this.registries.getRegistry();
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

  private filterPreparedRoutes(routes: Array<ResolvedCopilotProvider | null>) {
    return routes.filter(
      (route): route is ResolvedCopilotProvider => route !== null
    );
  }

  private async prepareResolvedRoutes(
    routes: ResolvedCopilotProvider[],
    prepare: (
      route: ResolvedCopilotProvider
    ) => Promise<RoutePreparationResult | null | undefined>
  ) {
    const preparedRoutes = await Promise.all(
      routes.map(async route => {
        const prepared = await prepare(route);
        return prepared ? { ...route, ...prepared } : null;
      })
    );

    return this.filterPreparedRoutes(preparedRoutes);
  }

  async resolveProvider(
    cond: ModelFullConditions,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<ResolvedCopilotProvider | null> {
    return (await this.resolveRoutes(cond, filter))[0] ?? null;
  }

  async resolveRoutes(
    cond: ModelFullConditions,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<ResolvedCopilotProvider[]> {
    this.logger.debug(
      `Resolving copilot provider for output type: ${cond.outputType}`
    );
    const registry = this.getRegistry();
    const route = resolveModel({
      registry,
      modelId: cond.modelId,
      outputType: cond.outputType,
      availableProviderIds: this.#providers.keys(),
      preferredProviderIds: this.getPreferredProviderIds(filter.prefer),
    });

    const resolved: ResolvedCopilotProvider[] = [];
    for (const providerId of route.candidateProviderIds) {
      const provider = this.#providers.get(providerId);
      const profile = registry.profiles.get(providerId);
      if (!provider || !profile) continue;

      const normalizedCond = this.normalizeCond(providerId, cond);
      if (
        normalizedCond.modelId &&
        profile.models?.length &&
        !profile.models.includes(normalizedCond.modelId)
      ) {
        continue;
      }

      const execution = { providerId, profile };
      const matched = await provider.match(normalizedCond, execution);
      if (!matched) continue;

      this.logger.debug(
        `Copilot provider candidate found: ${provider.type} (${providerId})`
      );
      resolved.push({
        providerId,
        provider,
        execution,
        profile,
        rawModelId: route.rawModelId,
        modelId: normalizedCond.modelId,
        explicitProviderId: route.explicitProviderId,
      });
    }

    return resolved;
  }

  async prepareRoutes(
    kind: 'text' | 'streamText' | 'streamObject',
    cond: ModelFullConditions,
    messages: PromptMessage[],
    options: CopilotChatOptions = {},
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<ResolvedCopilotProvider[]> {
    const routes = await this.resolveRoutes(cond, filter);
    return await this.prepareResolvedRoutes(routes, async route => {
      const prepared = await getProviderRuntimeHost(
        route.provider
      ).prepare.chat(
        kind,
        { ...cond, modelId: route.modelId },
        messages,
        options,
        route.execution
      );
      const normalizedPrepared = prepared?.route ? prepared : undefined;
      if (!normalizedPrepared) {
        return null;
      }

      return {
        modelId: normalizedPrepared.route.model,
        prepared: normalizedPrepared,
      };
    });
  }

  async prepareStructuredRoutes(
    cond: ModelFullConditions,
    messages: PromptMessage[],
    options: CopilotStructuredOptions = {},
    filter: {
      prefer?: CopilotProviderType;
    } = {},
    responseContract?: RequiredStructuredOutputContract
  ): Promise<ResolvedCopilotProvider[]> {
    const routes = await this.resolveRoutes(cond, filter);
    return await this.prepareResolvedRoutes(routes, async route => {
      const preparedStructured =
        (await getProviderRuntimeHost(route.provider).prepare.structured(
          { ...cond, modelId: route.modelId },
          messages,
          options,
          responseContract,
          route.execution
        )) ?? undefined;
      if (!preparedStructured) {
        return null;
      }

      return {
        modelId: preparedStructured.route.model,
        preparedStructured,
      };
    });
  }

  async prepareEmbeddingRoutes(
    modelId: string,
    input: string | string[],
    options: CopilotEmbeddingOptions = {}
  ): Promise<ResolvedCopilotProvider[]> {
    const routes = await this.resolveRoutes({
      modelId,
      outputType: ModelOutputType.Embedding,
    });
    return await this.prepareResolvedRoutes(routes, async route => {
      const preparedEmbedding =
        (await getProviderRuntimeHost(route.provider).prepare.embedding(
          { modelId: route.modelId },
          input,
          options,
          route.execution
        )) ?? undefined;
      if (!preparedEmbedding) {
        return null;
      }

      return {
        modelId: preparedEmbedding.route.model,
        preparedEmbedding,
      };
    });
  }

  async prepareRerankRoutes(
    modelId: string,
    request: CopilotRerankRequest,
    options: CopilotChatOptions = {}
  ): Promise<ResolvedCopilotProvider[]> {
    const routes = await this.resolveRoutes({
      modelId,
      outputType: ModelOutputType.Rerank,
    });
    return await this.prepareResolvedRoutes(routes, async route => {
      const preparedRerank =
        (await getProviderRuntimeHost(route.provider).prepare.rerank(
          { modelId: route.modelId },
          request,
          options,
          route.execution
        )) ?? undefined;
      if (!preparedRerank) {
        return null;
      }

      return {
        modelId: preparedRerank.route.model,
        preparedRerank,
      };
    });
  }

  async prepareImageRoutes(
    cond: ModelFullConditions,
    messages: PromptMessage[],
    options: CopilotImageOptions = {},
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<ResolvedCopilotProvider[]> {
    const routes = await this.resolveRoutes(cond, filter);
    return await this.prepareResolvedRoutes(routes, async route => {
      const preparedImage =
        (await getProviderRuntimeHost(route.provider).prepare.image(
          { ...cond, modelId: route.modelId },
          messages,
          options,
          route.execution
        )) ?? undefined;
      if (!preparedImage) {
        return null;
      }

      return {
        modelId: preparedImage.route.model,
        preparedImage,
      };
    });
  }

  async getProvider(
    cond: ModelFullConditions,
    filter: {
      prefer?: CopilotProviderType;
    } = {}
  ): Promise<CopilotProvider | null> {
    return (await this.resolveProvider(cond, filter))?.provider ?? null;
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
