import type { app, dialog, shell } from 'electron';

export interface ExposedMeta {
  handlers: [string, string[]][];
  events: [string, string[]][];
}

// render <-> helper
export interface RendererToHelper {
  postEvent: (channel: string, ...args: any[]) => void;
}

export interface HelperToRenderer {
  [key: string]: (...args: any[]) => Promise<any>;
}

// helper <-> main
export interface HelperToMain {
  getMeta: () => ExposedMeta;
}

export type MainToHelper = Pick<
  typeof dialog & typeof shell & typeof app,
  | 'showOpenDialog'
  | 'showSaveDialog'
  | 'openExternal'
  | 'showItemInFolder'
  | 'getPath'
>;

export const AFFINE_API_CHANNEL_NAME = 'affine-ipc-api';
export const AFFINE_EVENT_CHANNEL_NAME = 'affine-ipc-event';
