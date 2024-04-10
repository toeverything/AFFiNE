import { PrismaClient } from '@prisma/client';

import { prompts } from './utils/prompts';

export class Prompts1712068777394 {
  // do the migration
  static async up(db: PrismaClient) {
    await db.$transaction(async tx => {
      await Promise.all(
        prompts.map(prompt =>
          tx.aiPrompt.create({
            data: {
              name: prompt.name,
              action: prompt.action,
              model: prompt.model,
              messages: {
                create: prompt.messages.map((message, idx) => ({
                  idx,
                  role: message.role,
                  content: message.content,
                  params: message.params,
                })),
              },
            },
          })
        )
      );
    });
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
