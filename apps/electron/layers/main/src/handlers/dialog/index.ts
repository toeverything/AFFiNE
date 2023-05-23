import type { NamespaceHandlers } from '../type';
import {
  loadDBFile,
  moveDBFile,
  revealDBFile,
  saveDBFileAs,
  selectDBFileLocation,
  setFakeDialogResult,
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
  moveDBFile: (_, workspaceId: string, dbFileLocation?: string) => {
    return moveDBFile(workspaceId, dbFileLocation);
  },
  selectDBFileLocation: async () => {
    return selectDBFileLocation();
  },
  setFakeDialogResult: async (
    _,
    result: Parameters<typeof setFakeDialogResult>[0]
  ) => {
    return setFakeDialogResult(result);
  },
} satisfies NamespaceHandlers;
