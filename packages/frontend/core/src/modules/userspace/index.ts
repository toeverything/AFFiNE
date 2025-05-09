export { UserspaceService as UserDBService } from './services/userspace';

import type { Framework } from '@toeverything/infra';

import { AuthService, ServerService } from '../cloud';
import { ServerScope } from '../cloud/scopes/server';
import { NbstoreService } from '../storage';
import { CurrentUserDB } from './entities/current-user-db';
import { UserDB } from './entities/user-db';
import { UserDBEngine } from './entities/user-db-engine';
import { UserDBTable } from './entities/user-db-table';
import { UserspaceService } from './services/userspace';

export function configureUserspaceModule(framework: Framework) {
  framework
    .scope(ServerScope)
    .service(UserspaceService)
    .entity(CurrentUserDB, [UserspaceService, AuthService])
    .entity(UserDB)
    .entity(UserDBTable)
    .entity(UserDBEngine, [NbstoreService, ServerService]);
}
