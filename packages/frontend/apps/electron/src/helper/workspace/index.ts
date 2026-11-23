import type { MainEventRegister } from '../type';
import {
  deleteBackupWorkspace,
  deleteWorkspace,
  getDeletedWorkspaces,
  listLocalWorkspaceIds,
  recoverBackupWorkspace,
  trashWorkspace,
} from './handlers';

export * from './handlers';
export * from './subjects';

export const workspaceEvents = {} as Record<string, MainEventRegister>;

export const workspaceHandlers = {
  delete: deleteWorkspace,
  moveToTrash: trashWorkspace,
  getBackupWorkspaces: async () => {
    return getDeletedWorkspaces();
  },
  deleteBackupWorkspace: async (id: string) => deleteBackupWorkspace(id),
  recoverBackupWorkspace: async (id: string) => recoverBackupWorkspace(id),
  listLocalWorkspaceIds: async () => listLocalWorkspaceIds(),
};
