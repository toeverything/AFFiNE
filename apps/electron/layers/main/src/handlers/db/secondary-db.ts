import path from 'node:path';

import fs from 'fs-extra';
import * as Y from 'yjs';

import { logger } from '../../logger';
import { ts } from '../../utils';
import { BaseSQLiteAdapter } from './base-db-adapter';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';

export class SecondaryWorkspaceSQLiteDB extends BaseSQLiteAdapter {
  // timestamp of last push/pull
  lastPull = 0;
  lastPush = 0;

  constructor(public upstream: WorkspaceSQLiteDB, public path: string) {
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
    this.lastPush = ts();
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
      const updates = this.getUpdates().map(update => update.data);

      Y.transact(this.upstream.yDoc, () => {
        updates.forEach(update => {
          this.upstream.applyUpdate(update);
        });
      });

      // pull blobs
      const blobsKeys = this.getBlobKeys();
      const upstreamBlobsKeys = this.upstream.getBlobKeys();
      // put every missing blob to upstream
      this.db?.transaction(() => {
        blobsKeys.forEach(key => {
          if (!upstreamBlobsKeys.includes(key)) {
            const blob = this.getBlob(key);
            if (blob) {
              this.upstream.addBlob(key, blob);
            }
          }
        });
      });
    } finally {
      this.destroy(); // do not keep connection
    }
  }
}
