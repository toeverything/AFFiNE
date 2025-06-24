import type { AppInfo } from '@affine/electron/entries/preload/api-info';
import type { SharedStorage } from '@affine/electron/entries/preload/shared-storage';

import type { ElectronApis } from './ipc-api-types.gen';
import type { ElectronEvents } from './ipc-event-types.gen';

declare global {
  // oxlint-disable-next-line no-var
  var __appInfo: {
    electron: boolean;
    scheme: string;
    windowName: string;
  };
  // oxlint-disable-next-line no-var
  var __apis: ClientHandler | undefined;
  // oxlint-disable-next-line no-var
  var __events: ClientEvents | undefined;
}

export type ClientEvents = ElectronEvents;
export type ClientHandler = ElectronApis;

export const appInfo = globalThis.__appInfo as AppInfo | null;
export const apis = globalThis.__apis as ClientHandler | undefined;
export const events = globalThis.__events as ClientEvents | undefined;

export const sharedStorage = (globalThis as any).__sharedStorage as
  | SharedStorage
  | undefined;

export * from './ipc-api-types.gen';
export * from './ipc-event-types.gen';
export type { UpdateMeta } from '@affine/electron/entries/main/updater/updater-manager.service';
export {
  type MeetingSettingsKey,
  type MeetingSettingsSchema,
  type MenubarStateKey,
  type MenubarStateSchema,
  type SpellCheckStateKey,
  type SpellCheckStateSchema,
  type TabViewsMetaKey,
  type TabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
  type WorkbenchViewModule,
} from '@affine/electron/shared/shared-state-schema';
export type { AppInfo, SharedStorage };
