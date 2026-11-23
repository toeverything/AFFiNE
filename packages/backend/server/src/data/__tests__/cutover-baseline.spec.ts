import { PrismaClient } from '@prisma/client';
import test from 'ava';

import { CutoverCommand } from '../commands/cutover';

// This suite is only enabled for an explicit, disposable integration database.
const integration = process.env.CUTOVER_TEST_DATABASE_URL
  ? test.serial
  : test.serial.skip;
integration(
  'cutover creates its missing checkpoint table and upserts one completed baseline',
  async t => {
    const db = new PrismaClient({
      datasources: { db: { url: process.env.CUTOVER_TEST_DATABASE_URL } },
    });
    try {
      const [before] = await db.$queryRaw<Array<{ table: string | null }>>`
        SELECT to_regclass('storage_reconciliation_checkpoints')::text AS "table"
      `;
      t.is(before.table, null);
      const command = new CutoverCommand(db);
      await command.execute('cloud');
      await command.execute('cloud');
      const rows = await db.$queryRaw<
        Array<{
          kind: string;
          scope: string;
          status: string;
          metadata: { baselineVersion: string };
        }>
      >`SELECT kind,scope,status,metadata FROM storage_reconciliation_checkpoints`;
      t.is(rows.length, 1);
      t.is(rows[0].kind, 'schema_baseline_0275');
      t.is(rows[0].scope, 'global');
      t.is(rows[0].status, 'completed');
      t.is(rows[0].metadata.baselineVersion, '0.27.5');
    } finally {
      await db.$disconnect();
    }
  }
);
