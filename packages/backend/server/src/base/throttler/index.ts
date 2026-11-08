import './config';

import { ExecutionContext, Global, Injectable, Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModule,
  type ThrottlerModuleOptions,
  ThrottlerOptionsFactory,
  ThrottlerRequest,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { Config } from '../config';
import { CacheRedis } from '../redis';
import { getRequestResponseFromContext } from '../utils/request';
import { getRequestTrackerId } from '../utils/request-tracker';
import type { ThrottlerType } from './config';
import { THROTTLER_PROTECTED, Throttlers } from './decorators';

const REDIS_THROTTLE_SCRIPT = `
local now = redis.call("TIME")
local nowMs = now[1] * 1000 + math.floor(now[2] / 1000)
local blockedUntil = tonumber(redis.call("HGET", KEYS[1], "blockedUntil")) or 0

if blockedUntil > nowMs then
  return {
    tonumber(redis.call("HGET", KEYS[1], "hits")) or 0,
    redis.call("PTTL", KEYS[1]),
    blockedUntil - nowMs
  }
end

if blockedUntil > 0 then
  redis.call("HDEL", KEYS[1], "blockedUntil")
  redis.call("HSET", KEYS[1], "hits", 0)
end

local hits = redis.call("HINCRBY", KEYS[1], "hits", 1)
if hits == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end

local blockTtl = 0
if hits > tonumber(ARGV[2]) then
  blockedUntil = nowMs + tonumber(ARGV[3])
  redis.call("HSET", KEYS[1], "blockedUntil", blockedUntil)
  if redis.call("PTTL", KEYS[1]) < tonumber(ARGV[3]) then
    redis.call("PEXPIRE", KEYS[1], ARGV[3])
  end
  blockTtl = tonumber(ARGV[3])
end

return { hits, redis.call("PTTL", KEYS[1]), blockTtl }
`;

@Injectable()
export class ThrottlerStorage extends ThrottlerStorageService {
  constructor(private readonly redis: CacheRedis) {
    super();
  }

  override async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ) {
    if (env.testing) {
      return super.increment(key, ttl, limit, blockDuration, throttlerName);
    }

    try {
      const result = await this.redis.eval(
        REDIS_THROTTLE_SCRIPT,
        1,
        key,
        ttl,
        limit,
        Math.max(blockDuration, 1)
      );
      if (!Array.isArray(result) || result.length !== 3) {
        throw new Error('Unexpected Redis throttler response');
      }

      const totalHits = Number(result[0]);
      const timeToExpire = Math.max(0, Math.ceil(Number(result[1]) / 1000));
      const timeToBlockExpire = Math.max(
        0,
        Math.ceil(Number(result[2]) / 1000)
      );

      return {
        totalHits,
        timeToExpire,
        isBlocked: timeToBlockExpire > 0,
        timeToBlockExpire,
      };
    } catch {
      // Preserve availability if Redis is unavailable. The inherited local
      // storage still protects each process while the shared limiter recovers.
      return super.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }
}

@Injectable()
class CustomOptionsFactory implements ThrottlerOptionsFactory {
  constructor(
    private readonly config: Config,
    private readonly storage: ThrottlerStorage
  ) {}

  createThrottlerOptions() {
    const options: ThrottlerModuleOptions = {
      throttlers: Object.entries(this.config.throttle.throttlers).map(
        ([name, config]) => ({
          name,
          ...config,
        })
      ),
      storage: this.storage,
    };

    return options;
  }
}

@Injectable()
export class CloudThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly config: Config
  ) {
    super(options, storageService, reflector);
  }

  override getRequestResponse(context: ExecutionContext): {
    req: Request;
    res: Response;
  } {
    return getRequestResponseFromContext(context) as any;
  }

  override getTracker(req: Request): Promise<string> {
    // throttler prefix make the key in store recognizable
    return Promise.resolve(`throttler:${getRequestTrackerId(req)}`);
  }

  override generateKey(
    context: ExecutionContext,
    tracker: string,
    throttler: string
  ) {
    if (tracker.endsWith(';custom')) {
      return `${tracker};${throttler}:${context.getClass().name}.${context.getHandler().name}`;
    }

    return `${tracker};${throttler}`;
  }

  override async handleRequest(request: ThrottlerRequest) {
    const {
      context,
      throttler: throttlerOptions,
      ttl,
      blockDuration,
    } = request;

    let limit = request.limit;

    // give it 'default' if no throttler is specified,
    // so the unauthenticated users visits will always hit default throttler
    // authenticated users will directly bypass unprotected APIs in [CloudThrottlerGuard.canActivate]
    const throttler = this.getSpecifiedThrottler(context) ?? 'default';

    // by pass unmatched throttlers
    if (throttlerOptions.name !== throttler) {
      return true;
    }

    const { req, res } = this.getRequestResponse(context);
    const ignoreUserAgents =
      throttlerOptions.ignoreUserAgents ?? this.commonOptions.ignoreUserAgents;
    if (Array.isArray(ignoreUserAgents)) {
      for (const pattern of ignoreUserAgents) {
        const ua = req.headers['user-agent'];
        if (ua && pattern.test(ua)) {
          return true;
        }
      }
    }

    let tracker = await this.getTracker(req);

    // custom limit or ttl APIs will be treated standalone
    if (limit !== throttlerOptions.limit || ttl !== throttlerOptions.ttl) {
      tracker += ';custom';
    }

    const key = this.generateKey(
      context,
      tracker,
      throttlerOptions.name ?? 'default'
    );
    const { timeToExpire, totalHits, isBlocked, timeToBlockExpire } =
      await this.storageService.increment(key, ttl, limit, blockDuration, key);

    if (isBlocked) {
      res.header('Retry-After', timeToBlockExpire.toString());
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire,
      });
    }

    res.header(`${this.headerPrefix}-Limit`, limit.toString());
    res.header(
      `${this.headerPrefix}-Remaining`,
      (limit - totalHits).toString()
    );
    res.header(`${this.headerPrefix}-Reset`, timeToExpire.toString());
    return true;
  }

  override async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.config.throttle.enabled) {
      return true;
    }

    const { req } = this.getRequestResponse(context);

    const throttler = this.getSpecifiedThrottler(context);

    // if user is logged in, bypass non-protected handlers
    if (!throttler && req.session?.user) {
      return true;
    }

    return super.canActivate(context);
  }

  getSpecifiedThrottler(context: ExecutionContext): ThrottlerType | undefined {
    const throttler = this.reflector.getAllAndOverride<Throttlers | undefined>(
      THROTTLER_PROTECTED,
      [context.getHandler(), context.getClass()]
    );

    return throttler === 'authenticated' ? undefined : throttler;
  }
}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useClass: CustomOptionsFactory,
    }),
  ],
  providers: [ThrottlerStorage, CloudThrottlerGuard],
  exports: [ThrottlerStorage, CloudThrottlerGuard],
})
export class RateLimiterModule {}

export * from './decorators';
