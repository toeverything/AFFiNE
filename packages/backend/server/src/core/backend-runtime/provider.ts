import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { wrapCallMetric } from '../../base/metrics';
import { BackendRuntime, type BackendRuntimeHealth } from '../../native';

type RuntimeInstance = InstanceType<typeof BackendRuntime>;

@Injectable()
export class BackendRuntimeProvider
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(BackendRuntimeProvider.name);
  private readonly runtime: RuntimeInstance = new BackendRuntime();
  private migrationsStarted = false;

  async onApplicationBootstrap() {
    await this.start();
  }

  async onApplicationShutdown() {
    await this.stop();
  }

  async start() {
    await this.runtime.start();
    await this.runMigrationsOnce();
    const health = await this.runtime.health();
    this.logger.log(`backend runtime started: db=${health.databaseConnected}`);
  }

  async stop() {
    await this.runtime.stop();
    this.logger.log('backend runtime stopped');
  }

  async health(): Promise<BackendRuntimeHealth> {
    return await this.runtime.health();
  }

  async cleanupExpiredSnapshotHistories(limit: number) {
    return await this.measured('cleanupExpiredSnapshotHistories', rt =>
      rt.cleanupExpiredSnapshotHistories(limit)
    );
  }

  async cleanupExpiredUserSessions(limit: number) {
    return await this.measured('cleanupExpiredUserSessions', rt =>
      rt.cleanupExpiredUserSessions(limit)
    );
  }

  async cleanupExpiredRuntimeStates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeStates', rt =>
      rt.cleanupExpiredRuntimeStates(limit)
    );
  }

  async cleanupExpiredRuntimeGates(limit: number) {
    return await this.measured('cleanupExpiredRuntimeGates', rt =>
      rt.cleanupExpiredRuntimeGates(limit)
    );
  }

  private async measured<T>(
    method: string,
    fn: (runtime: RuntimeInstance) => Promise<T>
  ): Promise<T> {
    return await wrapCallMetric(
      () => fn(this.runtime),
      'storage',
      'backend_runtime',
      { method }
    )();
  }

  private async runMigrationsOnce() {
    if (this.migrationsStarted) {
      return;
    }
    await this.runtime.runMigrations();
    this.migrationsStarted = true;
  }
}
