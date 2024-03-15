import { PrismaTransaction } from '../../fundamentals';
import { formatDate, formatSize, Quota, QuotaSchema } from './types';

const QuotaCache = new Map<number, QuotaConfig>();

export class QuotaConfig {
  readonly config: Quota;

  static async get(tx: PrismaTransaction, featureId: number) {
    const cachedQuota = QuotaCache.get(featureId);

    if (cachedQuota) {
      return cachedQuota;
    }

    const quota = await tx.features.findFirst({
      where: {
        id: featureId,
      },
    });

    if (!quota) {
      throw new Error(`Quota config ${featureId} not found`);
    }

    const config = new QuotaConfig(quota);
    // we always edit quota config as a new quota config
    // so we can cache it by featureId
    QuotaCache.set(featureId, config);

    return config;
  }

  private constructor(data: any) {
    const config = QuotaSchema.safeParse(data);
    if (config.success) {
      this.config = config.data;
    } else {
      throw new Error(
        `Invalid quota config: ${config.error.message}, ${JSON.stringify(
          data
        )})}`
      );
    }
  }

  get version() {
    return this.config.version;
  }

  /// feature name of quota
  get name() {
    return this.config.feature;
  }

  get blobLimit() {
    return this.config.configs.blobLimit;
  }

  get businessBlobLimit() {
    return (
      this.config.configs.businessBlobLimit || this.config.configs.blobLimit
    );
  }

  get storageQuota() {
    return this.config.configs.storageQuota;
  }

  get historyPeriod() {
    return this.config.configs.historyPeriod;
  }

  get historyPeriodFromNow() {
    return new Date(Date.now() + this.historyPeriod);
  }

  get memberLimit() {
    return this.config.configs.memberLimit;
  }

  get humanReadable() {
    return {
      name: this.config.configs.name,
      blobLimit: formatSize(this.blobLimit),
      storageQuota: formatSize(this.storageQuota),
      historyPeriod: formatDate(this.historyPeriod),
      memberLimit: this.memberLimit.toString(),
    };
  }
}
