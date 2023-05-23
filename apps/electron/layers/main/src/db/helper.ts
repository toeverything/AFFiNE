import type { Database } from 'better-sqlite3';
import sqlite from 'better-sqlite3';

import { logger } from '../logger';

export function isValidateDB(db: Database) {
  // check if db has two tables, one for updates and one for blobs
  const statement = db.prepare(
    `SELECT name FROM sqlite_schema WHERE type='table'`
  );
  const rows = statement.all() as { name: string }[];
  const tableNames = rows.map(row => row.name);
  if (!tableNames.includes('updates') || !tableNames.includes('blobs')) {
    return false;
  }
}

export function isValidDBFile(path: string) {
  let db: Database | null = null;
  try {
    db = sqlite(path);
    // check if db has two tables, one for updates and one for blobs
    const statement = db.prepare(
      `SELECT name FROM sqlite_schema WHERE type='table'`
    );
    const rows = statement.all() as { name: string }[];
    const tableNames = rows.map(row => row.name);
    if (!tableNames.includes('updates') || !tableNames.includes('blobs')) {
      return false;
    }
    return true;
  } catch (error) {
    logger.error('isValidDBFile', error);
    return false;
  } finally {
    db?.close();
  }
}
