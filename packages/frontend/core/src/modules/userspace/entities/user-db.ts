import { createORMClient, Entity, YjsDBAdapter } from '@toeverything/infra';
import { Doc as YDoc } from 'yjs';

import { USER_DB_SCHEMA, type UserDbSchema } from '../schema';
import { UserDBEngine } from './user-db-engine';
import { UserDBTable } from './user-db-table';

const UserDBClient = createORMClient(USER_DB_SCHEMA);

export class UserDB extends Entity<{
  userId: string;
}> {
  readonly engine = this.framework.createEntity(UserDBEngine, {
    userId: this.props.userId,
  });
  readonly db = new UserDBClient(
    new YjsDBAdapter(USER_DB_SCHEMA, {
      getDoc: guid => {
        const ydoc = new YDoc({
          guid,
        });
        this.engine.client.docFrontend.connectDoc(ydoc);
        this.engine.client.docFrontend.addPriority(ydoc.guid, 50);
        return ydoc;
      },
    })
  );

  constructor() {
    super();
    Object.entries(USER_DB_SCHEMA).forEach(([tableName]) => {
      const table = this.framework.createEntity(UserDBTable, {
        table: this.db[tableName as keyof typeof USER_DB_SCHEMA],
        storageDocId: tableName,
        engine: this.engine,
      });
      Object.defineProperty(this, tableName, {
        get: () => table,
      });
    });
  }

  override dispose(): void {
    this.engine.dispose();
  }
}

export type UserDBWithTables = UserDB & {
  [K in keyof UserDbSchema]: UserDBTable<UserDbSchema[K]>;
};
