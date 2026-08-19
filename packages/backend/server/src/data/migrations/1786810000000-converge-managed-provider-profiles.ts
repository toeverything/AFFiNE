import serverNativeModule from '@affine/server-native';
import { type Prisma, PrismaClient } from '@prisma/client';

const PROFILE_KEY = 'copilot.providers.profiles';
const PROVIDERS = [
  'openai',
  'cloudflareWorkersAi',
  'fal',
  'gemini',
  'geminiVertex',
  'anthropic',
  'anthropicVertex',
] as const;

const PROVIDER_IDS = PROVIDERS.map(provider => `copilot.providers.${provider}`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readProfiles(value: Prisma.JsonValue | undefined) {
  if (value === undefined) {
    return [] as Prisma.JsonArray;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${PROFILE_KEY} must be an array`);
  }
  return value;
}

function validateProfiles(
  profiles: Prisma.JsonArray
): asserts profiles is Prisma.JsonObject[] {
  const errors = serverNativeModule.validateAppConfigValue(
    'copilot',
    'providers.profiles',
    profiles
  );
  if (errors.length) {
    throw new Error(`${PROFILE_KEY} is invalid: ${errors.join('; ')}`);
  }
}

export class ConvergeManagedProviderProfiles1786810000000 {
  static async up(db: PrismaClient) {
    await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'app-config-paths'}, 0))`;
      const rows = await tx.appConfig.findMany({
        where: { id: { in: [PROFILE_KEY, ...PROVIDER_IDS] } },
      });
      const byId = new Map(rows.map(row => [row.id, row]));
      const profileRow = byId.get(PROFILE_KEY);
      const profiles = readProfiles(profileRow?.value);
      const profileIds = new Set(
        profiles.flatMap(profile =>
          isRecord(profile) && typeof profile.id === 'string'
            ? [profile.id]
            : []
        )
      );

      for (const [index, provider] of PROVIDERS.entries()) {
        const legacy = byId.get(`copilot.providers.${provider}`);
        if (!legacy) {
          continue;
        }
        if (!isRecord(legacy.value)) {
          throw new Error(`copilot.providers.${provider} must be an object`);
        }
        const id = `${provider}-default`;
        if (!profileIds.has(id)) {
          profiles.push({
            id,
            type: provider,
            priority: PROVIDERS.length - index,
            config: legacy.value,
          });
          profileIds.add(id);
        }
      }

      if (PROVIDER_IDS.some(id => byId.has(id))) {
        validateProfiles(profiles);
        await tx.appConfig.upsert({
          where: { id: PROFILE_KEY },
          update: { value: profiles },
          create: { id: PROFILE_KEY, value: profiles },
        });
        await tx.appConfig.deleteMany({ where: { id: { in: PROVIDER_IDS } } });
      }
    });
  }

  static async down(_db: PrismaClient) {}
}
