import type { NativeImportSessionHandlers } from '@affine/electron-api';

export type {
  NativeImportBrowserSource,
  NativeImportFormat,
  NativeImportSessionHandlers,
} from '@affine/electron-api';

let nativeImportSessionHandlers: NativeImportSessionHandlers | null = null;

export function registerNativeImportSessionHandlers(
  handlers: NativeImportSessionHandlers | null
) {
  nativeImportSessionHandlers = handlers;
}

export function getNativeImportSessionHandlers() {
  return nativeImportSessionHandlers;
}
