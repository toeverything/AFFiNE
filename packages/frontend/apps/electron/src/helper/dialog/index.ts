import {
  loadDBFile,
  saveDBFileAs,
  selectDBFileLocation,
  setFakeDialogResult,
} from './dialog';

export const dialogHandlers = {
  loadDBFile: async (dbFilePath?: string) => {
    return loadDBFile(dbFilePath);
  },
  saveDBFileAs: async (universalId: string, name: string) => {
    return saveDBFileAs(universalId, name);
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
