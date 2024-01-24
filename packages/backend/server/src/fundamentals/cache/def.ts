export interface CacheSetOptions {
  /**
   * in milliseconds
   */
  ttl?: number;
}

// extends if needed
export interface Cache {
  // standard operation
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(
    key: string,
    value: T,
    opts?: CacheSetOptions
  ): Promise<boolean>;
  setnx<T = unknown>(
    key: string,
    value: T,
    opts?: CacheSetOptions
  ): Promise<boolean>;
  increase(key: string, count?: number): Promise<number>;
  decrease(key: string, count?: number): Promise<number>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<boolean>;

  // list operations
  pushBack<T = unknown>(key: string, ...values: T[]): Promise<number>;
  pushFront<T = unknown>(key: string, ...values: T[]): Promise<number>;
  len(key: string): Promise<number>;
  list<T = unknown>(key: string, start: number, end: number): Promise<T[]>;
  popFront<T = unknown>(key: string, count?: number): Promise<T[]>;
  popBack<T = unknown>(key: string, count?: number): Promise<T[]>;

  // map operations
  mapSet<T = unknown>(
    map: string,
    key: string,
    value: T,
    opts: CacheSetOptions
  ): Promise<boolean>;
  mapIncrease(map: string, key: string, count?: number): Promise<number>;
  mapDecrease(map: string, key: string, count?: number): Promise<number>;
  mapGet<T = unknown>(map: string, key: string): Promise<T | undefined>;
  mapDelete(map: string, key: string): Promise<boolean>;
  mapKeys(map: string): Promise<string[]>;
  mapRandomKey(map: string): Promise<string | undefined>;
  mapLen(map: string): Promise<number>;
}
