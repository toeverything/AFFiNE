import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import {
  Throttle,
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerModuleOptions,
  ThrottlerOptionsFactory,
} from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from 'nestjs-throttler-storage-redis';

import { ThrottlerCache } from './cache';
import { Config } from './config';
import { getRequestResponseFromContext } from './utils/nestjs';

@Injectable()
class CustomOptionsFactory implements ThrottlerOptionsFactory {
  constructor(
    private readonly config: Config,
    private readonly cache: ThrottlerCache
  ) {}
  createThrottlerOptions() {
    const options: ThrottlerModuleOptions = {
      throttlers: [
        {
          ttl: this.config.rateLimiter.ttl,
          limit: this.config.rateLimiter.limit,
        },
      ],
      skipIf: () => {
        return !this.config.node.prod || this.config.affine.canary;
      },
    };

    if (this.config.redis.enabled) {
      new Logger(RateLimiterModule.name).log('Use Redis');
      options.storage = new ThrottlerStorageRedisService(
        // @ts-expect-error hidden field
        this.cache.redis
      );
    }

    return options;
  }
}

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      useClass: CustomOptionsFactory,
    }),
  ],
})
export class RateLimiterModule {}

@Injectable()
export class CloudThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext) {
    return getRequestResponseFromContext(context) as any;
  }

  protected override getTracker(req: Record<string, any>): Promise<string> {
    return Promise.resolve(
      req?.get('CF-Connecting-IP') ?? req?.get('CF-ray') ?? req?.ip
    );
  }
}

@Injectable()
export class AuthThrottlerGuard extends CloudThrottlerGuard {
  override async handleRequest(
    context: ExecutionContext,
    limit: number,
    ttl: number
  ): Promise<boolean> {
    const { req } = this.getRequestResponse(context);

    if (req?.url === '/api/auth/session') {
      // relax throttle for session auto renew
      return super.handleRequest(context, limit * 20, ttl, {
        ttl: ttl * 20,
        limit: limit * 20,
      });
    }

    return super.handleRequest(context, limit, ttl, {
      ttl,
      limit,
    });
  }
}

export { Throttle };
