import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { CacheModule } from './cache';
import { ConfigModule } from './config';
import { EventModule } from './event';
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
  EventModule,
  StorageModule.forRoot(),
  SessionModule,
  RateLimiterModule,
  AuthModule,
];

@Module({
  imports: [...BasicModules, ...BusinessModules],
  controllers: [AppController],
})
export class AppModule {}
