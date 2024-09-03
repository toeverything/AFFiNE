import Keyv, { KeyvOptions } from 'keyv';

import type { Cache, CacheSetOptions } from './def';

export class LocalCache implements Cache {
  private readonly kv: Keyv;

  constructor(opts: KeyvOptions = {}) {
    this.kv = new Keyv(opts);
  }

  // standard operation
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.kv.get<T>(key).catch(() => undefined);
  }

  async set<T = unknown>(
    key: string,
    value: T,
    opts: CacheSetOptions = {}
  ): Promise<boolean> {
    return this.kv
      .set(key, value, opts.ttl)
      .then(() => true)
      .catch(() => false);
  }

  async setnx<T = unknown>(
    key: string,
    value: T,
    opts?: CacheSetOptions | undefined
  ): Promise<boolean> {
    if (!(await this.has(key))) {
      return this.set(key, value, opts);
    }
    return false;
  }

  async increase(key: string, count: number = 1): Promise<number> {
    const prev = (await this.get(key)) ?? 0;
    if (typeof prev !== 'number') {
      throw new Error(
        `Expect a Number keyed by ${key}, but found ${typeof prev}`
      );
    }

    const curr = prev + count;
    return (await this.set(key, curr)) ? curr : prev;
  }

  async decrease(key: string, count: number = 1): Promise<number> {
    return this.increase(key, -count);
  }

  async delete(key: string): Promise<boolean> {
    return this.kv.delete(key).catch(() => false);
  }

  async has(key: string): Promise<boolean> {
    return this.kv.has(key).catch(() => false);
  }

  async ttl(key: string): Promise<number> {
    return this.kv
      .get(key, { raw: true })
      .then(raw => (raw?.expires ? raw.expires - Date.now() : Infinity))
      .catch(() => 0);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const value = await this.kv.get(key);
    return this.set(key, value, { ttl });
  }

  // list operations
  private async getArray<T = unknown>(key: string) {
    const raw = await this.kv.get<T[]>(key, { raw: true });
    if (raw && !Array.isArray(raw.value)) {
      throw new Error(
        `Expect an Array keyed by ${key}, but found ${raw.value}`
      );
    }

    return raw;
  }

  private async setArray<T = unknown>(
    key: string,
    value: T[],
    opts: CacheSetOptions = {}
  ) {
    return this.set(key, value, opts).then(() => value.length);
  }

  async pushBack<T = unknown>(key: string, ...values: T[]): Promise<number> {
    let list: any[] = [];
    let ttl: number | undefined = undefined;
    const raw = await this.getArray(key);
    if (raw) {
      if (raw.value) {
        list = raw.value;
      }
      if (raw.expires) {
        ttl = raw.expires - Date.now();
      }
    }

    list = list.concat(values);
    return this.setArray(key, list, { ttl });
  }

  async pushFront<T = unknown>(key: string, ...values: T[]): Promise<number> {
    let list: any[] = [];
    let ttl: number | undefined = undefined;
    const raw = await this.getArray(key);
    if (raw) {
      if (raw.value) {
        list = raw.value;
      }
      if (raw.expires) {
        ttl = raw.expires - Date.now();
      }
    }

    list = values.concat(list);
    return this.setArray(key, list, { ttl });
  }

  async len(key: string): Promise<number> {
    return this.getArray<any[]>(key).then(v => v?.value?.length ?? 0);
  }

  /**
   * list array elements with `[start, end]`
   * the end indice is inclusive
   */
  async list<T = unknown>(
    key: string,
    start: number,
    end: number
  ): Promise<T[]> {
    const raw = await this.getArray<T>(key);
    if (raw?.value) {
      start = (raw.value.length + start) % raw.value.length;
      end = ((raw.value.length + end) % raw.value.length) + 1;
      return raw.value.slice(start, end);
    } else {
      return [];
    }
  }

  private async trim<T = unknown>(key: string, start: number, end: number) {
    const raw = await this.getArray<T>(key);
    if (raw && raw.value) {
      start = (raw.value.length + start) % raw.value.length;
      // make negative end index work, and end indice is inclusive
      end = ((raw.value.length + end) % raw.value.length) + 1;
      const result = raw.value.splice(start, end);

      await this.set(key, raw.value, {
        ttl: raw.expires ? raw.expires - Date.now() : undefined,
      });

      return result;
    }

    return [];
  }

  async popFront<T = unknown>(key: string, count: number = 1) {
    return this.trim<T>(key, 0, count - 1);
  }

  async popBack<T = unknown>(key: string, count: number = 1) {
    return this.trim<T>(key, -count, count - 1);
  }

  // map operations
  private async getMap<T = unknown>(map: string) {
    const raw = await this.kv.get<Record<string, T>>(map, { raw: true });

    if (raw) {
      if (typeof raw.value !== 'object') {
        throw new Error(
          `Expect an Object keyed by ${map}, but found ${typeof raw}`
        );
      }

      if (Array.isArray(raw.value)) {
        throw new Error(`Expect an Object keyed by ${map}, but found an Array`);
      }
    }

    return raw;
  }

  private async setMap<T = unknown>(
    map: string,
    value: Record<string, T>,
    opts: CacheSetOptions = {}
  ) {
    return this.kv.set(map, value, opts.ttl).then(() => true);
  }

  async mapGet<T = unknown>(map: string, key: string): Promise<T | undefined> {
    const raw = await this.getMap<T>(map);
    if (raw?.value) {
      return raw.value[key];
    }

    return undefined;
  }

  async mapSet<T = unknown>(
    map: string,
    key: string,
    value: T
  ): Promise<boolean> {
    const raw = await this.getMap(map);
    const data = raw?.value ?? {};

    data[key] = value;

    return this.setMap(map, data, {
      ttl: raw?.expires ? raw.expires - Date.now() : undefined,
    });
  }

  async mapDelete(map: string, key: string): Promise<boolean> {
    const raw = await this.getMap(map);

    if (raw?.value) {
      delete raw.value[key];
      return this.setMap(map, raw.value, {
        ttl: raw.expires ? raw.expires - Date.now() : undefined,
      });
    }

    return false;
  }

  async mapIncrease(
    map: string,
    key: string,
    count: number = 1
  ): Promise<number> {
    const prev = (await this.mapGet(map, key)) ?? 0;

    if (typeof prev !== 'number') {
      throw new Error(
        `Expect a Number keyed by ${key}, but found ${typeof prev}`
      );
    }

    const curr = prev + count;

    return (await this.mapSet(map, key, curr)) ? curr : prev;
  }

  async mapDecrease(
    map: string,
    key: string,
    count: number = 1
  ): Promise<number> {
    return this.mapIncrease(map, key, -count);
  }

  async mapKeys(map: string): Promise<string[]> {
    const raw = await this.getMap(map);
    if (raw?.value) {
      return Object.keys(raw.value);
    }

    return [];
  }

  async mapRandomKey(map: string): Promise<string | undefined> {
    const keys = await this.mapKeys(map);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  async mapLen(map: string): Promise<number> {
    const raw = await this.getMap(map);
    return raw?.value ? Object.keys(raw.value).length : 0;
  }
}
