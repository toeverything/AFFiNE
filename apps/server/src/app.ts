import { Module } from '@nestjs/common';

import { ConfigModule } from './config';
import { GqlModule } from './graphql.module';
import { BusinessModules } from './modules';
import { PrismaModule } from './prisma';

@Module({
  imports: [
    PrismaModule,
    GqlModule,
    ConfigModule.forRoot(),
    ...BusinessModules,
  ],
})
export class AppModule {}
