export { UserspaceService as UserDBService } from './services/userspace';

import type { Framework } from '@toeverything/infra';

import { AuthService, WebSocketService } from '../cloud';
import { CurrentUserDB } from './entities/current-user-db';
import { UserDB } from './entities/user-db';
import { UserDBEngine } from './entities/user-db-engine';
import { UserDBTable } from './entities/user-db-table';
import { IndexedDBUserspaceDocStorage } from './impls/indexeddb-storage';
import { SqliteUserspaceDocStorage } from './impls/sqlite-storage';
import { UserspaceStorageProvider } from './provider/storage';
import { UserspaceService } from './services/userspace';

export function configureUserspaceModule(framework: Framework) {
  framework
    .service(UserspaceService)
    .entity(CurrentUserDB, [UserspaceService, AuthService])
    .entity(UserDB)
    .entity(UserDBTable)
    .entity(UserDBEngine, [UserspaceStorageProvider, WebSocketService]);
}

export function configureIndexedDBUserspaceStorageProvider(
  framework: Framework
) {
  framework.impl(UserspaceStorageProvider, {
    getDocStorage(userId: string) {
      return new IndexedDBUserspaceDocStorage(userId);
    },
  });
}

export function configureSqliteUserspaceStorageProvider(framework: Framework) {
  framework.impl(UserspaceStorageProvider, {
    getDocStorage(userId: string) {
      return new SqliteUserspaceDocStorage(userId);
    },
  });
}
