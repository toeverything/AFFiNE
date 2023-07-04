import { AuthModule } from './auth';
import { SyncModule } from './sync';
import { UsersModule } from './users';
import { WorkspaceModule } from './workspaces';

export const BusinessModules = [
  AuthModule,
  WorkspaceModule,
  UsersModule,
  SyncModule,
];
