import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AppController } from './app.controller';
import { CacheInterceptor, CacheModule } from './fundamentals/cache';
import { ConfigModule } from './fundamentals/config';
import { EventModule } from './fundamentals/event';
import { MailModule } from './fundamentals/mailer';
import { MetricsModule } from './fundamentals/metrics';
import { PrismaModule } from './fundamentals/prisma';
import { SessionModule } from './fundamentals/session';
import { RateLimiterModule } from './fundamentals/throttler';
import { BusinessModules } from './modules';
import { AuthModule } from './modules/auth';

export const FunctionalityModules: Array<Type | DynamicModule> = [
  ConfigModule.forRoot(),
  CacheModule,
  PrismaModule,
  MetricsModule,
  EventModule,
  SessionModule,
  RateLimiterModule,
  AuthModule,
  MailModule,
];

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
  imports: [...FunctionalityModules, ...BusinessModules],
  controllers: [AppController],
})
export class AppModule {}
