import { ModuleRef } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { CryptoHelper } from '../../fundamentals';

export class CopilotEncryptMessages1713436187237 {
  // do the migration
  static async up(db: PrismaClient, ref: ModuleRef) {
    const crypto = ref.get(CryptoHelper, { strict: false });

    const messages = await db.aiSessionMessage.findMany({});
    await db.$transaction(async tx => {
      await Promise.all(
        messages.map(async message => {
          const content = crypto.encrypt(message.content);
          await tx.aiSessionMessage.update({
            where: { id: message.id },
            data: { content },
          });
        })
      );
    });
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
