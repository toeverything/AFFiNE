import { ObjectPool, Service } from '@toeverything/infra';

import { CurrentUserDB } from '../entities/current-user-db';
import { UserDB, type UserDBWithTables } from '../entities/user-db';

export class UserspaceService extends Service {
  pool = new ObjectPool<string, UserDBWithTables>({
    onDelete(obj) {
      obj.dispose();
    },
    onDangling(obj) {
      return obj.engine.canGracefulStop();
    },
  });

  private _currentUserDB: CurrentUserDB | null = null;

  get currentUserDB() {
    if (!this._currentUserDB) {
      this._currentUserDB = this.framework.createEntity(CurrentUserDB);
    }
    return this._currentUserDB;
  }

  openDB(userId: string) {
    const exists = this.pool.get(userId);
    if (exists) {
      return exists;
    }
    const db = this.framework.createEntity(UserDB, {
      userId,
    }) as UserDBWithTables;
    return this.pool.put(userId, db);
  }
}
