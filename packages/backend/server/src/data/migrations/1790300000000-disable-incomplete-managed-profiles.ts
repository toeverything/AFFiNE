import serverNativeModule from '@affine/server-native';
import { type Prisma, PrismaClient } from '@prisma/client';

import { disableIncompleteManagedProfiles } from './utils/managed-profiles';

const PROFILE_KEY = 'copilot.providers.profiles';

export class DisableIncompleteManagedProfiles1790300000000 {
  static async up(db: PrismaClient) {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'app-config-paths'}, 0))`;
      const row = await tx.appConfig.findUnique({ where: { id: PROFILE_KEY } });
      if (!row) return;
      if (!Array.isArray(row.value)) {
        throw new Error(`${PROFILE_KEY} must be an array`);
      }
      const profiles = row.value as Prisma.JsonArray;
      if (!disableIncompleteManagedProfiles(profiles)) return;
      const errors = serverNativeModule.validateAppConfigValue(
        'copilot',
        'providers.profiles',
        profiles
      );
      if (errors.length) {
        throw new Error(
          `${PROFILE_KEY} remains invalid after disabling incomplete profiles`
        );
      }
      await tx.appConfig.update({
        where: { id: PROFILE_KEY },
        data: { value: profiles },
      });
    });
  }

  static async down(_db: PrismaClient) {}
}
