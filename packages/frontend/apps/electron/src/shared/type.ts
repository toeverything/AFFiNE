import type { app, dialog, shell } from 'electron';

export interface HelperToMain {}

export type MainToHelper = Pick<
  typeof dialog & typeof shell & typeof app,
  | 'showOpenDialog'
  | 'showSaveDialog'
  | 'openExternal'
  | 'showItemInFolder'
  | 'getPath'
>;
