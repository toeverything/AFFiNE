import { BrowserWindow } from 'electron';

function getActiveWindows() {
  return BrowserWindow.getAllWindows().filter(win => !win.isDestroyed());
}

// TODO: infer type from onMainEvent (ask one of the TS experts)
export function sendMainEvent(type: string, ...args: any[]) {
  getActiveWindows().forEach(win => win.webContents.send(type, ...args));
}
