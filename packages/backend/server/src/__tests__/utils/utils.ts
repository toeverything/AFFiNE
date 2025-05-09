import { INestApplicationContext, LogLevel } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import whywhywhy from 'why-is-node-running';

import { RefreshFeatures0001 } from '../../data/migrations/0001-refresh-features';

export const TEST_LOG_LEVEL: LogLevel =
  (process.env.TEST_LOG_LEVEL as LogLevel) ?? 'fatal';

async function flushDB(client: PrismaClient) {
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;

  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );
}

export async function initTestingDB(context: INestApplicationContext) {
  const db = context.get(PrismaClient, { strict: false });
  await flushDB(db);
  await RefreshFeatures0001.up(db, context.get(ModuleRef));
}

export async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function debugProcessHolding(ignorePrismaStack = true) {
  setImmediate(() => {
    whywhywhy({
      error: message => {
        // ignore prisma error
        if (
          ignorePrismaStack &&
          (message.includes('Prisma') || message.includes('prisma'))
        ) {
          return;
        }

        console.error(message);
      },
    });
  });
}
