import { DynamicModule, Type } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { GqlModule } from '../graphql.module';
import { AuthModule } from './auth';
import { DocModule } from './doc';
import { PaymentModule } from './payment';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const { SERVER_FLAVOR } = process.env;

const BusinessModules: (Type | DynamicModule)[] = [];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, DocModule.forSync());
    break;
  case 'graphql':
    BusinessModules.push(
      EventEmitterModule.forRoot({
        global: true,
      }),
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
      EventEmitterModule.forRoot({
        global: true,
      }),
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
