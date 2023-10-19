type FeatureEarlyAccessPreview = {
  whitelist: RegExp[];
};

type FeatureStorageLimit = {
  storageQuota: number;
};

type UserFeatureGate = {
  earlyAccessPreview: FeatureEarlyAccessPreview;
  freeUser: FeatureStorageLimit;
  proUser: FeatureStorageLimit;
};

const UserLevel = {
  freeUser: {
    storageQuota: 10 * 1024 * 1024 * 1024,
  },
  proUser: {
    storageQuota: 100 * 1024 * 1024 * 1024,
  },
} satisfies Pick<UserFeatureGate, 'freeUser' | 'proUser'>;

export function getStorageQuota(features: string[]) {
  for (const feature of features) {
    if (feature in UserLevel) {
      return UserLevel[feature as keyof typeof UserLevel].storageQuota;
    }
  }
  return null;
}

const UserType = {
  earlyAccessPreview: {
    whitelist: [/@toeverything\.info$/],
  },
} satisfies Pick<UserFeatureGate, 'earlyAccessPreview'>;

export const FeatureGates = {
  ...UserType,
  ...UserLevel,
} satisfies UserFeatureGate;
