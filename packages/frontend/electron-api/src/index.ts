import type {
  events as helperEvents,
  handlers as helperHandlers,
} from '@affine/electron/helper/exposed';
import type {
  events as mainEvents,
  handlers as mainHandlers,
} from '@affine/electron/main/exposed';
import type { AppInfo } from '@affine/electron/preload/electron-api';
import type { SharedStorage } from '@affine/electron/preload/shared-storage';
import type { CreateImportSessionFromSourceOptions } from '@affine/electron/shared/import';

type MainHandlers = typeof mainHandlers;
type HelperHandlers = typeof helperHandlers;
type HelperEvents = typeof helperEvents;
type MainEvents = typeof mainEvents;
type ImportPreloadHandlers = {
  createImportSessionFromSource(
    options: CreateImportSessionFromSourceOptions
  ): Promise<string>;
};
type MainClientHandlers = {
  [namespace in keyof MainHandlers]: {
    [method in keyof MainHandlers[namespace]]: MainHandlers[namespace][method] extends (
      arg0: any,
      ...rest: infer A
    ) => any
      ? (
          ...args: A
        ) => ReturnType<MainHandlers[namespace][method]> extends Promise<any>
          ? ReturnType<MainHandlers[namespace][method]>
          : Promise<ReturnType<MainHandlers[namespace][method]>>
      : never;
  };
};

export type ClientHandler = Omit<MainClientHandlers, 'import'> &
  HelperHandlers & {
    import: MainClientHandlers['import'] & ImportPreloadHandlers;
  };
export type ClientEvents = MainEvents & HelperEvents;

export const appInfo = (globalThis as any).__appInfo as AppInfo | null;
export const apis = (globalThis as any).__apis as ClientHandler | undefined;
export const events = (globalThis as any).__events as ClientEvents | undefined;

export const sharedStorage = (globalThis as any).__sharedStorage as
  | SharedStorage
  | undefined;

export type { AppInfo, SharedStorage };
export {
  type SpellCheckStateSchema,
  type TabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
  type WorkbenchViewModule,
} from '@affine/electron/main/shared-state-schema';
export type { UpdateMeta } from '@affine/electron/main/updater/event';
export type {
  AddTabOption,
  TabAction,
} from '@affine/electron/main/windows-manager';
export type {
  CreateImportSessionFromSourceOptions,
  NativeImportBrowserSource,
  NativeImportFormat,
  NativeImportSessionHandlers,
} from '@affine/electron/shared/import';
