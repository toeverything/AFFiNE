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
const DEFAULT_PROFILE_IDS = new Set(
  PROVIDERS.map(provider => `${provider}-default`)
);
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
      const assignedModels = new Set(
        profiles.flatMap(profile =>
          isRecord(profile) &&
          typeof profile.id === 'string' &&
          !DEFAULT_PROFILE_IDS.has(profile.id) &&
          profile.enabled !== false &&
          Array.isArray(profile.models)
            ? profile.models.filter(
                (model): model is string => typeof model === 'string'
              )
            : []
        )
      );
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
        const canEnable =
          !isRecord(existing) ||
          existing.enabled === undefined ||
          existing.enabled === true;
        const modelsAreValid = configuredModels.every(
          model => typeof model === 'string'
        );
        const availableModels =
          canEnable && modelsAreValid
            ? configuredModels.filter(model => !assignedModels.has(model))
            : configuredModels;
        const hasConflict = canEnable && availableModels.length === 0;
        const models = hasConflict ? configuredModels : availableModels;
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
          models,
          ...(hasConflict ? { enabled: false } : {}),
        };
        if (profileIndex === -1) {
          profiles.push(profile);
        } else {
          profiles[profileIndex] = profile;
        }
        if (canEnable && !hasConflict) {
          models.forEach(model => {
            if (typeof model === 'string') assignedModels.add(model);
          });
        }
      }

      if (converged) {
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
