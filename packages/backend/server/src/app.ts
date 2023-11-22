import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { CacheModule } from './cache';
import { ConfigModule } from './config';
import { MetricsModule } from './metrics';
import { BusinessModules } from './modules';
import { AuthModule } from './modules/auth';
import { PrismaModule } from './prisma';
import { SessionModule } from './session';
import { StorageModule } from './storage';
import { RateLimiterModule } from './throttler';

const BasicModules = [
  PrismaModule,
  ConfigModule.forRoot(),
  CacheModule,
  StorageModule.forRoot(),
  MetricsModule,
  SessionModule,
  RateLimiterModule,
  AuthModule,
];

@Module({
  imports: [...BasicModules, ...BusinessModules],
  controllers: [AppController],
})
export class AppModule {}
