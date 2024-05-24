import { PrismaClient } from '@prisma/client';

import { refreshPrompts } from './utils/prompts';

export class UpgradePrompts1716659387824 {
  // do the action
  static async run(db: PrismaClient) {
    await refreshPrompts(db);
  }
}
