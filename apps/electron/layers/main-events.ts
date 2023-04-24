// This file contains the main process events
// It will guide preload and main process on the correct event types and payloads
export interface MainEventMap {
  'main:on-db-update': (workspaceId: string) => void;
}
