import { Injectable } from '@nestjs/common';

import { getIpcEvent, IpcHandle, IpcScope } from '../../../ipc';

@Injectable()
export class FindInPageService {
  /**
   * Initiates a find-in-page operation for the current WebContents.
   * @param text The text to search for.
   * @param options Options for the find-in-page operation.
   * @returns A promise that resolves with the find result or null if the request was superseded.
   */
  @IpcHandle({ scope: IpcScope.FIND_IN_PAGE })
  async find(text: string, options: Electron.FindInPageOptions) {
    const event = getIpcEvent();

    const { promise, resolve } =
      Promise.withResolvers<Electron.Result | null>();
    const webContents = event.sender;
    let requestId: number = -1;
    webContents.once('found-in-page', (_, result) => {
      resolve(result.requestId === requestId ? result : null);
    });
    requestId = webContents.findInPage(text, options);
    return promise;
  }

  /**
   * Stops the current find-in-page operation for the current WebContents.
   */
  @IpcHandle({ scope: IpcScope.FIND_IN_PAGE })
  clear() {
    const event = getIpcEvent();
    const webContents = event.sender;
    webContents.stopFindInPage('keepSelection');
  }
}
