import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { difference, keyBy } from 'lodash-es';

import { Cache } from '../../cache';
import { InvalidRuntimeConfigType, RuntimeConfigNotFound } from '../../error';
import { defer } from '../../utils/promise';
import { defaultRuntimeConfig, runtimeConfigType } from '../register';
import { AppRuntimeConfigModules, FlattenedAppRuntimeConfig } from '../types';

function validateConfigType<K extends keyof FlattenedAppRuntimeConfig>(
  key: K,
  value: any
) {
  const config = defaultRuntimeConfig[key];

  if (!config) {
    throw new RuntimeConfigNotFound({ key });
  }

  const want = config.type;
  const get = runtimeConfigType(value);
  if (get !== want) {
    throw new InvalidRuntimeConfigType({
      key,
      want,
      get,
    });
  }
}

/**
 * runtime.fetch(k) // v1
 * runtime.fetchAll(k1, k2, k3) // [v1, v2, v3]
 * runtime.set(k, v)
 * runtime.update(k, (v) => {
 *   v.xxx = 'yyy';
 *   return v
 * })
 */
@Injectable()
export class Runtime implements OnModuleInit {
  private readonly logger = new Logger('App:RuntimeConfig');

  constructor(
    private readonly db: PrismaClient,
    // circular deps: runtime => cache => redis(maybe) => config => runtime
    @Inject(forwardRef(() => Cache)) private readonly cache: Cache
  ) {}

  async onModuleInit() {
    await this.upgradeDB();
  }

  async fetch<K extends keyof FlattenedAppRuntimeConfig>(
    k: K
  ): Promise<FlattenedAppRuntimeConfig[K]> {
    const cached = await this.loadCache<K>(k);

    if (cached !== undefined) {
      return cached;
    }

    const dbValue = await this.loadDb<K>(k);

    if (dbValue === undefined) {
      throw new RuntimeConfigNotFound({ key: k });
    }

    await this.setCache(k, dbValue);

    return dbValue;
  }

  async fetchAll<
    Selector extends { [Key in keyof FlattenedAppRuntimeConfig]?: true },
  >(
    selector: Selector
  ): Promise<{
    // @ts-expect-error allow
    [Key in keyof Selector]: FlattenedAppRuntimeConfig[Key];
  }> {
    const keys = Object.keys(selector);

    if (keys.length === 0) {
      return {} as any;
    }

    const records = await this.db.runtimeConfig.findMany({
      select: {
        id: true,
        value: true,
      },
      where: {
        id: {
          in: keys,
        },
        deletedAt: null,
      },
    });

    const keyed = keyBy(records, 'id');
    return keys.reduce((ret, key) => {
      ret[key] = keyed[key]?.value ?? defaultRuntimeConfig[key].value;
      return ret;
    }, {} as any);
  }

  async list(module?: AppRuntimeConfigModules) {
    return await this.db.runtimeConfig.findMany({
      where: module ? { module, deletedAt: null } : { deletedAt: null },
    });
  }

  async set<
    K extends keyof FlattenedAppRuntimeConfig,
    V = FlattenedAppRuntimeConfig[K],
  >(key: K, value: V) {
    validateConfigType(key, value);
    const config = await this.db.runtimeConfig.update({
      where: {
        id: key,
        deletedAt: null,
      },
      data: {
        value: value as any,
      },
    });

    await this.setCache(key, config.value as FlattenedAppRuntimeConfig[K]);
    return config;
  }

  async update<
    K extends keyof FlattenedAppRuntimeConfig,
    V = FlattenedAppRuntimeConfig[K],
  >(k: K, modifier: (v: V) => V | Promise<V>) {
    const data = await this.fetch<K>(k);

    const updated = await modifier(data as V);

    await this.set(k, updated);

    return updated;
  }

  async loadDb<K extends keyof FlattenedAppRuntimeConfig>(
    k: K
  ): Promise<FlattenedAppRuntimeConfig[K] | undefined> {
    const v = await this.db.runtimeConfig.findFirst({
      where: {
        id: k,
        deletedAt: null,
      },
    });

    if (v) {
      return v.value as FlattenedAppRuntimeConfig[K];
    } else {
      const record = await this.db.runtimeConfig.create({
        data: defaultRuntimeConfig[k],
      });

      return record.value as any;
    }
  }

  async loadCache<K extends keyof FlattenedAppRuntimeConfig>(
    k: K
  ): Promise<FlattenedAppRuntimeConfig[K] | undefined> {
    return this.cache.get<FlattenedAppRuntimeConfig[K]>(`SERVER_RUNTIME:${k}`);
  }

  async setCache<K extends keyof FlattenedAppRuntimeConfig>(
    k: K,
    v: FlattenedAppRuntimeConfig[K]
  ): Promise<boolean> {
    return this.cache.set<FlattenedAppRuntimeConfig[K]>(
      `SERVER_RUNTIME:${k}`,
      v,
      { ttl: 60 * 1000 }
    );
  }

  /**
   * Upgrade the DB with latest runtime configs
   */
  private async upgradeDB() {
    const existingConfig = await this.db.runtimeConfig.findMany({
      select: {
        id: true,
      },
      where: {
        deletedAt: null,
      },
    });

    const defined = Object.keys(defaultRuntimeConfig);
    const existing = existingConfig.map(c => c.id);
    const newConfigs = difference(defined, existing);
    const deleteConfigs = difference(existing, defined);

    if (!newConfigs.length && !deleteConfigs.length) {
      return;
    }

    this.logger.log(`Found runtime config changes, upgrading...`);
    const acquired = await this.cache.setnx('runtime:upgrade', 1, {
      ttl: 10 * 60 * 1000,
    });
    await using _ = defer(async () => {
      await this.cache.delete('runtime:upgrade');
    });

    if (acquired) {
      for (const key of newConfigs) {
        await this.db.runtimeConfig.upsert({
          create: defaultRuntimeConfig[key],
          // old deleted setting should be restored
          update: {
            ...defaultRuntimeConfig[key],
            deletedAt: null,
          },
          where: {
            id: key,
          },
        });
      }

      await this.db.runtimeConfig.updateMany({
        where: {
          id: {
            in: deleteConfigs,
          },
        },
        data: {
          deletedAt: new Date(),
        },
      });
    }

    this.logger.log('Upgrade completed');
  }
}
