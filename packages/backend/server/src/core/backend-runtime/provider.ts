import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from '@nestjs/common';

import { Config, EventBus, OnEvent } from '../../base';
import { metrics } from '../../base/metrics';
import { BackendRuntime, type BackendRuntimeHealth } from '../../native';
import { BackendRuntimeOperations } from './copilot-operations';
import { recordPermissionTelemetry } from './telemetry';

export type {
  BlobManifestEntryV1,
  BlobManifestV1,
  BlobSourceV1,
  RuntimeInviteAbuseAction,
  RuntimeInviteAbuseClaimedAction,
  RuntimeMailDeliveryQuotaDecision,
  RuntimeMailDeliveryQuotaInput,
  RuntimeQuotaSourceInput,
  RuntimeQuotaTargetDomainInput,
  RuntimeSeatReservationDecision,
  RuntimeStorageReservationDecision,
  RuntimeStorageReservationInput,
  RuntimeStorageReservationMutation,
  RuntimeWorkspaceActionDecision,
  RuntimeWorkspaceInviteQuotaDecision,
  RuntimeWorkspaceInviteQuotaInput,
  RuntimeWorkspaceInviteQuotaUsage,
} from './contracts';

export const BACKEND_RUNTIME_CONFIG_PATHS = Symbol(
  'BACKEND_RUNTIME_CONFIG_PATHS'
);

export type RuntimeInvalidation =
  | {
      version: 1;
      kind: 'quotaEntitlement' | 'quotaStorageUsage';
      subject: string;
    }
  | {
      version: 1;
      kind: 'quotaOwnerMapping' | 'quotaSeatUsage';
      workspaceId: string;
    }
  | { version: 1; kind: 'blobSource'; source: unknown };

declare global {
  interface Events {
    'backendRuntime.invalidation': RuntimeInvalidation;
  }
}

function runtimeAuthConfig(config?: Config) {
  if (!config) return undefined;
  return JSON.stringify({ auth: config.auth, oauth: config.oauth });
}

@Injectable()
export class BackendRuntimeProvider
  extends BackendRuntimeOperations
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BackendRuntimeProvider.name);
  private migrationsStarted = false;

  constructor(
    @Optional() private readonly config?: Config,
    @Optional()
    @Inject(BACKEND_RUNTIME_CONFIG_PATHS)
    configPaths?: string[],
    @Optional() event?: EventBus
  ) {
    const runtime = new BackendRuntime(
      config?.crypto.privateKey,
      configPaths,
      (error: Error | null, event: string) =>
        recordPermissionTelemetry(error, event),
      runtimeAuthConfig(config),
      (error: Error | null, value: string) => {
        if (error || !event) return;
        event.emit(
          'backendRuntime.invalidation',
          JSON.parse(value) as RuntimeInvalidation
        );
      }
    );
    super(runtime);
    this.configureObjectStorage();
  }

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    this.configureObjectStorage();
    await this.runtime.start();
    const health = await this.health();
    this.logger.log(`backend runtime started: db=${health.databaseConnected}`);
  }

  /**
   * Schema changes belong to the explicit predeploy path. Runtime startup only
   * connects services and must not mutate the database schema.
   */
  async runMigrations() {
    await this.runMigrationsOnce();
  }

  async stop() {
    await this.runtime.stop();
    this.logger.log('backend runtime stopped');
  }

  @OnEvent('config.changed')
  async onConfigChanged({ updates }: Events['config.changed']) {
    if (
      !updates.copilot &&
      !updates.crypto &&
      !updates.db &&
      !updates.auth &&
      !updates.payment &&
      !updates.indexer &&
      !updates.storages
    ) {
      return;
    }
    await this.runtime.reloadConfig(
      this.config?.crypto.privateKey,
      this.objectStorageConfig(),
      runtimeAuthConfig(this.config)
    );
  }

  async health(): Promise<BackendRuntimeHealth> {
    const health = await this.runtime.health();
    const invalidation = health.invalidation;
    metrics.invalidation
      .gauge('state')
      .record(
        invalidation.state === 'healthy'
          ? 1
          : invalidation.state === 'degraded'
            ? -1
            : 0
      );
    for (const [name, value] of Object.entries({
      reconnects: invalidation.reconnects,
      decode_failures: invalidation.decodeFailures,
      received: invalidation.received,
      published: invalidation.published,
      publish_failures: invalidation.publishFailures,
    })) {
      metrics.invalidation.gauge(name).record(value);
    }
    return health;
  }

  private configureObjectStorage() {
    const config = this.objectStorageConfig();
    if (config) this.runtime.configureObjectStorage(config);
  }

  private objectStorageConfig() {
    if (!this.config) return undefined;
    return JSON.stringify({
      storages: {
        'blob.storage': this.config.storages.blob.storage,
        'avatar.storage': this.config.storages.avatar.storage,
      },
      copilot: { storage: this.config.copilot.storage },
    });
  }

  private async runMigrationsOnce() {
    if (this.migrationsStarted) {
      return;
    }
    await this.runtime.runMigrations();
    this.migrationsStarted = true;
  }
}
