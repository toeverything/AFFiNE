import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { CacheInterceptor, CacheModule } from './cache';
import { ConfigModule, SERVER_FLAVOR } from './config';
import { EventModule } from './event';
import { BusinessModules } from './modules';
import { AuthModule } from './modules/auth';
import { PrismaModule } from './prisma';
import { SessionModule } from './session';
import { RateLimiterModule } from './throttler';

const BasicModules = [
  PrismaModule,
  ConfigModule.forRoot(),
  CacheModule,
  EventModule,
  SessionModule,
  RateLimiterModule,
  AuthModule,
];

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
