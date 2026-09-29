import { PrismaClient } from '@prisma/client';
import test, { registerCompletionHandler } from 'ava';

import { BackendRuntimeProvider } from '../../core/backend-runtime';
import { Env } from '../../env';
import { addDocToRootDoc, mergeUpdatesInApplyWay } from '../../native';
import { type TestingApp } from './create-app';

export const e2e = test;
// @ts-expect-error created in prelude.ts
export const app: TestingApp = globalThis.app;

registerCompletionHandler(async () => {
  await app.close();
});

export function refreshEnv() {
  globalThis.env = new Env();
}

export async function addDocumentToRoot(workspaceId: string, docId: string) {
  const db = app.get(PrismaClient);
  const where = { workspaceId_id: { workspaceId, id: workspaceId } };
  const root = await db.snapshot.findUniqueOrThrow({ where });
  const rootBlob = Buffer.from(root.blob);
  const update = addDocToRootDoc(rootBlob, docId, docId);
  await db.snapshot.update({
    where,
    data: {
      blob: mergeUpdatesInApplyWay([rootBlob, update]),
      updatedAt: new Date(),
    },
  });
}

export async function reconcileSearchProjection() {
  const runtime = app.get(BackendRuntimeProvider);
  for (let attempt = 0; attempt < 50; attempt++) {
    const reconciled = await runtime.reconcileSearchProjection(1000);
    const status = (await runtime.searchStatus()) as {
      ready?: boolean;
      metrics?: { pendingPublications?: number };
    };
    if (
      reconciled === 0 &&
      status.ready &&
      status.metrics?.pendingPublications === 0
    ) {
      return;
    }
  }
  throw new Error('search projection did not converge');
}

export * from '../mocks';
export { createApp } from './create-app';
export type { TestingApp };
