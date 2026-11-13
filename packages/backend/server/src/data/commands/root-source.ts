import { writeFile } from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class RootSourceCommand {
  private readonly logger = new Logger(RootSourceCommand.name);

  constructor(private readonly db: PrismaClient) {}

  async inspect(workspaceId: string, output: string) {
    const material = await this.db.$transaction(
      async tx => {
        const snapshot = await tx.snapshot.findUnique({
          where: { workspaceId_id: { workspaceId, id: workspaceId } },
        });
        const updates = await tx.update.findMany({
          where: { workspaceId, id: workspaceId },
          orderBy: { createdAt: 'asc' },
        });
        const histories = await tx.snapshotHistory.findMany({
          where: { workspaceId, id: workspaceId },
          orderBy: { timestamp: 'asc' },
        });
        const encode = <
          T extends { blob: Uint8Array; state?: Uint8Array | null },
        >(
          row: T
        ) => ({
          ...row,
          blob: Buffer.from(row.blob).toString('base64'),
          ...(row.state && {
            state: Buffer.from(row.state).toString('base64'),
          }),
        });
        return {
          workspaceId,
          snapshot: snapshot && encode(snapshot),
          updates: updates.map(encode),
          histories: histories.map(encode),
        };
      },
      { isolationLevel: 'RepeatableRead' }
    );
    await writeFile(
      output,
      JSON.stringify(
        material,
        (_key, value: unknown) =>
          typeof value === 'bigint' ? value.toString() : value,
        2
      ) + '\n',
      { mode: 0o600, flag: 'wx' }
    );
    this.logger.log(`Root material saved to ${output}`);
  }
}
