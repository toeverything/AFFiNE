import type { DocFrontendDocState } from '@affine/nbstore';
import type {
  Table as OrmTable,
  TableSchemaBuilder,
} from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import type { UserDBEngine } from './user-db-engine';

export class UserDBTable<Schema extends TableSchemaBuilder> extends Entity<{
  table: OrmTable<Schema>;
  storageDocId: string;
  engine: UserDBEngine;
}> {
  readonly table = this.props.table;
  readonly docFrontend = this.props.engine.client.docFrontend;

  docSyncState$ = LiveData.from<DocFrontendDocState>(
    this.docFrontend.docState$(this.props.storageDocId),
    null as any
  );

  isSyncing$ = this.docSyncState$.map(docState => docState.syncing);

  isLoaded$ = this.docSyncState$.map(docState => docState.loaded);

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
