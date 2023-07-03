import { Module } from '@nestjs/common';

import { AppController } from './app.controller';
import { ConfigModule } from './config';
import { GqlModule } from './graphql.module';
import { BusinessModules } from './modules';
import { SyncModule } from './modules/sync';
import { PrismaModule } from './prisma';
import { StorageModule } from './storage';

@Module({
  imports: [
    PrismaModule,
    GqlModule,
    SyncModule,
    ConfigModule.forRoot(),
    StorageModule.forRoot(),
    ...BusinessModules,
  ],
  controllers: [AppController],
})
export class AppModule {}
