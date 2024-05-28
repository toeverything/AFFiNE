export const findInPageHandlers = {
  findInPage: async (
    event: Electron.IpcMainInvokeEvent,
    text: string,
    options?: Electron.FindInPageOptions
  ) => {
    const webContents = event.sender;
    return webContents.findInPage(text, options);
  },
  stopFindInPage: async (
    event: Electron.IpcMainInvokeEvent,
    action: 'clearSelection' | 'keepSelection' | 'activateSelection'
  ) => {
    const webContents = event.sender;
    return webContents.stopFindInPage(action);
  },
};
