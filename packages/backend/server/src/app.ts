import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { CacheInterceptor, CacheModule } from './cache';
import { RedisModule } from './cache/redis';
import { ConfigModule, SERVER_FLAVOR } from './config';
import { EventModule } from './event';
import { MetricsModule } from './metrics';
import { BusinessModules } from './modules';
import { AuthModule } from './modules/auth';
import { PrismaModule } from './prisma';
import { SessionModule } from './session';
import { RateLimiterModule } from './throttler';

export const BasicModules = [
  ConfigModule.forRoot(),
  CacheModule,
  PrismaModule,
  MetricsModule,
  EventModule,
  SessionModule,
  RateLimiterModule,
  AuthModule,
];

// better module registration logic
if (AFFiNE.redis.enabled) {
  BasicModules.push(RedisModule);
}

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
  imports: [...BasicModules, ...BusinessModules],
  controllers: SERVER_FLAVOR === 'selfhosted' ? [] : [AppController],
})
export class AppModule {}
