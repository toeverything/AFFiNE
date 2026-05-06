import { createHash, createHmac, randomUUID } from 'node:crypto';

import { BadRequestException, Injectable } from '@nestjs/common';

import { BadRequest, Cache, CryptoHelper, metrics } from '../../../base';
import { Models } from '../../../models';
import type { CopilotProviderProfile } from '../config';
import { ByokEntitlementPolicy } from './policy';
import {
  BYOK_ALLOWED_PROVIDERS,
  type ByokFeatureKind,
  ByokKeyStorage,
  ByokKeyTestStatus,
  ByokProvider,
  ByokProviderSource,
  byokProviderToCopilotType,
  isByokProvider,
} from './types';

const LOCAL_LEASE_TTL_MS = 10 * 60 * 1000;
const BYOK_PROFILE_PRIORITY_BASE = 10_000;
const SERVER_PROFILE_PRIORITY_OFFSET = 2_000;
const TEST_TIMEOUT_MS = 10_000;

export type ByokProviderRequestContext = {
  userId?: string;
  workspaceId?: string;
  byokLeaseId?: string;
};

export type ByokProfileSourceFilter = {
  local?: boolean;
  server?: boolean;
};

export type ByokKeyConfig = {
  id: string;
  provider: ByokProvider;
  name: string;
  description: string | null;
  storage: ByokKeyStorage;
  configured: boolean;
  enabled: boolean;
  endpoint: string | null;
  endpointEditable: boolean;
  sortOrder: number;
  capabilities: string[];
  testStatus: ByokKeyTestStatus;
  disabledReason: string | null;
  lastTestedAt: Date | null;
  lastTestError: string | null;
  lastUsedAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
};

export type ByokSettings = {
  workspaceId: string;
  entitled: boolean;
  serverEntitled: boolean;
  localEntitled: boolean;
  entitlementRequired: string[];
  keys: ByokKeyConfig[];
  allowedProviders: ByokProvider[];
  localStorageSupported: boolean;
  customEndpointSupported: boolean;
  hasAiPlan: boolean;
  warnings: Array<{
    featureKind: string;
    reason: string;
    requiredProviders: ByokProvider[];
  }>;
};

export type ByokLocalLeaseProvider = {
  provider: ByokProvider;
  name: string;
  description?: string | null;
  apiKey: string;
  endpoint?: string | null;
  sortOrder?: number | null;
  enabled?: boolean | null;
};

type LocalLeasePayload = {
  workspaceId: string;
  userId: string;
  providers: Array<
    Omit<ByokLocalLeaseProvider, 'apiKey'> & { encryptedApiKey: string }
  >;
};

type LocalLeaseActive = {
  leaseId: string;
  expiresAt: string;
};

type ByokProfileMeta = {
  source: ByokProviderSource.Server | ByokProviderSource.Local;
  keyId?: string;
  provider: ByokProvider;
};

@Injectable()
export class ByokService {
  constructor(
    private readonly models: Models,
    private readonly crypto: CryptoHelper,
    private readonly cache: Cache,
    private readonly entitlement: ByokEntitlementPolicy
  ) {}

  get customEndpointSupported() {
    return env.selfhosted;
  }

  async getSettings(
    workspaceId: string,
    userId?: string
  ): Promise<ByokSettings> {
    if (!(await this.entitlement.hasManagementAccess(workspaceId, userId))) {
      return {
        workspaceId,
        entitled: false,
        serverEntitled: false,
        localEntitled: false,
        entitlementRequired: ['Workspace owner or admin'],
        keys: [],
        allowedProviders: [...BYOK_ALLOWED_PROVIDERS],
        localStorageSupported: false,
        customEndpointSupported: this.customEndpointSupported,
        hasAiPlan: await this.entitlement.hasAiPlan(userId),
        warnings: [],
      };
    }

    const [serverEntitled, localEntitled] =
      await this.entitlement.hasEntitlement(workspaceId, userId);
    const entitled = serverEntitled || localEntitled;
    if (!entitled) {
      return {
        workspaceId,
        entitled: false,
        serverEntitled: false,
        localEntitled: false,
        entitlementRequired: ['Pro', 'Team', 'Believer'],
        keys: [],
        allowedProviders: [...BYOK_ALLOWED_PROVIDERS],
        localStorageSupported: false,
        customEndpointSupported: this.customEndpointSupported,
        hasAiPlan: await this.entitlement.hasAiPlan(userId),
        warnings: [],
      };
    }

    const rows = serverEntitled
      ? await this.models.copilotWorkspaceByokConfig.list(workspaceId)
      : [];
    const keys = rows.map(row => this.toKeyConfig(row));

    return {
      workspaceId,
      entitled: true,
      serverEntitled,
      localEntitled,
      entitlementRequired: ['Pro', 'Team', 'Believer'],
      keys,
      allowedProviders: [...BYOK_ALLOWED_PROVIDERS],
      localStorageSupported: false,
      customEndpointSupported: this.customEndpointSupported,
      hasAiPlan: await this.entitlement.hasAiPlan(userId),
      warnings: this.buildWarnings(keys),
    };
  }

  async upsertConfig(input: {
    id?: string | null;
    workspaceId: string;
    provider: ByokProvider;
    name: string;
    description?: string | null;
    storage: ByokKeyStorage;
    apiKey?: string | null;
    endpoint?: string | null;
    sortOrder?: number | null;
    enabled?: boolean | null;
    userId?: string;
  }): Promise<ByokKeyConfig> {
    await this.entitlement.assertManagementAccess(
      input.workspaceId,
      input.userId
    );
    await this.entitlement.assertServerEntitled(input.workspaceId);
    this.assertProvider(input.provider);
    if (input.storage !== ByokKeyStorage.server) {
      throw new BadRequestException('Only server BYOK keys are persisted.');
    }
    const existing = input.id
      ? await this.models.copilotWorkspaceByokConfig.get(input.id)
      : null;
    if (input.id && (!existing || existing.workspaceId !== input.workspaceId)) {
      throw new BadRequest('BYOK config not found.');
    }
    const encryptedApiKey = input.apiKey
      ? this.crypto.encrypt(input.apiKey)
      : undefined;

    if (!input.id && !encryptedApiKey) {
      throw new BadRequestException('apiKey is required.');
    }

    const description =
      input.description !== undefined
        ? input.description?.trim() || null
        : (existing?.description ?? null);
    const endpoint =
      input.endpoint !== undefined
        ? this.normalizeEndpoint(input.endpoint)
        : (existing?.endpoint ?? null);
    const sortOrder = input.sortOrder ?? existing?.sortOrder ?? 0;
    const enabled = input.enabled ?? existing?.enabled ?? true;

    const row = await this.models.copilotWorkspaceByokConfig.upsert({
      id: input.id,
      workspaceId: input.workspaceId,
      provider: input.provider,
      name: input.name.trim(),
      description,
      encryptedApiKey,
      endpoint,
      sortOrder,
      enabled,
      userId: input.userId,
    });

    return this.toKeyConfig(row);
  }

  async reorderConfigs(input: {
    workspaceId: string;
    storage: ByokKeyStorage;
    ids: string[];
    userId?: string;
  }) {
    await this.entitlement.assertManagementAccess(
      input.workspaceId,
      input.userId
    );
    await this.entitlement.assertServerEntitled(input.workspaceId);
    if (input.storage !== ByokKeyStorage.server) {
      throw new BadRequestException('Only server BYOK keys are persisted.');
    }
    await this.models.copilotWorkspaceByokConfig.reorder(
      input.workspaceId,
      input.ids,
      input.userId
    );
    return (await this.getSettings(input.workspaceId, input.userId)).keys;
  }

  async deleteConfig(workspaceId: string, id: string, _userId?: string) {
    await this.entitlement.assertManagementAccess(workspaceId, _userId);
    await this.entitlement.assertServerEntitled(workspaceId);
    await this.models.copilotWorkspaceByokConfig.delete(workspaceId, id);
    return true;
  }

  async clearConfigs(
    workspaceId: string,
    provider: ByokProvider | null | undefined,
    _userId?: string
  ) {
    await this.entitlement.assertManagementAccess(workspaceId, _userId);
    await this.entitlement.assertServerEntitled(workspaceId);
    await this.models.copilotWorkspaceByokConfig.clear(workspaceId, provider);
    return true;
  }

  async testConfig(input: {
    workspaceId: string;
    provider: ByokProvider;
    storage: ByokKeyStorage;
    apiKey?: string | null;
    endpoint?: string | null;
    configId?: string | null;
    userId?: string;
  }) {
    await this.entitlement.assertManagementAccess(
      input.workspaceId,
      input.userId
    );
    if (input.storage === ByokKeyStorage.server) {
      await this.entitlement.assertServerEntitled(input.workspaceId);
    } else {
      await this.entitlement.assertLocalEntitled(
        input.workspaceId,
        input.userId
      );
    }
    this.assertProvider(input.provider);
    let apiKey = input.apiKey;
    let endpoint = this.normalizeEndpoint(input.endpoint);
    if (!apiKey && input.configId && input.storage === ByokKeyStorage.server) {
      const config = await this.models.copilotWorkspaceByokConfig.get(
        input.configId
      );
      if (
        !config ||
        config.workspaceId !== input.workspaceId ||
        config.provider !== input.provider
      ) {
        throw new BadRequestException('BYOK config not found.');
      }
      apiKey = this.crypto.decrypt(config.encryptedApiKey);
      endpoint =
        input.endpoint !== undefined
          ? endpoint
          : this.normalizeEndpoint(config.endpoint);
    }
    if (!apiKey) {
      throw new BadRequestException('apiKey is required.');
    }

    try {
      await this.runProviderProbe(input.provider, apiKey, endpoint);
      if (input.configId && input.storage === ByokKeyStorage.server) {
        await this.models.copilotWorkspaceByokConfig.markValidated(
          input.workspaceId,
          input.configId,
          input.userId
        );
      }
      metrics.ai.counter('byok_test_key').add(1, {
        workspace: input.workspaceId,
        provider: input.provider,
        storage: input.storage,
        result: 'passed',
      });
      return { ok: true, status: ByokKeyTestStatus.passed, message: null };
    } catch (error) {
      const message = this.sanitizeError(error);
      if (input.configId && input.storage === ByokKeyStorage.server) {
        await this.models.copilotWorkspaceByokConfig.markFailure(
          input.workspaceId,
          input.configId,
          message
        );
      }
      metrics.ai.counter('byok_test_key').add(1, {
        workspace: input.workspaceId,
        provider: input.provider,
        storage: input.storage,
        result: 'failed',
      });
      return { ok: false, status: ByokKeyTestStatus.failed, message };
    }
  }

  async createLocalLease(input: {
    workspaceId: string;
    providers: ByokLocalLeaseProvider[];
    userId: string;
  }) {
    await this.entitlement.assertManagementAccess(
      input.workspaceId,
      input.userId
    );
    await this.entitlement.assertLocalEntitled(input.workspaceId, input.userId);
    const providers = input.providers.map(provider => {
      this.assertProvider(provider.provider);
      const endpoint = this.normalizeEndpoint(provider.endpoint);
      return { ...provider, endpoint };
    });
    const activeCacheKey = this.localLeaseActiveCacheKey({
      ...input,
      providers,
    });
    const activeLease = await this.getActiveLocalLease(activeCacheKey);
    if (activeLease) return activeLease;

    const leaseId = randomUUID();
    const expiresAt = new Date(Date.now() + LOCAL_LEASE_TTL_MS);
    const payload: LocalLeasePayload = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      providers: providers.map(provider => ({
        provider: provider.provider,
        name: provider.name,
        description: provider.description,
        encryptedApiKey: this.crypto.encrypt(provider.apiKey),
        endpoint: provider.endpoint,
        sortOrder: provider.sortOrder,
        enabled: provider.enabled,
      })),
    };
    await this.cache.set(this.leaseCacheKey(leaseId), payload, {
      ttl: LOCAL_LEASE_TTL_MS,
    });
    const registered = await this.cache.setnx<LocalLeaseActive>(
      activeCacheKey,
      { leaseId, expiresAt: expiresAt.toISOString() },
      { ttl: LOCAL_LEASE_TTL_MS }
    );
    if (!registered) {
      const current = await this.getActiveLocalLease(activeCacheKey);
      if (current) {
        await this.cache.delete(this.leaseCacheKey(leaseId));
        return current;
      }
    }
    return { leaseId, expiresAt };
  }

  async getProfiles(
    context: ByokProviderRequestContext = {},
    sources: ByokProfileSourceFilter = { local: true, server: true }
  ): Promise<CopilotProviderProfile[]> {
    if (!context.workspaceId) {
      return [];
    }
    const [localEntitled, serverEntitled] = await Promise.all([
      this.entitlement.hasLocalEntitlement(context.workspaceId, context.userId),
      this.entitlement.hasServerEntitlement(context.workspaceId),
    ]);
    const [localProfiles, serverProfiles] = await Promise.all([
      sources.local && localEntitled
        ? this.getLocalProfiles(context)
        : Promise.resolve([]),
      sources.server && serverEntitled
        ? this.getServerProfiles(context.workspaceId)
        : Promise.resolve([]),
    ]);

    return [...localProfiles, ...serverProfiles];
  }

  async recordUsage(input: {
    workspaceId?: string;
    userId?: string;
    providerId?: string;
    model?: string | null;
    featureKind: ByokFeatureKind;
    sessionId?: string;
    taskId?: string;
    actionId?: string;
    billingUnitId?: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      cached_tokens?: number;
    };
  }) {
    if (!input.workspaceId || !input.providerId) return;
    const meta = this.parseProfileMeta(input.providerId, input.workspaceId);
    if (!meta) return;

    metrics.ai.counter('byok_usage').add(1, {
      workspace: input.workspaceId,
      provider: meta.provider,
      source: meta.source,
      feature: input.featureKind,
    });
    await this.models.copilotUsage.create({
      workspaceId: input.workspaceId,
      userId: input.userId,
      provider: meta.provider,
      providerSource: meta.source,
      featureKind: input.featureKind,
      model: input.model ?? null,
      sessionId: input.sessionId,
      taskId: input.taskId,
      actionId: input.actionId,
      billingUnitId: input.billingUnitId,
      promptTokens: input.usage?.prompt_tokens ?? 0,
      completionTokens: input.usage?.completion_tokens ?? 0,
      totalTokens: input.usage?.total_tokens ?? 0,
      cachedTokens: input.usage?.cached_tokens ?? 0,
    });
    if (meta.source === ByokProviderSource.Server && meta.keyId) {
      await this.models.copilotWorkspaceByokConfig.touchUsed(
        input.workspaceId,
        meta.keyId
      );
    }
  }

  async recordProviderFailure(input: {
    workspaceId?: string;
    providerId?: string;
    featureKind: ByokFeatureKind;
    error: unknown;
  }) {
    if (!input.workspaceId || !input.providerId) return;
    const meta = this.parseProfileMeta(input.providerId, input.workspaceId);
    if (!meta) return;

    const message = this.sanitizeError(input.error);
    metrics.ai.counter('byok_route_failure').add(1, {
      workspace: input.workspaceId,
      provider: meta.provider,
      source: meta.source,
      feature: input.featureKind,
    });
    if (meta.source === ByokProviderSource.Server && meta.keyId) {
      await this.models.copilotWorkspaceByokConfig.markFailure(
        input.workspaceId,
        meta.keyId,
        message
      );
    }
  }

  async getUsage(workspaceId: string, from: Date, to: Date) {
    return await this.models.copilotUsage.aggregateByDay({
      workspaceId,
      from,
      to,
      providerSources: [ByokProviderSource.Server, ByokProviderSource.Local],
    });
  }

  private async getServerProfiles(workspaceId: string) {
    const rows =
      await this.models.copilotWorkspaceByokConfig.listEnabled(workspaceId);

    return rows
      .filter(row => isByokProvider(row.provider))
      .map((row, index): CopilotProviderProfile => {
        const provider = row.provider as ByokProvider;
        return {
          id: this.profileId(workspaceId, provider, row.id, 'server'),
          type: byokProviderToCopilotType(provider),
          priority:
            BYOK_PROFILE_PRIORITY_BASE - SERVER_PROFILE_PRIORITY_OFFSET - index,
          config: this.providerConfig(
            provider,
            row.encryptedApiKey,
            row.endpoint
          ),
        } as CopilotProviderProfile;
      });
  }

  private async getLocalProfiles(context: ByokProviderRequestContext) {
    if (!context.byokLeaseId || !context.workspaceId || !context.userId) {
      return [];
    }
    if (
      !(await this.entitlement.hasManagementAccess(
        context.workspaceId,
        context.userId
      ))
    ) {
      return [];
    }
    const lease = await this.cache.get<LocalLeasePayload>(
      this.leaseCacheKey(context.byokLeaseId)
    );
    if (
      !lease ||
      lease.workspaceId !== context.workspaceId ||
      lease.userId !== context.userId
    ) {
      return [];
    }
    return lease.providers
      .filter(provider => provider.enabled !== false)
      .map((provider, index): CopilotProviderProfile => {
        return {
          id: this.profileId(
            context.workspaceId ?? lease.workspaceId,
            provider.provider,
            `${index}`,
            'local'
          ),
          type: byokProviderToCopilotType(provider.provider),
          priority: BYOK_PROFILE_PRIORITY_BASE - index,
          config: this.providerConfig(
            provider.provider,
            provider.encryptedApiKey,
            provider.endpoint ?? null
          ),
        } as CopilotProviderProfile;
      });
  }

  private providerConfig(
    provider: ByokProvider,
    encryptedApiKey: string,
    endpoint: string | null
  ) {
    const apiKey = this.crypto.decrypt(encryptedApiKey);
    switch (provider) {
      case ByokProvider.openai:
      case ByokProvider.gemini:
      case ByokProvider.anthropic:
        return { apiKey, ...(endpoint ? { baseURL: endpoint } : {}) };
      case ByokProvider.fal:
        return { apiKey };
    }
  }

  private profileId(
    workspaceId: string,
    provider: ByokProvider,
    keyId: string,
    storage: 'server' | 'local'
  ) {
    const hash = this.workspaceHash(workspaceId);
    const sanitizedKeyId = keyId.replaceAll(/[^a-zA-Z0-9-_]/g, '');
    return storage === 'local'
      ? `byok-${hash}-${provider}-local-${sanitizedKeyId}`
      : `byok-${hash}-${provider}-${sanitizedKeyId}`;
  }

  parseProfileMeta(
    providerId: string,
    workspaceId?: string
  ): ByokProfileMeta | null {
    const match =
      /^byok-([a-f0-9]{12})-(openai|anthropic|gemini|fal)-(.+)$/.exec(
        providerId
      );
    if (!match) return null;
    if (workspaceId && match[1] !== this.workspaceHash(workspaceId)) {
      return null;
    }

    const keyId = match[3];
    return {
      provider: match[2] as ByokProvider,
      source: keyId.startsWith('local-')
        ? ByokProviderSource.Local
        : ByokProviderSource.Server,
      keyId: keyId.startsWith('local-') ? undefined : keyId,
    };
  }

  private toKeyConfig(row: {
    id: string;
    provider: string;
    name: string;
    description: string | null;
    endpoint: string | null;
    sortOrder: number;
    enabled: boolean;
    disabledReason: string | null;
    lastValidatedAt: Date | null;
    lastValidationError: string | null;
    lastUsedAt: Date | null;
    lastErrorAt: Date | null;
    lastError: string | null;
  }): ByokKeyConfig {
    const provider = row.provider as ByokProvider;
    return {
      id: row.id,
      provider,
      name: row.name,
      description: row.description,
      storage: ByokKeyStorage.server,
      configured: true,
      enabled: row.enabled,
      endpoint: row.endpoint,
      endpointEditable: this.customEndpointSupported,
      sortOrder: row.sortOrder,
      capabilities: this.capabilities(provider, 'server'),
      testStatus: row.lastValidationError
        ? ByokKeyTestStatus.failed
        : row.lastValidatedAt
          ? ByokKeyTestStatus.passed
          : ByokKeyTestStatus.untested,
      disabledReason: row.disabledReason,
      lastTestedAt: row.lastValidatedAt,
      lastTestError: row.lastValidationError,
      lastUsedAt: row.lastUsedAt,
      lastErrorAt: row.lastErrorAt,
      lastError: row.lastError,
    };
  }

  private capabilities(provider: ByokProvider, storage: 'server' | 'local') {
    switch (provider) {
      case ByokProvider.openai:
        return ['Text', 'Image input', 'Actions', 'Image generate'];
      case ByokProvider.anthropic:
        return ['Text', 'Image input'];
      case ByokProvider.gemini:
        return storage === 'server'
          ? [
              'Text',
              'Image input',
              'Actions',
              'Image generate',
              'Transcript',
              'Indexing',
            ]
          : ['Text', 'Image input', 'Actions', 'Image generate'];
      case ByokProvider.fal:
        return ['Image generate'];
    }
  }

  private buildWarnings(keys: ByokKeyConfig[]) {
    const activeServerGemini = keys.some(
      key =>
        key.provider === ByokProvider.gemini &&
        key.storage === ByokKeyStorage.server &&
        key.enabled
    );
    if (activeServerGemini) {
      return [];
    }
    return [
      {
        featureKind: 'transcript',
        reason:
          'Transcript and workspace indexing require a server Gemini BYOK key or AFFiNE AI plan fallback.',
        requiredProviders: [ByokProvider.gemini],
      },
      {
        featureKind: 'workspace_indexing',
        reason:
          'Workspace indexing requires a server Gemini BYOK key or AFFiNE AI plan fallback.',
        requiredProviders: [ByokProvider.gemini],
      },
    ];
  }

  private normalizeEndpoint(endpoint?: string | null) {
    if (!endpoint) return null;
    if (!this.customEndpointSupported) {
      throw new BadRequestException('Custom BYOK endpoint is not supported.');
    }
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new BadRequestException('Invalid BYOK endpoint.');
    }
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new BadRequestException('BYOK endpoint must use HTTP or HTTPS.');
    }
    return parsed.toString().replace(/\/$/, '');
  }

  private assertProvider(provider: ByokProvider) {
    if (!BYOK_ALLOWED_PROVIDERS.includes(provider)) {
      throw new BadRequestException('Unsupported BYOK provider.');
    }
  }

  private async runProviderProbe(
    provider: ByokProvider,
    apiKey: string,
    endpoint: string | null
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      const request = this.buildProbeRequest(provider, apiKey, endpoint);
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers as unknown as Record<string, string>,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BadRequestException(
          this.providerProbeFailureMessage(response.status)
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildProbeRequest(
    provider: ByokProvider,
    apiKey: string,
    endpoint: string | null
  ) {
    switch (provider) {
      case ByokProvider.openai:
        return {
          method: 'GET',
          url: `${endpoint ?? 'https://api.openai.com/v1'}/models`,
          headers: { Authorization: `Bearer ${apiKey}` },
        };
      case ByokProvider.anthropic:
        return {
          method: 'GET',
          url: `${endpoint ?? 'https://api.anthropic.com/v1'}/models`,
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
        };
      case ByokProvider.gemini:
        return {
          method: 'GET',
          url: `${endpoint ?? 'https://generativelanguage.googleapis.com/v1beta'}/models`,
          headers: { 'x-goog-api-key': apiKey },
        };
      case ByokProvider.fal:
        return {
          method: 'GET',
          url: 'https://api.fal.ai/v1/models?limit=10',
          headers: { Authorization: `Key ${apiKey}` },
        };
    }
  }

  private sanitizeError(error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      return 'Provider key test timed out.';
    }
    if (error instanceof BadRequestException && error.message) {
      return error.message.slice(0, 300);
    }
    return 'Provider request failed.';
  }

  private providerProbeFailureMessage(status: number) {
    switch (status) {
      case 401:
        return 'Provider rejected the BYOK key.';
      case 403:
        return 'Provider rejected the BYOK key permissions.';
      case 404:
        return 'Provider probe endpoint was not found.';
      case 429:
        return 'Provider rate limit exceeded while testing the key.';
      default:
        return status >= 500
          ? 'Provider service is unavailable.'
          : `Provider key test failed with HTTP ${status}.`;
    }
  }

  private workspaceHash(workspaceId: string) {
    return createHash('sha256').update(workspaceId).digest('hex').slice(0, 12);
  }

  private leaseCacheKey(leaseId: string) {
    return `copilot:byok:lease:${leaseId}`;
  }

  private async getActiveLocalLease(activeCacheKey: string) {
    const active = await this.cache.get<LocalLeaseActive>(activeCacheKey);
    if (!active) return null;
    if (await this.cache.has(this.leaseCacheKey(active.leaseId))) {
      return { leaseId: active.leaseId, expiresAt: new Date(active.expiresAt) };
    }
    await this.cache.delete(activeCacheKey);
    return null;
  }

  private localLeaseActiveCacheKey(input: {
    workspaceId: string;
    userId: string;
    providers: ByokLocalLeaseProvider[];
  }) {
    const fingerprint = createHmac(
      'sha256',
      this.crypto.keyPair.sha256.privateKey
    )
      .update(
        JSON.stringify(
          input.providers.map(provider => ({
            provider: provider.provider,
            name: provider.name,
            description: provider.description ?? null,
            apiKey: provider.apiKey,
            endpoint: provider.endpoint ?? null,
            sortOrder: provider.sortOrder ?? 0,
            enabled: provider.enabled ?? true,
          }))
        )
      )
      .digest('hex');
    return `copilot:byok:lease:active:${input.workspaceId}:${input.userId}:${fingerprint}`;
  }
}
