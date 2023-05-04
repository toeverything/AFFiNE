import type { NamespaceHandlers } from '../type';
import {
  loadDBFile,
  moveDBFile,
  revealDBFile,
  saveDBFileAs,
  selectDBFileLocation,
} from './dialog';

export const dialogHandlers = {
  revealDBFile: async (_, workspaceId: string) => {
    return revealDBFile(workspaceId);
  },
  loadDBFile: async () => {
    return loadDBFile();
  },
  saveDBFileAs: async (_, workspaceId: string) => {
    return saveDBFileAs(workspaceId);
  },
  moveDBFile: async (_, workspaceId: string, dbFileLocation?: string) => {
    return moveDBFile(workspaceId, dbFileLocation);
  },
  selectDBFileLocation: async () => {
    return selectDBFileLocation();
  },
} satisfies NamespaceHandlers;
