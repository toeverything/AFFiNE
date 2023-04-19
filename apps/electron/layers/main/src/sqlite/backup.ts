import fs from 'fs-extra';

import type { WorkspaceDatabase } from './db';

/**
 * Start a backup of the database to the given destination.
 */
export function startBackup(db: WorkspaceDatabase, dest: string) {
  let timeout: NodeJS.Timeout | null;
  async function backup() {
    await fs.copyFile(db.path, dest);
    console.log('backup: ', dest);
  }

  backup();

  db.sqliteDB.on('change', () => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(async () => {
      await backup();
      timeout = null;
    }, 1000);
  });
}
