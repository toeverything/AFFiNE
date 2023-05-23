import path from 'node:path';

import fs from 'fs-extra';
import * as Y from 'yjs';

import type { AppContext } from '../context';
import { logger } from '../logger';
import { getTime } from '../utils';
import { getWorkspaceMeta } from '../workspace';
import { BaseSQLiteAdapter } from './base-db-adapter';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';

export class SecondaryWorkspaceSQLiteDB extends BaseSQLiteAdapter {
  // timestamp of last push/pull
  lastPull = 0;
  lastPush = 0;

  constructor(
    public override path: string,
    public upstream: WorkspaceSQLiteDB
  ) {
    super(path);
  }

  /**
   * push changes from upstream to external DB file
   */
  async push() {
    // just copy the upstream db file to destination
    const dir = path.dirname(this.path);
    await fs.ensureDir(dir);
    // copy to this.path
    // todo: maybe we can open-write-close instead of copy or even rsync to save disk IO?
    await fs.copyFile(this.upstream.path, this.path); // will overwrite if exists
    this.lastPush = getTime();
    logger.debug(
      `[secondary] pushed ${this.upstream.workspaceId} changes to ${this.path}`
    );
  }

  /**
   * pull changes from external DB file and apply to upstream
   */
  async pull() {
    try {
      // check if db file exists
      if (!(await fs.pathExists(this.path))) {
        // no db file, do nothing
        return;
      }
      this.connect();
      const updates = (await this.getUpdates()).map(update => update.data);

      Y.transact(this.upstream.yDoc, () => {
        updates.forEach(update => {
          this.upstream.applyUpdate(update);
        });
      });

      // pull blobs
      const blobsKeys = await this.getBlobKeys();
      const upstreamBlobsKeys = await this.upstream.getBlobKeys();
      // put every missing blob to upstream
      for (const key of blobsKeys) {
        if (!upstreamBlobsKeys.includes(key)) {
          const blob = await this.getBlob(key);
          if (blob) {
            this.upstream.addBlob(key, blob);
          }
        }
      }
    } finally {
      this.destroy(); // do not keep connection
    }
  }
}

export async function getSecondaryWorkspaceDBPath(
  context: AppContext,
  workspaceId: string
) {
  const meta = await getWorkspaceMeta(context, workspaceId);
  return meta?.secondaryDBPath;
}

export async function getSecondaryWorkspaceDB(
  context: AppContext,
  workspaceId: string,
  upstream: WorkspaceSQLiteDB
) {
  const path = await getSecondaryWorkspaceDBPath(context, workspaceId);
  if (!path) {
    return;
  }
  return new SecondaryWorkspaceSQLiteDB(path, upstream);
}
