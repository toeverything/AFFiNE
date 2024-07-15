import { Doc as YDoc } from 'yjs';

import { Service } from '../../../framework';
import { createORMClient, type TableMap, YjsDBAdapter } from '../../../orm';
import type { WorkspaceService } from '../../workspace';
import { AFFiNE_DB_SCHEMA } from '../schema';

export class DBService extends Service {
  db: TableMap<AFFiNE_DB_SCHEMA>;

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
    const Client = createORMClient(AFFiNE_DB_SCHEMA);
    this.db = new Client(
      new YjsDBAdapter(AFFiNE_DB_SCHEMA, {
        getDoc: guid => {
          const ydoc = new YDoc({
            // guid format: db${workspaceId}${guid}
            guid: `db$${this.workspaceService.workspace.id}$${guid}`,
          });
          this.workspaceService.workspace.engine.doc.addDoc(ydoc, false);
          this.workspaceService.workspace.engine.doc.setPriority(ydoc.guid, 50);
          return ydoc;
        },
      })
    );
  }
}
