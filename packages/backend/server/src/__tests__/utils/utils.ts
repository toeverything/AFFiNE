import { INestApplicationContext, LogLevel } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import whywhywhy from 'why-is-node-running';

export const TEST_LOG_LEVEL: LogLevel =
  (process.env.TEST_LOG_LEVEL as LogLevel) ?? 'fatal';

async function flushDB(client: PrismaClient) {
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;
  const query = `TRUNCATE TABLE ${result
    .map(({ tablename }) => tablename)
    .filter(name => !name.includes('migrations'))
    .join(', ')}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // remove all table data
      await client.$executeRawUnsafe(query);
      return;
    } catch (error) {
      if (!isDeadlockError(error) || attempt === 2) {
        throw error;
      }
      await sleep((attempt + 1) * 50);
    }
  }
}

function isDeadlockError(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }

  const prismaError = error as {
    code?: string;
    meta?: { code?: string; message?: string };
  };

  return (
    prismaError.code === 'P2010' &&
    (prismaError.meta?.code === '40P01' ||
      /deadlock detected/i.test(prismaError.meta?.message ?? ''))
  );
}

export async function initTestingDB(context: INestApplicationContext) {
  const db = context.get(PrismaClient, { strict: false });
  await flushDB(db);
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
