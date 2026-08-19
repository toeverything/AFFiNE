import { type Prisma, PrismaClient } from '@prisma/client';

const BATCH_SIZE = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function backfillTranscriptStorageKeys(
  payload: Prisma.JsonValue | null,
  userId: string,
  workspaceId: string
): Prisma.InputJsonValue | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.infos)) {
    return;
  }

  const prefix = `/api/copilot/blob/${encodeURIComponent(userId)}/${encodeURIComponent(workspaceId)}/`;
  let changed = false;
  const infos = payload.infos.map(info => {
    if (!isRecord(info) || info.key || typeof info.url !== 'string') {
      return info;
    }

    try {
      const url = new URL(info.url);
      if (!url.pathname.startsWith(prefix)) {
        return info;
      }
      const key = decodeURIComponent(url.pathname.slice(prefix.length));
      if (!key) {
        return info;
      }
      changed = true;
      return { ...info, key };
    } catch {
      return info;
    }
  });

  return changed ? ({ ...payload, infos } as Prisma.InputJsonValue) : undefined;
}

export class BackfillTranscriptStorageKeys1786805802350 {
  static async up(db: PrismaClient) {
    let cursor: string | undefined;

    while (true) {
      const tasks = await db.aiTranscriptTask.findMany({
        select: {
          id: true,
          userId: true,
          workspaceId: true,
          inputSnapshot: true,
          protectedResult: true,
        },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!tasks.length) {
        return;
      }

      const updates = tasks.flatMap(task => {
        const inputSnapshot = backfillTranscriptStorageKeys(
          task.inputSnapshot,
          task.userId,
          task.workspaceId
        );
        const protectedResult = backfillTranscriptStorageKeys(
          task.protectedResult,
          task.userId,
          task.workspaceId
        );
        if (!inputSnapshot && !protectedResult) {
          return [];
        }
        return db.aiTranscriptTask.update({
          where: { id: task.id },
          data: {
            ...(inputSnapshot ? { inputSnapshot } : {}),
            ...(protectedResult ? { protectedResult } : {}),
          },
        });
      });

      if (updates.length) {
        await db.$transaction(updates);
      }
      cursor = tasks.at(-1)?.id;
    }
  }

  static async down(_db: PrismaClient) {}
}
