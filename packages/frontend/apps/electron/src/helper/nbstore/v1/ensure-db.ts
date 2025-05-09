import { existsSync } from 'node:fs';

import type { SpaceType } from '@affine/nbstore';

import { logger } from '../../logger';
import { getWorkspaceMeta } from '../../workspace/meta';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

// export for testing
export const db$Map = new Map<
  `${SpaceType}:${string}`,
  Promise<WorkspaceSQLiteDB>
>();

async function getWorkspaceDB(spaceType: SpaceType, id: string) {
  const cacheId = `${spaceType}:${id}` as const;
  let db = await db$Map.get(cacheId);
  if (!db) {
    const promise = openWorkspaceDatabase(spaceType, id);
    db$Map.set(cacheId, promise);
    const _db = (db = await promise);
    const cleanup = () => {
      db$Map.delete(cacheId);
      _db
        .destroy()
        .then(() => {
          logger.info('[ensureSQLiteDB] db connection closed', _db.workspaceId);
        })
        .catch(err => {
          logger.error('[ensureSQLiteDB] destroy db failed', err);
        });
    };

    db.update$.subscribe({
      complete: cleanup,
    });

    process.on('beforeExit', cleanup);
  }

  // oxlint-disable-next-line @typescript-eslint/no-non-null-assertion
  return db!;
}

export async function ensureSQLiteDB(
  spaceType: SpaceType,
  id: string
): Promise<WorkspaceSQLiteDB | null> {
  const meta = await getWorkspaceMeta(spaceType, id);

  // do not auto create v1 db anymore
  if (!existsSync(meta.mainDBPath)) {
    return null;
  }

  return getWorkspaceDB(spaceType, id);
}

export async function ensureSQLiteDisconnected(
  spaceType: SpaceType,
  id: string
) {
  const db = await ensureSQLiteDB(spaceType, id);

  if (db) {
    await db.checkpoint();
    await db.destroy();
  }
}
