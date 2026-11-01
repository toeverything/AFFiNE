import serverNativeModule from '@affine/server-native';
import type { Prisma } from '@prisma/client';

// TODO(0.27.5): Remove incomplete 0.27.4 profile handling after old writers exit.
export function disableIncompleteManagedProfiles(profiles: Prisma.JsonArray) {
  let changed = false;
  for (const profile of profiles) {
    if (
      !profile ||
      typeof profile !== 'object' ||
      Array.isArray(profile) ||
      (profile.enabled !== undefined && profile.enabled !== true)
    ) {
      continue;
    }
    const disabled = { ...profile, enabled: false };
    if (
      serverNativeModule.validateAppConfigValue(
        'copilot',
        'providers.profiles',
        [disabled]
      ).length
    ) {
      throw new Error('Managed provider profile is structurally invalid');
    }
    if (
      serverNativeModule.validateAppConfigValue(
        'copilot',
        'providers.profiles',
        [profile]
      ).length
    ) {
      profile.enabled = false;
      changed = true;
    }
  }
  return changed;
}
