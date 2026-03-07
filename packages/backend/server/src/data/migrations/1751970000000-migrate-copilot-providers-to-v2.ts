import { PrismaClient } from '@prisma/client';

const LEGACY_PROVIDER_KEYS = [
  'openai',
  'fal',
  'gemini',
  'geminiVertex',
  'perplexity',
  'anthropic',
  'anthropicVertex',
  'morph',
] as const;

const LEGACY_PROVIDER_PRIORITY: Record<string, number> = {
  openai: 8,
  fal: 7,
  gemini: 6,
  geminiVertex: 5,
  perplexity: 4,
  anthropic: 3,
  anthropicVertex: 2,
  morph: 1,
};

type LegacyProviderConfig = Record<string, unknown>;

type Profile = {
  id: string;
  type: string;
  priority: number;
  config: LegacyProviderConfig;
};

function isConfigured(type: string, config: LegacyProviderConfig): boolean {
  switch (type) {
    case 'geminiVertex':
    case 'anthropicVertex':
      return !!config.location && !!config.googleAuthOptions;
    default:
      return !!config.apiKey;
  }
}

export class MigrateCopilotProvidersToV21751970000000 {
  static async up(db: PrismaClient) {
    // Check if profiles already exist in DB
    const existingProfiles = await db.appConfig.findUnique({
      where: { id: 'copilot.providers.profiles' },
    });

    if (existingProfiles) {
      const profiles = existingProfiles.value as unknown[];
      if (Array.isArray(profiles) && profiles.length > 0) {
        // Already migrated
        return;
      }
    }

    // Load all legacy provider configs from DB
    const legacyConfigs = await db.appConfig.findMany({
      where: {
        id: {
          in: LEGACY_PROVIDER_KEYS.map(k => `copilot.providers.${k}`),
        },
      },
    });

    if (legacyConfigs.length === 0) {
      // No legacy configs to migrate
      return;
    }

    // Build profiles from legacy configs
    const profiles: Profile[] = [];
    for (const row of legacyConfigs) {
      const type = row.id.replace('copilot.providers.', '');
      const config = row.value as LegacyProviderConfig;

      if (!isConfigured(type, config)) {
        continue;
      }

      profiles.push({
        id: `${type}-default`,
        type,
        priority: LEGACY_PROVIDER_PRIORITY[type] ?? 0,
        config,
      });
    }

    if (profiles.length === 0) {
      return;
    }

    // Save profiles
    await db.appConfig.upsert({
      where: { id: 'copilot.providers.profiles' },
      update: {
        value: profiles as any,
        lastUpdatedBy: 'system-migration',
      },
      create: {
        id: 'copilot.providers.profiles',
        value: profiles as any,
        lastUpdatedBy: 'system-migration',
      },
    });

    // Delete legacy keys
    await db.appConfig.deleteMany({
      where: {
        id: {
          in: legacyConfigs.map(c => c.id),
        },
      },
    });
  }

  static async down(db: PrismaClient) {
    // Read profiles
    const profilesRow = await db.appConfig.findUnique({
      where: { id: 'copilot.providers.profiles' },
    });

    if (!profilesRow) {
      return;
    }

    const profiles = profilesRow.value as Profile[];
    if (!Array.isArray(profiles)) {
      return;
    }

    // Restore legacy keys from profiles that have the `-default` suffix
    for (const profile of profiles) {
      if (!profile.id.endsWith('-default')) {
        continue;
      }

      const legacyKey = `copilot.providers.${profile.type}`;
      await db.appConfig.upsert({
        where: { id: legacyKey },
        update: {
          value: profile.config as any,
          lastUpdatedBy: 'system-migration-revert',
        },
        create: {
          id: legacyKey,
          value: profile.config as any,
          lastUpdatedBy: 'system-migration-revert',
        },
      });
    }

    // Remove profiles
    await db.appConfig.delete({
      where: { id: 'copilot.providers.profiles' },
    });
  }
}
