import type { Type } from '@nestjs/common';

import { GqlModule } from '../graphql.module';
import { AuthModule } from './auth';
import { MailModule } from './mail';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const { SERVER_FLAVOR } = process.env;

const BusinessModules: Type<any>[] = [];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule);
    break;
  case 'graphql':
    BusinessModules.push(
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      MailModule
    );
    break;
  case 'allinone':
  default:
    BusinessModules.push(
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      MailModule,
      SyncModule
    );
    break;
}

export { BusinessModules };
