import type {
  events as helperEvents,
  handlers as helperHandlers,
} from '@affine/electron/helper/exposed';
import type {
  events as mainEvents,
  handlers as mainHandlers,
} from '@affine/electron/main/exposed';
import type { appInfo as exposedAppInfo } from '@affine/electron/preload/electron-api';
import type { sharedStorage as exposedSharedStorage } from '@affine/electron/preload/shared-storage';

type MainHandlers = typeof mainHandlers;
type HelperHandlers = typeof helperHandlers;
type HelperEvents = typeof helperEvents;
type MainEvents = typeof mainEvents;
type ClientHandler = {
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
} & HelperHandlers;
type ClientEvents = MainEvents & HelperEvents;

export const appInfo = (globalThis as any).__appInfo as
  | typeof exposedAppInfo
  | null;
export const apis = (globalThis as any).__apis as ClientHandler | null;
export const events = (globalThis as any).__events as ClientEvents | null;

export const sharedStorage = (globalThis as any).__sharedStorage as
  | typeof exposedSharedStorage
  | null;

export type { UpdateMeta } from '@affine/electron/main/updater/event';
export {
  type TabViewsMetaSchema,
  type WorkbenchMeta,
  type WorkbenchViewMeta,
  type WorkbenchViewModule,
} from '@affine/electron/main/windows-manager/tab-views-meta-schema';
