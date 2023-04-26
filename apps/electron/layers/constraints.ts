/* eslint-disable @typescript-eslint/consistent-type-imports */
// This file contains the main process events
// It will guide preload and main process on the correct event types and payloads
export interface MainEventMap {
  'main:on-db-file-update': (workspaceId: string) => void;
  'main:on-db-file-missing': (workspaceId: string) => void;
}

export type MainIPCHandlerMap =
  typeof import('./main/src/handlers').allHandlers;
