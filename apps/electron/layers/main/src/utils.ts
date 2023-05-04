import { BrowserWindow } from 'electron';

import type { MainEventMap } from '../../constraints';

export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
) {
  let timeoutId: NodeJS.Timer | undefined;
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = undefined;
    }, delay);
  };
}

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

export function sendMainEvent<T extends keyof MainEventMap>(
  type: T,
  ...args: Parameters<MainEventMap[T]>
) {
  getActiveWindows().forEach(win => win.webContents.send(type, ...args));
}
