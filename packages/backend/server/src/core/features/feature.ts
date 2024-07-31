import { PrismaTransaction } from '../../fundamentals';
import { Feature, FeatureSchema, FeatureType } from './types';

class FeatureConfig<T extends FeatureType> {
  readonly config: Feature & { feature: T };

  constructor(data: any) {
    const config = FeatureSchema.safeParse(data);

    if (config.success) {
      // @ts-expect-error allow
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

export type FeatureConfigType<F extends FeatureType> = FeatureConfig<F>;

const FeatureCache = new Map<number, FeatureConfigType<FeatureType>>();

export async function getFeature(prisma: PrismaTransaction, featureId: number) {
  const cachedFeature = FeatureCache.get(featureId);

  if (cachedFeature) {
    return cachedFeature;
  }

  const feature = await prisma.feature.findFirst({
    where: {
      id: featureId,
    },
  });
  if (!feature) {
    // this should unreachable
    throw new Error(`Quota config ${featureId} not found`);
  }

  const config = new FeatureConfig(feature);
  // we always edit quota config as a new quota config
  // so we can cache it by featureId
  FeatureCache.set(featureId, config);

  return config;
}
