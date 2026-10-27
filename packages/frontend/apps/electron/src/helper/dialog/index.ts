import { loadDBFile, saveDBFileAs, selectMarkdownSyncFolder } from './dialog';

export const dialogHandlers = {
  loadDBFile: async () => {
    return loadDBFile();
  },
  saveDBFileAs: async (universalId: string, name: string) => {
    return saveDBFileAs(universalId, name);
  },
  selectMarkdownSyncFolder: async () => {
    return selectMarkdownSyncFolder();
  },
};
