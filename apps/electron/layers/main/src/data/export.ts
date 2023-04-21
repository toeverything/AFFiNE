import fs from 'fs-extra';

import { logger } from '../../../logger';
import type { WorkspaceDatabase } from './sqlite';

/**
 * Start a backup of the database to the given destination.
 */
export async function exportDatabase(db: WorkspaceDatabase, dest: string) {
  await fs.copyFile(db.path, dest);
  logger.log('export: ', dest);
}

// export async function startBackup(db: WorkspaceDatabase, dest: string) {
//   let timeout: NodeJS.Timeout | null;
//   async function backup() {
//     await fs.copyFile(db.path, dest);
//     logger.log('backup: ', dest);
//   }

//   backup();

//   const _db = await db.sqliteDB$;

//   _db.on('change', () => {
//     if (timeout) {
//       clearTimeout(timeout);
//     }
//     timeout = setTimeout(async () => {
//       await backup();
//       timeout = null;
//     }, 1000);
//   });
// }
