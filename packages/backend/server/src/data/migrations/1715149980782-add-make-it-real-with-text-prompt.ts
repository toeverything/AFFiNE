import { PrismaClient } from '@prisma/client';

import { refreshPrompts } from './utils/prompts';

export class AddMakeItRealWithTextPrompt1715149980782 {
  // do the migration
  static async up(db: PrismaClient) {
    await refreshPrompts(db);
  }

  // revert the migration
  static async down(_db: PrismaClient) {}
}
