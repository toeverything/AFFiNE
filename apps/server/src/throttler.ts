import { ExecutionContext, Injectable } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { Config, ConfigModule } from './config';
import { getRequestResponseFromContext } from './utils/nestjs';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [Config],
      useFactory: (config: Config) => ({
        ttl: config.rateLimiter.ttl,
        limit: config.rateLimiter.limit,
      }),
    }),
  ],
})
export class RateLimiterModule {}

@Injectable()
export class CloudThrottlerGuard extends ThrottlerGuard {
  override getRequestResponse(context: ExecutionContext) {
    return getRequestResponseFromContext(context) as any;
  }

  protected override getTracker(req: Record<string, any>): string {
    return req.ips.length ? req.ips[0] : req.ip;
  }
}

export { Throttle };
