import type { MainEventRegister } from '../type';
import {
  deleteBackupWorkspace,
  deleteWorkspace,
  getDeletedWorkspaces,
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
};
