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
import { getRequestResponseFromContext } from '../utils/request';
import type { ThrottlerType } from './config';
import { THROTTLER_PROTECTED, Throttlers } from './decorators';

@Injectable()
export class ThrottlerStorage extends ThrottlerStorageService {}

@Injectable()
class CustomOptionsFactory implements ThrottlerOptionsFactory {
  constructor(private readonly storage: ThrottlerStorage) {}

  createThrottlerOptions() {
    const options: ThrottlerModuleOptions = {
      throttlers: Object.entries(AFFiNE.throttler).map(([name, config]) => ({
        name,
        ...config,
      })),
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
    return Promise.resolve(
      //           ↓ prefer session id if available
      `throttler:${req.session?.sessionId ?? req.get('CF-Connecting-IP') ?? req.get('CF-ray') ?? req.ip}`
      // ^ throttler prefix make the key in store recognizable
    );
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

    if (this.config.node.dev) {
      limit = Number.MAX_SAFE_INTEGER;
    } else {
      // custom limit or ttl APIs will be treated standalone
      if (limit !== throttlerOptions.limit || ttl !== throttlerOptions.ttl) {
        tracker += ';custom';
      }
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
