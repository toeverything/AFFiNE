import type {
  Table as OrmTable,
  TableSchemaBuilder,
} from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { distinctUntilChanged, map } from 'rxjs';

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

  isReady$ = LiveData.from(
    this.workspaceService.workspace.engine.doc
      .docState$(this.props.storageDocId)
      .pipe(
        map(docState => docState.ready),
        distinctUntilChanged()
      ),
    false
  );

  isSyncing$ = LiveData.from(
    this.workspaceService.workspace.engine.doc
      .docState$(this.props.storageDocId)
      .pipe(
        map(docState => docState.syncing),
        distinctUntilChanged()
      ),
    false
  );

  isLoading$ = LiveData.from(
    this.workspaceService.workspace.engine.doc
      .docState$(this.props.storageDocId)
      .pipe(map(docState => !docState.loaded)),
    false
  );

  create = this.table.create.bind(this.table) as typeof this.table.create;
  update = this.table.update.bind(this.table) as typeof this.table.update;
  get = this.table.get.bind(this.table) as typeof this.table.get;
  get$ = this.table.get$.bind(this.table) as typeof this.table.get$;
  find = this.table.find.bind(this.table) as typeof this.table.find;
  find$ = this.table.find$.bind(this.table) as typeof this.table.find$;
  select = this.table.select.bind(this.table) as typeof this.table.select;
  select$ = this.table.select$.bind(this.table) as typeof this.table.select$;
  keys = this.table.keys.bind(this.table) as typeof this.table.keys;
  delete = this.table.delete.bind(this.table) as typeof this.table.delete;
}
