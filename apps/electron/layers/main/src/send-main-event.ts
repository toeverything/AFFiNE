import { BrowserWindow } from 'electron';

import type { MainEventMap } from '../../main-events';

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

export function sendMainEvent<T extends keyof MainEventMap>(
  type: T,
  ...args: Parameters<MainEventMap[T]>
) {
  getActiveWindows().forEach(win => win.webContents.send(type, ...args));
}
