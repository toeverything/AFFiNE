import { ExecutionContext, Global, Injectable, Module } from '@nestjs/common';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerOptionsFactory,
  ThrottlerStorageService,
} from '@nestjs/throttler';
import type { Request } from 'express';

import { Config } from '../config';
import { getRequestResponseFromContext } from '../utils/request';
import { THROTTLER_PROTECTED, Throttlers } from './decorators';

@Injectable()
export class ThrottlerStorage extends ThrottlerStorageService {}

@Injectable()
class CustomOptionsFactory implements ThrottlerOptionsFactory {
  constructor(
    private readonly config: Config,
    private readonly storage: ThrottlerStorage
  ) {}

  createThrottlerOptions() {
    const options: ThrottlerModuleOptions = {
      throttlers: [
        {
          name: 'default',
          ttl: this.config.rateLimiter.ttl * 1000,
          limit: this.config.rateLimiter.limit,
        },
        {
          name: 'strict',
          ttl: this.config.rateLimiter.ttl * 1000,
          limit: 20,
        },
      ],
      // skipIf: () => {
      //   return !this.config.node.prod || this.config.affine.canary;
      // },
      storage: this.storage,
    };

    return options;
  }
}

@Injectable()
export class CloudThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext) {
    return getRequestResponseFromContext(context) as any;
  }

  override getTracker(req: Request): Promise<string> {
    return Promise.resolve(
      //           ↓ prefer session id if available
      `throttler:${req.sid ?? req.get('CF-Connecting-IP') ?? req.get('CF-ray') ?? req.ip}`
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

  override async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number,
    throttlerOptions: ThrottlerOptions
  ) {
    const throttler = this.getThrottler(context);

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
    const { timeToExpire, totalHits } = await this.storageService.increment(
      key,
      ttl
    );

    if (totalHits > limit) {
      res.header('Retry-After', timeToExpire.toString());
      await this.throwThrottlingException(context, {
        limit,
        ttl,
        key,
        tracker,
        totalHits,
        timeToExpire,
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

    const throttler = this.getThrottler(context);

    // if user is logged in, bypass non-protected handlers
    if (!throttler && req.user) {
      return true;
    }

    return super.canActivate(context);
  }

  getThrottler(context: ExecutionContext) {
    return this.reflector.getAllAndOverride<Throttlers | undefined>(
      THROTTLER_PROTECTED,
      [context.getHandler(), context.getClass()]
    );
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
