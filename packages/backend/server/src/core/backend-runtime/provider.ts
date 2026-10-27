import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  Optional,
} from '@nestjs/common';

import { EventBus, OnEvent } from '../../base';
import { metrics } from '../../base/metrics';
import {
  type AppConfigCommand,
  BackendRuntime,
  type BackendRuntimeHealth,
  ServerConfigHandle,
} from '../../native';
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
    'backendRuntime.configApplied': {
      updates: DeepPartial<AppConfig>;
    };
  }
}

@Injectable()
export class BackendRuntimeProvider
  extends BackendRuntimeOperations
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BackendRuntimeProvider.name);
  private migrationsStarted = false;

  constructor(
    serverConfig: ServerConfigHandle,
    @Optional() private readonly event?: EventBus
  ) {
    const runtime = new BackendRuntime(
      serverConfig,
      undefined,
      (error: Error | null, event: string) =>
        recordPermissionTelemetry(error, event),
      (error: Error | null, value: string) => {
        if (error || !event) return;
        event.emit(
          'backendRuntime.invalidation',
          JSON.parse(value) as RuntimeInvalidation
        );
      }
    );
    super(runtime);
  }

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    await this.runtime.start();
    await this.event?.emitAsync('backendRuntime.configApplied', {
      updates: { payment: {}, indexer: {}, copilot: {}, crypto: {}, oauth: {} },
    });
    const health = await this.health();
    this.logger.log(`backend runtime started: db=${health.databaseConnected}`);
  }

  async saveAppConfig(actor: string | null, commands: AppConfigCommand[]) {
    return await this.measured('saveAppConfig', runtime =>
      runtime.saveAppConfig(actor, commands)
    );
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
      !updates.oauth &&
      !updates.payment &&
      !updates.indexer &&
      !updates.storages
    ) {
      return;
    }
    try {
      await this.runtime.reloadConfig();
      await this.event?.emitAsync('backendRuntime.configApplied', { updates });
    } catch (error) {
      this.logger.error(
        `Failed to apply committed native config: ${error instanceof Error ? error.name : 'unknown'}`
      );
    }
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

  private async runMigrationsOnce() {
    if (this.migrationsStarted) {
      return;
    }
    await this.runtime.runMigrations();
    this.migrationsStarted = true;
  }
}
