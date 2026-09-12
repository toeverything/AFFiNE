import type postgres from 'postgres';

import {
  BLOBS_MIGRATION_SQL,
  DOCS_MIGRATION_SQL,
  IDENTITY_MIGRATION_SQL,
  MEMBERS_MIGRATION_SQL,
  PLATFORM_MIGRATION_SQL,
} from './migrations.js';

const MIGRATIONS = [
  { id: '001_identity', sql: IDENTITY_MIGRATION_SQL },
  { id: '002_docs', sql: DOCS_MIGRATION_SQL },
  { id: '003_blobs', sql: BLOBS_MIGRATION_SQL },
  { id: '004_members', sql: MEMBERS_MIGRATION_SQL },
  { id: '005_platform', sql: PLATFORM_MIGRATION_SQL },
];

export async function applyMigrations(sql: postgres.Sql): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS mosaic_schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const migration of MIGRATIONS) {
    const [row] = await sql<{ id: string }[]>`
      SELECT id FROM mosaic_schema_migrations WHERE id = ${migration.id}
    `;
    if (row) {
      continue;
    }
    await sql.begin(async tx => {
      await tx.unsafe(migration.sql);
      await tx`INSERT INTO mosaic_schema_migrations (id) VALUES (${migration.id})`;
    });
  }
}
