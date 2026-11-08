import Redis from 'ioredis';

export interface CacheSetOptions {
  /**
   * in milliseconds
   */
  ttl?: number;
}

const GET_AND_DELETE_LUA = `
local value = redis.call("GET", KEYS[1])
if value then
  redis.call("DEL", KEYS[1])
end
return value
`;

const INCREASE_WITH_TTL_LUA = `
local value = redis.call("INCRBY", KEYS[1], ARGV[1])
if value == tonumber(ARGV[1]) or redis.call("PTTL", KEYS[1]) == -1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return value
`;

export function isValidCacheTtl(ttl: unknown): ttl is number {
  return typeof ttl === 'number' && Number.isSafeInteger(ttl) && ttl > 0;
}

export class CacheProvider {
  constructor(private readonly redis: Redis) {}

  // standard operation
  async get<T = unknown>(key: string): Promise<T> {
    return this.redis
      .get(key)
      .then(v => {
        if (v) {
          return JSON.parse(v);
        }
        return undefined;
      })
      .catch(() => undefined);
  }

  async set<T = unknown>(
    key: string,
    value: T,
    opts: CacheSetOptions = {}
  ): Promise<boolean> {
    if (isValidCacheTtl(opts.ttl)) {
      return this.redis
        .set(key, JSON.stringify(value), 'PX', opts.ttl)
        .then(() => true)
        .catch(() => false);
    }
    if (opts.ttl !== undefined) {
      return false;
    }

    return this.redis
      .set(key, JSON.stringify(value))
      .then(() => true)
      .catch(() => false);
  }

  async increase(key: string, count: number = 1): Promise<number> {
    return this.redis.incrby(key, count).catch(() => 0);
  }

  async increaseWithTtl(
    key: string,
    ttl: number,
    count: number = 1
  ): Promise<number> {
    if (!isValidCacheTtl(ttl)) return 0;
    return this.redis
      .eval(INCREASE_WITH_TTL_LUA, 1, key, count, ttl)
      .then(value => Number(value))
      .catch(() => 0);
  }

  async decrease(key: string, count: number = 1): Promise<number> {
    return this.redis.decrby(key, count).catch(() => 0);
  }

  async setnx<T = unknown>(
    key: string,
    value: T,
    opts: CacheSetOptions = {}
  ): Promise<boolean> {
    if (isValidCacheTtl(opts.ttl)) {
      return this.redis
        .set(key, JSON.stringify(value), 'PX', opts.ttl, 'NX')
        .then(v => !!v)
        .catch(() => false);
    }
    if (opts.ttl !== undefined) {
      return false;
    }

    return this.redis
      .set(key, JSON.stringify(value), 'NX')
      .then(v => !!v)
      .catch(() => false);
  }

  async delete(key: string): Promise<boolean> {
    return this.redis
      .del(key)
      .then(v => v > 0)
      .catch(() => false);
  }

  async getAndDelete<T = unknown>(key: string): Promise<T | undefined> {
    return this.redis
      .eval(GET_AND_DELETE_LUA, 1, key)
      .then(v => (typeof v === 'string' ? JSON.parse(v) : undefined))
      .catch(() => undefined);
  }

  async has(key: string): Promise<boolean> {
    return this.redis
      .exists(key)
      .then(v => v > 0)
      .catch(() => false);
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key).catch(() => 0);
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    return this.redis
      .pexpire(key, ttl)
      .then(v => v > 0)
      .catch(() => false);
  }

  // list operations
  async pushBack<T = unknown>(key: string, ...values: T[]): Promise<number> {
    return this.redis
      .rpush(key, ...values.map(v => JSON.stringify(v)))
      .catch(() => 0);
  }

  async pushFront<T = unknown>(key: string, ...values: T[]): Promise<number> {
    return this.redis
      .lpush(key, ...values.map(v => JSON.stringify(v)))
      .catch(() => 0);
  }

  async len(key: string): Promise<number> {
    return this.redis.llen(key).catch(() => 0);
  }

  async list<T = unknown>(
    key: string,
    start: number,
    end: number
  ): Promise<T[]> {
    return this.redis
      .lrange(key, start, end)
      .then(data => data.map(v => JSON.parse(v)))
      .catch(() => []);
  }

  async popFront<T = unknown>(key: string, count: number = 1): Promise<T[]> {
    return this.redis
      .lpop(key, count)
      .then(data => (data ?? []).map(v => JSON.parse(v)))
      .catch(() => []);
  }

  async popBack<T = unknown>(key: string, count: number = 1): Promise<T[]> {
    return this.redis
      .rpop(key, count)
      .then(data => (data ?? []).map(v => JSON.parse(v)))
      .catch(() => []);
  }

  // map operations
  async mapSet<T = unknown>(
    map: string,
    key: string,
    value: T
  ): Promise<boolean> {
    return this.redis
      .hset(map, key, JSON.stringify(value))
      .then(v => v > 0)
      .catch(() => false);
  }

  async mapIncrease(
    map: string,
    key: string,
    count: number = 1
  ): Promise<number> {
    return this.redis.hincrby(map, key, count);
  }

  async mapDecrease(
    map: string,
    key: string,
    count: number = 1
  ): Promise<number> {
    return this.redis.hincrby(map, key, -count);
  }

  async mapGet<T = unknown>(map: string, key: string): Promise<T | undefined> {
    return this.redis
      .hget(map, key)
      .then(v => (v ? JSON.parse(v) : undefined))
      .catch(() => undefined);
  }

  async mapDelete(map: string, key: string): Promise<boolean> {
    return this.redis
      .hdel(map, key)
      .then(v => v > 0)
      .catch(() => false);
  }

  async mapKeys(map: string): Promise<string[]> {
    return this.redis.hkeys(map).catch(() => []);
  }

  async mapRandomKey(map: string): Promise<string | undefined> {
    return this.redis
      .hrandfield(map, 1)
      .then(v =>
        typeof v === 'string'
          ? v
          : Array.isArray(v)
            ? (v[0] as string)
            : undefined
      )
      .catch(() => undefined);
  }

  async mapLen(map: string): Promise<number> {
    return this.redis.hlen(map).catch(() => 0);
  }
}
