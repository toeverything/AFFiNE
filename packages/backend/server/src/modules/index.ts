import { join } from 'node:path';

import { DynamicModule, Type } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';

import { SERVER_FLAVOR } from '../config';
import { GqlModule } from '../graphql.module';
import { ServerConfigModule } from './config';
import { DocModule } from './doc';
import { PaymentModule } from './payment';
import { QuotaModule } from './quota';
import { SelfHostedModule } from './self-hosted';
import { StorageModule } from './storage';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const BusinessModules: (Type | DynamicModule)[] = [];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, DocModule);
    break;
  case 'selfhosted':
    BusinessModules.push(
      ServerConfigModule,
      SelfHostedModule,
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      SyncModule,
      DocModule,
      StorageModule,
      ServeStaticModule.forRoot({
        rootPath: join('/app', 'static'),
      })
    );
    break;
  case 'graphql':
    BusinessModules.push(
      ServerConfigModule,
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      DocModule,
      PaymentModule,
      QuotaModule,
      StorageModule
    );
    break;
  case 'allinone':
  default:
    BusinessModules.push(
      ServerConfigModule,
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      QuotaModule,
      SyncModule,
      DocModule,
      PaymentModule,
      StorageModule
    );
    break;
}

export { BusinessModules, SERVER_FLAVOR };
