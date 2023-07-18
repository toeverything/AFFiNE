import type {
  ClipboardHandlers,
  DBHandlers,
  DebugHandlers,
  DialogHandlers,
  ExportHandlers,
  UIHandlers,
  UpdaterHandlers,
  WorkspaceHandlers,
} from './type.js';
import { HandlerManager } from './type.js';

export abstract class DBHandlerManager extends HandlerManager<
  'db',
  DBHandlers
> {}

export abstract class DebugHandlerManager extends HandlerManager<
  'debug',
  DebugHandlers
> {}

export abstract class DialogHandlerManager extends HandlerManager<
  'dialog',
  DialogHandlers
> {}

export abstract class UIHandlerManager extends HandlerManager<
  'ui',
  UIHandlers
> {}

export abstract class ClipboardHandlerManager extends HandlerManager<
  'clipboard',
  ClipboardHandlers
> {}

export abstract class ExportHandlerManager extends HandlerManager<
  'export',
  ExportHandlers
> {}

export abstract class UpdaterHandlerManager extends HandlerManager<
  'updater',
  UpdaterHandlers
> {}

export abstract class WorkspaceHandlerManager extends HandlerManager<
  'workspace',
  WorkspaceHandlers
> {}
