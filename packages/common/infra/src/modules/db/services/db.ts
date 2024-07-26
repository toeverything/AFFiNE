import { Doc as YDoc } from 'yjs';

import { Service } from '../../../framework';
import { createORMClient, type TableMap, YjsDBAdapter } from '../../../orm';
import { ObjectPool } from '../../../utils';
import type { WorkspaceService } from '../../workspace';
import { AFFiNE_WORKSPACE_DB_SCHEMA } from '../schema';
import { AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA } from '../schema/schema';

const WorkspaceDBClient = createORMClient(AFFiNE_WORKSPACE_DB_SCHEMA);
const WorkspaceUserdataDBClient = createORMClient(
  AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA
);
type WorkspaceUserdataDBClient = InstanceType<typeof WorkspaceUserdataDBClient>;

export class WorkspaceDBService extends Service {
  db: TableMap<AFFiNE_WORKSPACE_DB_SCHEMA>;
  userdataDBPool = new ObjectPool<string, WorkspaceUserdataDBClient>({
    onDangling() {
      return false; // never release
    },
  });

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
    this.db = new WorkspaceDBClient(
      new YjsDBAdapter(AFFiNE_WORKSPACE_DB_SCHEMA, {
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

  // eslint-disable-next-line @typescript-eslint/ban-types
  userdataDB(userId: (string & {}) | '__local__') {
    // __local__ for local workspace
    const userdataDb = this.userdataDBPool.get(userId);
    if (userdataDb) {
      return userdataDb.obj;
    }

    const newDB = new WorkspaceUserdataDBClient(
      new YjsDBAdapter(AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA, {
        getDoc: guid => {
          const ydoc = new YDoc({
            // guid format: userdata${userId}${workspaceId}${guid}
            guid: `userdata$${userId}$${this.workspaceService.workspace.id}$${guid}`,
          });
          this.workspaceService.workspace.engine.doc.addDoc(ydoc, false);
          this.workspaceService.workspace.engine.doc.setPriority(ydoc.guid, 50);
          return ydoc;
        },
      })
    );

    this.userdataDBPool.put(userId, newDB);
    return newDB;
  }

  static isDBDocId(docId: string) {
    return docId.startsWith('db$') || docId.startsWith('userdata$');
  }
}
