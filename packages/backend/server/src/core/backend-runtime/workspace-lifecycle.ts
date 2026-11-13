import { Logger } from '@nestjs/common';
import * as Y from 'yjs';

import type { RuntimeInstance } from './contracts';

export class WorkspaceLifecycleMigration {
  private readonly logger = new Logger(WorkspaceLifecycleMigration.name);
  private readonly pending = new Map<string, Promise<void>>();
  private sweep?: Promise<void>;
  private stopped = false;

  constructor(private readonly runtime: RuntimeInstance) {}

  start() {
    this.stopped = false;
    this.scheduleSweep();
  }

  async stop() {
    this.stopped = true;
    await this.sweep;
    await Promise.all(this.pending.values());
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

  run() {
    this.scheduleSweep();
    return this.sweep;
  }

  private scheduleSweep() {
    if (this.sweep || this.stopped) return;
    this.sweep = (async () => {
      while (!this.stopped) {
        const workspaces =
          await this.runtime.listWorkspaceLifecycleMigrationCandidatesV1();
        if (!workspaces.length) return;
        for (const workspaceId of workspaces) {
          if (this.stopped) return;
          await this.ensure(workspaceId);
        }
      }
    })()
      .catch((error: unknown) => {
        this.logger.error('Workspace lifecycle migration sweep stopped', error);
      })
      .finally(() => {
        this.sweep = undefined;
      });
  }

  private async migrate(workspaceId: string) {
    for (;;) {
      const source =
        await this.runtime.prepareWorkspaceLifecycleMigrationV1(workspaceId);
      if (source.completed) {
        this.scheduleSweep();
        return;
      }
      let rootStatus = source.rootStatus;
      const docs: { docId: string; trashed: boolean }[] = [];
      if (source.bin) {
        const root = new Y.Doc();
        try {
          Y.applyUpdate(root, source.bin);
          const pages: unknown = root.getMap('meta').toJSON().pages;
          if (Array.isArray(pages)) {
            for (const page of pages) {
              if (typeof page !== 'object' || page === null || !('id' in page))
                continue;
              const docId: unknown = page.id;
              if (typeof docId !== 'string' || !docId.trim()) continue;
              docs.push({
                docId,
                trashed: 'trash' in page && page.trash === true,
              });
            }
          }
        } catch {
          docs.length = 0;
          rootStatus = 'invalid_metadata';
          this.logger.warn(
            `Ignoring invalid legacy root metadata during workspace lifecycle migration: ${workspaceId}`
          );
        } finally {
          root.destroy();
        }
      }
      const completed = await this.runtime.migrateWorkspaceLifecycleV1({
        workspaceId,
        sourceRevision: source.revision,
        rootStatus,
        docs,
      });
      if (completed) {
        this.scheduleSweep();
        return;
      }
    }
  }
}
