import { Logger } from '@nestjs/common';

import { extractWorkspaceLifecycleRootPages } from '../../native';
import type { RuntimeInstance } from './contracts';

export class WorkspaceLifecycleMigration {
  private readonly logger = new Logger(WorkspaceLifecycleMigration.name);
  private readonly pending = new Map<string, Promise<void>>();
  private sweep?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly runtime: Pick<
      RuntimeInstance,
      | 'listWorkspaceLifecycleMigrationCandidatesV1'
      | 'prepareWorkspaceLifecycleMigrationV1'
      | 'migrateWorkspaceLifecycleV1'
    >,
    private readonly options?: { maxStructs?: number }
  ) {}

  start() {
    this.stopped = false;
    void this.run().catch((error: unknown) => {
      this.logger.error('Workspace lifecycle migration sweep stopped', error);
    });
  }

  async stop() {
    this.stopped = true;
    await this.sweep?.catch(() => {});
    await Promise.allSettled(this.pending.values());
  }

  async ensure(workspaceId: string): Promise<void> {
    const pending = this.pending.get(workspaceId);
    if (pending) return pending;
    const migration = this.migrate(workspaceId).finally(() => {
      this.pending.delete(workspaceId);
    });
    this.pending.set(workspaceId, migration);
    return migration;
  }

  run(): Promise<void> {
    if (this.sweep) return this.sweep;
    if (this.stopped) return Promise.resolve();
    const sweep = this.sweepWorkspaces().finally(() => {
      this.sweep = undefined;
    });
    this.sweep = sweep;
    return sweep;
  }

  private async sweepWorkspaces() {
    let afterWorkspaceId: string | undefined;
    const failures: Error[] = [];
    while (!this.stopped) {
      const workspaces =
        await this.runtime.listWorkspaceLifecycleMigrationCandidatesV1(
          afterWorkspaceId
        );
      if (!workspaces.length) break;
      for (const workspaceId of workspaces) {
        if (this.stopped) break;
        afterWorkspaceId = workspaceId;
        try {
          await this.ensure(workspaceId);
        } catch (cause) {
          failures.push(
            new Error(`Workspace lifecycle migration failed: ${workspaceId}`, {
              cause,
            })
          );
        }
      }
    }
    if (failures.length) {
      throw new AggregateError(
        failures,
        'Workspace lifecycle migrations failed'
      );
    }
  }

  private async migrate(workspaceId: string) {
    for (;;) {
      const source =
        await this.runtime.prepareWorkspaceLifecycleMigrationV1(workspaceId);
      if (source.completed) {
        return;
      }
      let rootStatus = source.rootStatus;
      let docs: { docId: string; trashed: boolean }[] = [];
      if (source.bin) {
        try {
          docs = extractWorkspaceLifecycleRootPages(
            Buffer.from(
              source.bin.buffer,
              source.bin.byteOffset,
              source.bin.byteLength
            ),
            this.options?.maxStructs
          );
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.includes('[affine-doc:resource_limit]')) {
            throw error;
          }
          docs = [];
          rootStatus = 'invalid_metadata';
          this.logger.warn(
            `Ignoring invalid legacy root metadata during workspace lifecycle migration: ${workspaceId}`
          );
        }
      }
      const completed = await this.runtime.migrateWorkspaceLifecycleV1({
        workspaceId,
        sourceRevision: source.revision,
        rootStatus,
        docs,
      });
      if (completed) {
        return;
      }
    }
  }
}
