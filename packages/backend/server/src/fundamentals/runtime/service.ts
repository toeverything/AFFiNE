import { PrismaClient } from '@prisma/client';

import { Cache } from '../cache';
import { Config } from '../config';
import {
  DefaultRuntimeConfigs,
  type RuntimeConfig,
  type RuntimeConfigKey,
} from './def';

/**
 * runtime.get(k)
 * runtime.set(k, v)
 * runtime.update(k, (v) => {
 *
 * })
 */
export class Runtime {
  constructor(
    public readonly config: Config,
    private readonly db: PrismaClient,
    private readonly cache: Cache,
    private readonly defaultConfigs: DefaultRuntimeConfigs
  ) {}

  async get<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K
  ): Promise<V> {
    const cached = await this.loadCache<K, V>(k);

    if (cached) {
      return cached;
    }

    const dbValue = await this.loadDb<K, V>(k);

    if (!dbValue) {
      throw new Error(`Runtime config ${k} not found`);
    }

    await this.setCache(k, dbValue);

    return dbValue;
  }

  async set<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K,
    v: V
  ) {
    await this.db.applicationSetting.upsert({
      where: {
        key: k,
      },
      create: {
        key: k,
        value: JSON.stringify(v),
      },
      update: {
        value: JSON.stringify(v),
      },
    });

    await this.setCache(k, v);
  }

  async update<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K,
    modifier: (v: V) => V | Promise<V>
  ) {
    const data = await this.loadDb<K, V>(k);

    const updated = await modifier(data);

    await this.set(k, updated);

    return updated;
  }

  async loadDb<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K
  ): Promise<V> {
    const v = await this.db.applicationSetting.findUnique({
      where: {
        key: k,
      },
    });

    if (v) {
      return JSON.parse(v.value);
    } else {
      return this.defaultConfigs[k] as V;
    }
  }

  async loadCache<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K
  ): Promise<V | undefined> {
    return this.cache.get<V>(`runtime:${k}`);
  }

  async setCache<K extends RuntimeConfigKey, V extends RuntimeConfig<K>>(
    k: K,
    v: V
  ): Promise<boolean> {
    return this.cache.set<V>(k, v, { ttl: 60 * 1000 });
  }
}
