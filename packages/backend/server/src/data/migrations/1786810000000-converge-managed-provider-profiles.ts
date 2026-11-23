import serverNativeModule from '@affine/server-native';
import { type Prisma, PrismaClient } from '@prisma/client';

import { disableIncompleteManagedProfiles } from './utils/managed-profiles';

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
// Keep legacy model declarations until 0.27.4 readers leave the shared database.
const PROVIDER_MODELS: Record<(typeof PROVIDERS)[number], string[]> = {
  openai: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-image-1', 'gpt-4o-mini'],
  cloudflareWorkersAi: ['@cf/baai/bge-reranker-base'],
  fal: ['lora/image-to-image', 'workflowutils/teed'],
  gemini: ['gemini-3.7-flash', 'gemini-embedding-001'],
  geminiVertex: ['gemini-3.7-flash'],
  anthropic: ['claude-sonnet-4-6'],
  anthropicVertex: ['claude-sonnet-4-6'],
};

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
      let converged = false;

      for (const [index, provider] of PROVIDERS.entries()) {
        const legacy = byId.get(`copilot.providers.${provider}`);
        if (legacy && !isRecord(legacy.value)) {
          throw new Error(`copilot.providers.${provider} must be an object`);
        }
        const id = `${provider}-default`;
        const profileIndex = profiles.findIndex(
          profile => isRecord(profile) && profile.id === id
        );
        const existing =
          profileIndex === -1 ? undefined : profiles[profileIndex];
        if (!legacy && !existing) continue;
        converged = true;

        const configuredModels =
          isRecord(existing) &&
          Array.isArray(existing.models) &&
          existing.models.length > 0
            ? existing.models
            : PROVIDER_MODELS[provider];
        const profile: Prisma.JsonObject = {
          ...(legacy
            ? {
                id,
                type: provider,
                priority: PROVIDERS.length - index,
                config: legacy.value,
              }
            : {}),
          ...(isRecord(existing) ? existing : {}),
          id,
          type: provider,
          models: configuredModels,
        };
        if (profileIndex === -1) {
          profiles.push(profile);
        } else {
          profiles[profileIndex] = profile;
        }
      }

      if (converged) {
        disableIncompleteManagedProfiles(profiles);
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
