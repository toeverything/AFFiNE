import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { AppController } from './app.controller';
import { ConfigModule } from './config';
import { MetricsModule } from './metrics';
import { ExceptionLogger } from './middleware/exception-logger';
import { BusinessModules } from './modules';
import { PrismaModule } from './prisma';
import { StorageModule } from './storage';

@Module({
  imports: [
    PrismaModule,
    ConfigModule.forRoot(),
    StorageModule.forRoot(),
    MetricsModule,
    ...BusinessModules,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: ExceptionLogger,
    },
  ],
  controllers: [AppController],
})
export class AppModule {}
