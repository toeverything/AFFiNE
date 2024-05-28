import type { NamespaceHandlers } from '../type';

export const findInPageHandlers = {
  find: async (event, text: string, options?: Electron.FindInPageOptions) => {
    const { promise, resolve } =
      Promise.withResolvers<Electron.Result | null>();
    const webContents = event.sender;
    let requestId: number = -1;
    webContents.once('found-in-page', (_, result) => {
      resolve(result.requestId === requestId ? result : null);
    });
    requestId = webContents.findInPage(text, options);
    return promise;
  },
  clear: async event => {
    const webContents = event.sender;
    webContents.stopFindInPage('keepSelection');
  },
} satisfies NamespaceHandlers;
