import {
  createORMClient,
  Entity,
  YOctoDBAdapter,
  YOctoDocSession,
} from '@toeverything/infra';

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
    new YOctoDBAdapter(USER_DB_SCHEMA, {
      getDoc: guid => {
        const doc = new YOctoDocSession({
          guid,
          undo: 'disabled',
        });
        this.engine.client.docFrontend.connectDoc(doc);
        this.engine.client.docFrontend.addPriority(doc.guid, 50);
        return doc;
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
