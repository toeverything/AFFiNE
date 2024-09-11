import { Entity } from '../../../framework';
import type { Table as OrmTable, TableSchemaBuilder } from '../../../orm';
import type { WorkspaceService } from '../../workspace';

export class WorkspaceDBTable<
  Schema extends TableSchemaBuilder,
> extends Entity<{
  table: OrmTable<Schema>;
  storageDocId: string;
}> {
  readonly table = this.props.table;

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  isSyncing$ = this.workspaceService.workspace.engine.doc
    .docState$(this.props.storageDocId)
    .map(docState => docState.syncing);

  isLoading$ = this.workspaceService.workspace.engine.doc
    .docState$(this.props.storageDocId)
    .map(docState => docState.loading);

  create = this.table.create.bind(this.table);
  update = this.table.update.bind(this.table);
  get = this.table.get.bind(this.table);
  // eslint-disable-next-line rxjs/finnish
  get$ = this.table.get$.bind(this.table);
  find = this.table.find.bind(this.table);
  // eslint-disable-next-line rxjs/finnish
  find$ = this.table.find$.bind(this.table);
  keys = this.table.keys.bind(this.table);
  delete = this.table.delete.bind(this.table);
}
