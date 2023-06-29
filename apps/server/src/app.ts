import { Module } from '@nestjs/common';

import { ConfigModule } from './config';
import { GqlModule } from './graphql.module';
import { BusinessModules } from './modules';
import { PrismaModule } from './prisma';
import { StorageModule } from './storage';

@Module({
  imports: [
    PrismaModule,
    GqlModule,
    ConfigModule.forRoot(),
    StorageModule.forRoot(),
    ...BusinessModules,
  ],
})
export class AppModule {}
