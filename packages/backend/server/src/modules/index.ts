import { DynamicModule, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { GqlModule } from '../graphql.module';
import { AuthModule } from './auth';
import { DocModule } from './doc';
import { PaymentModule } from './payment';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const { SERVER_FLAVOR } = process.env;

const BusinessModules: (Type | DynamicModule)[] = [
  EventEmitterModule.forRoot({
    global: true,
  }),
];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, DocModule.forSync());
    break;
  case 'graphql':
    BusinessModules.push(
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      DocModule.forRoot(),
      PaymentModule
    );
    break;
  case 'allinone':
  default:
    BusinessModules.push(
      ScheduleModule.forRoot(),
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      SyncModule,
      DocModule.forRoot(),
      PaymentModule
    );
    break;
}

export { BusinessModules };
