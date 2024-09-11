import type {
  Table as OrmTable,
  TableSchemaBuilder,
} from '@toeverything/infra';
import { Entity } from '@toeverything/infra';

import type { UserDBEngine } from './user-db-engine';

export class UserDBTable<Schema extends TableSchemaBuilder> extends Entity<{
  table: OrmTable<Schema>;
  storageDocId: string;
  engine: UserDBEngine;
}> {
  readonly table = this.props.table;
  readonly docEngine = this.props.engine.docEngine;

  isSyncing$ = this.docEngine
    .docState$(this.props.storageDocId)
    .map(docState => docState.syncing);

  isLoading$ = this.docEngine
    .docState$(this.props.storageDocId)
    .map(docState => docState.loading);

  create: typeof this.table.create = this.table.create.bind(this.table);
  update: typeof this.table.update = this.table.update.bind(this.table);
  get: typeof this.table.get = this.table.get.bind(this.table);
  // eslint-disable-next-line rxjs/finnish
  get$: typeof this.table.get$ = this.table.get$.bind(this.table);
  find: typeof this.table.find = this.table.find.bind(this.table);
  // eslint-disable-next-line rxjs/finnish
  find$: typeof this.table.find$ = this.table.find$.bind(this.table);
  keys: typeof this.table.keys = this.table.keys.bind(this.table);
  delete: typeof this.table.delete = this.table.delete.bind(this.table);
}
