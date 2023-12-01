import { DynamicModule, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { GqlModule } from '../graphql.module';
import { SERVER_FLAVOR, ServerConfigModule } from './config';
import { DocModule } from './doc';
import { PaymentModule } from './payment';
import { SelfHostedModule } from './self-hosted';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const BusinessModules: (Type | DynamicModule)[] = [
  EventEmitterModule.forRoot({
    global: true,
  }),
];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, DocModule.forSync());
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
      DocModule.forRoot()
    );
    break;
  case 'graphql':
    BusinessModules.push(
      ServerConfigModule,
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      DocModule.forRoot(),
      PaymentModule
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
      SyncModule,
      DocModule.forRoot(),
      PaymentModule
    );
    break;
}

export { BusinessModules, SERVER_FLAVOR };
