import { existsSync } from 'node:fs';

import type { SpaceType } from '@affine/nbstore';
import { Injectable, Logger } from '@nestjs/common';

import { WorkspacePathService } from '../workspace-path.service';
import { WorkspaceSQLiteDB } from './workspace-db-adapter';

@Injectable()
export class LegacyDBManager {
  constructor(
    private readonly workspacePathService: WorkspacePathService,
    private readonly logger: Logger
  ) {}

  db$Map = new Map<`${SpaceType}:${string}`, Promise<WorkspaceSQLiteDB>>();

  async openWorkspaceDatabase(spaceType: SpaceType, spaceId: string) {
    const meta = await this.workspacePathService.getWorkspaceMeta(
      spaceType,
      spaceId
    );
    const db = new WorkspaceSQLiteDB(meta.mainDBPath, spaceId);
    await db.init();
    this.logger.log(`openWorkspaceDatabase [${spaceId}]`);
    return db;
  }

  async getWorkspaceDB(spaceType: SpaceType, id: string) {
    const cacheId = `${spaceType}:${id}` as const;
    let db = await this.db$Map.get(cacheId);
    if (!db) {
      const promise = this.openWorkspaceDatabase(spaceType, id);
      this.db$Map.set(cacheId, promise);
      const _db = (db = await promise);
      const cleanup = () => {
        this.db$Map.delete(cacheId);
        _db
          .destroy()
          .then(() => {
            this.logger.log(
              '[ensureSQLiteDB] db connection closed',
              _db.workspaceId
            );
          })
          .catch((err: any) => {
            this.logger.error('[ensureSQLiteDB] destroy db failed', err);
          });
      };

      db?.update$.subscribe({
        complete: cleanup,
      });

      process.on('beforeExit', cleanup);
    }

    // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
    return db!;
  }

  async ensureSQLiteDB(
    spaceType: SpaceType,
    id: string
  ): Promise<WorkspaceSQLiteDB | null> {
    const meta = await this.workspacePathService.getWorkspaceMeta(
      spaceType,
      id
    );

    // do not auto create v1 db anymore
    if (!existsSync(meta.mainDBPath)) {
      return null;
    }

    return this.getWorkspaceDB(spaceType, id);
  }

  async ensureSQLiteDisconnected(spaceType: SpaceType, id: string) {
    const db = await this.ensureSQLiteDB(spaceType, id);

    if (db) {
      await db.checkpoint();
      await db.destroy();
    }
  }
}
