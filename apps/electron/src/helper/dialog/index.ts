import {
  loadDBFile,
  moveDBFile,
  revealDBFile,
  saveDBFileAs,
  selectDBFileLocation,
  setFakeDialogResult,
} from './dialog';

export const dialogHandlers = {
  revealDBFile: async (workspaceId: string) => {
    return revealDBFile(workspaceId);
  },
  loadDBFile: async () => {
    return loadDBFile();
  },
  saveDBFileAs: async (workspaceId: string) => {
    return saveDBFileAs(workspaceId);
  },
  moveDBFile: (workspaceId: string, dbFileLocation?: string) => {
    return moveDBFile(workspaceId, dbFileLocation);
  },
  selectDBFileLocation: async () => {
    return selectDBFileLocation();
  },
  setFakeDialogResult: async (
    result: Parameters<typeof setFakeDialogResult>[0]
  ) => {
    return setFakeDialogResult(result);
  },
};
