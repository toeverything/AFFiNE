import { DynamicModule, Provider, Type } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { GqlModule } from '../graphql.module';
import { ExceptionLogger } from '../middleware/exception-logger';
import { AuthModule } from './auth';
import { DocModule } from './doc';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const { SERVER_FLAVOR } = process.env;
const { NODE_ENV } = process.env;

const BusinessModules: (Type | DynamicModule)[] = [];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, DocModule.forSync());
    break;
  case 'graphql':
    BusinessModules.push(
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      DocModule.forRoot()
    );
    break;
  case 'allinone':
  default:
    BusinessModules.push(
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      SyncModule,
      DocModule.forRoot()
    );
    break;
}

const Providers: Provider[] = [];

if (NODE_ENV !== 'test') {
  Providers.push({
    provide: APP_FILTER,
    useClass: ExceptionLogger,
  });
}

export { BusinessModules, Providers };
