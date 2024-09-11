import { createORMClient, Entity, YjsDBAdapter } from '@toeverything/infra';
import { Doc as YDoc } from 'yjs';

import { USER_DB_SCHEMA } from '../schema';
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
        this.engine.docEngine.addDoc(ydoc, false);
        this.engine.docEngine.setPriority(ydoc.guid, 50);
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
}

export type UserDBWithTables = UserDB & {
  [K in keyof USER_DB_SCHEMA]: UserDBTable<USER_DB_SCHEMA[K]>;
};
