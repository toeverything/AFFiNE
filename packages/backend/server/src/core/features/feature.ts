import { PrismaTransaction } from '../../fundamentals';
import { Feature, FeatureSchema, FeatureType } from './types';

class FeatureConfig {
  readonly config: Feature;

  constructor(data: any) {
    const config = FeatureSchema.safeParse(data);
    if (config.success) {
      this.config = config.data;
    } else {
      throw new Error(`Invalid quota config: ${config.error.message}`);
    }
  }

  /// feature name of quota
  get name() {
    return this.config.feature;
  }
}

export class CopilotFeatureConfig extends FeatureConfig {
  override config!: Feature & { feature: FeatureType.Copilot };
  constructor(data: any) {
    super(data);

    if (this.config.feature !== FeatureType.Copilot) {
      throw new Error('Invalid feature config: type is not Copilot');
    }
  }
}

export class EarlyAccessFeatureConfig extends FeatureConfig {
  override config!: Feature & { feature: FeatureType.EarlyAccess };

  constructor(data: any) {
    super(data);

    if (this.config.feature !== FeatureType.EarlyAccess) {
      throw new Error('Invalid feature config: type is not EarlyAccess');
    }
  }
}

export class UnlimitedWorkspaceFeatureConfig extends FeatureConfig {
  override config!: Feature & { feature: FeatureType.UnlimitedWorkspace };

  constructor(data: any) {
    super(data);

    if (this.config.feature !== FeatureType.UnlimitedWorkspace) {
      throw new Error('Invalid feature config: type is not UnlimitedWorkspace');
    }
  }
}

const FeatureConfigMap = {
  [FeatureType.Copilot]: CopilotFeatureConfig,
  [FeatureType.EarlyAccess]: EarlyAccessFeatureConfig,
  [FeatureType.UnlimitedWorkspace]: UnlimitedWorkspaceFeatureConfig,
};

export type FeatureConfigType<F extends FeatureType> = InstanceType<
  (typeof FeatureConfigMap)[F]
>;

const FeatureCache = new Map<number, FeatureConfigType<FeatureType>>();

export async function getFeature(prisma: PrismaTransaction, featureId: number) {
  const cachedQuota = FeatureCache.get(featureId);

  if (cachedQuota) {
    return cachedQuota;
  }

  const feature = await prisma.features.findFirst({
    where: {
      id: featureId,
    },
  });
  if (!feature) {
    // this should unreachable
    throw new Error(`Quota config ${featureId} not found`);
  }
  const ConfigClass = FeatureConfigMap[feature.feature as FeatureType];

  if (!ConfigClass) {
    throw new Error(`Feature config ${featureId} not found`);
  }

  const config = new ConfigClass(feature);
  // we always edit quota config as a new quota config
  // so we can cache it by featureId
  FeatureCache.set(featureId, config);

  return config;
}
