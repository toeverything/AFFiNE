import { Doc as YDoc } from 'yjs';

import { Service } from '../../../framework';
import { createORMClient, YjsDBAdapter } from '../../../orm';
import type { DocStorage } from '../../../sync';
import { ObjectPool } from '../../../utils';
import type { WorkspaceService } from '../../workspace';
import { WorkspaceDB, type WorkspaceDBWithTables } from '../entities/db';
import {
  AFFiNE_WORKSPACE_DB_SCHEMA,
  AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA,
} from '../schema';

const WorkspaceDBClient = createORMClient(AFFiNE_WORKSPACE_DB_SCHEMA);
const WorkspaceUserdataDBClient = createORMClient(
  AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA
);

export class WorkspaceDBService extends Service {
  db: WorkspaceDBWithTables<AFFiNE_WORKSPACE_DB_SCHEMA>;
  userdataDBPool = new ObjectPool<
    string,
    WorkspaceDB<AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA>
  >({
    onDangling() {
      return false; // never release
    },
  });

  constructor(private readonly workspaceService: WorkspaceService) {
    super();
    this.db = this.framework.createEntity(
      WorkspaceDB<AFFiNE_WORKSPACE_DB_SCHEMA>,
      {
        db: new WorkspaceDBClient(
          new YjsDBAdapter(AFFiNE_WORKSPACE_DB_SCHEMA, {
            getDoc: guid => {
              const ydoc = new YDoc({
                // guid format: db${workspaceId}${guid}
                guid: `db$${this.workspaceService.workspace.id}$${guid}`,
              });
              this.workspaceService.workspace.engine.doc.addDoc(ydoc, false);
              this.workspaceService.workspace.engine.doc.setPriority(
                ydoc.guid,
                50
              );
              return ydoc;
            },
          })
        ),
        schema: AFFiNE_WORKSPACE_DB_SCHEMA,
        storageDocId: tableName =>
          `db$${this.workspaceService.workspace.id}$${tableName}`,
      }
    ) as WorkspaceDBWithTables<AFFiNE_WORKSPACE_DB_SCHEMA>;
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  userdataDB(userId: (string & {}) | '__local__') {
    // __local__ for local workspace
    const userdataDb = this.userdataDBPool.get(userId);
    if (userdataDb) {
      return userdataDb.obj as WorkspaceDBWithTables<AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA>;
    }

    const newDB = this.framework.createEntity(
      WorkspaceDB<AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA>,
      {
        db: new WorkspaceUserdataDBClient(
          new YjsDBAdapter(AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA, {
            getDoc: guid => {
              const ydoc = new YDoc({
                // guid format: userdata${userId}${workspaceId}${guid}
                guid: `userdata$${userId}$${this.workspaceService.workspace.id}$${guid}`,
              });
              this.workspaceService.workspace.engine.doc.addDoc(ydoc, false);
              this.workspaceService.workspace.engine.doc.setPriority(
                ydoc.guid,
                50
              );
              return ydoc;
            },
          })
        ),
        schema: AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA,
        storageDocId: tableName =>
          `userdata$${userId}$${this.workspaceService.workspace.id}$${tableName}`,
      }
    );

    this.userdataDBPool.put(userId, newDB);
    return newDB as WorkspaceDBWithTables<AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA>;
  }

  static isDBDocId(docId: string) {
    return docId.startsWith('db$') || docId.startsWith('userdata$');
  }
}

export async function transformWorkspaceDBLocalToCloud(
  localWorkspaceId: string,
  cloudWorkspaceId: string,
  localDocStorage: DocStorage,
  cloudDocStorage: DocStorage,
  accountId: string
) {
  for (const tableName of Object.keys(AFFiNE_WORKSPACE_DB_SCHEMA)) {
    const localDocName = `db$${localWorkspaceId}$${tableName}`;
    const localDoc = await localDocStorage.doc.get(localDocName);
    if (localDoc) {
      const cloudDocName = `db$${cloudWorkspaceId}$${tableName}`;
      await cloudDocStorage.doc.set(cloudDocName, localDoc);
    }
  }

  for (const tableName of Object.keys(AFFiNE_WORKSPACE_USERDATA_DB_SCHEMA)) {
    const localDocName = `userdata$__local__$${localWorkspaceId}$${tableName}`;
    const localDoc = await localDocStorage.doc.get(localDocName);
    if (localDoc) {
      const cloudDocName = `userdata$${accountId}$${cloudWorkspaceId}$${tableName}`;
      await cloudDocStorage.doc.set(cloudDocName, localDoc);
    }
  }
}
