import { GqlModule } from '../graphql.module';
import { AuthModule } from './auth';
import { SyncModule } from './sync';
import { UpdateManagerModule } from './update-manager';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

const { SERVER_FLAVOR } = process.env;

const BusinessModules: any[] = [];

switch (SERVER_FLAVOR) {
  case 'sync':
    BusinessModules.push(SyncModule, UpdateManagerModule.forSync());
    break;
  case 'graphql':
    BusinessModules.push(
      GqlModule,
      WorkspaceModule,
      UsersModule,
      AuthModule,
      UpdateManagerModule.forRoot()
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
      UpdateManagerModule.forRoot()
    );
    break;
}

export { BusinessModules };
