import fs from 'fs-extra';

import { logger } from '../logger';
import type { WorkspaceSQLiteDB } from './sqlite';

/**
 * Start a backup of the database to the given destination.
 */
export async function exportDatabase(db: WorkspaceSQLiteDB, dest: string) {
  await fs.copyFile(db.path, dest);
  logger.log('export: ', dest);
}
