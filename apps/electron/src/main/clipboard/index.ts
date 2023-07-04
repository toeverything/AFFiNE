import { clipboard, type IpcMainInvokeEvent, nativeImage } from 'electron';

import type { NamespaceHandlers } from '../type';

export const clipboardHandlers = {
  copyAsImageFromString: async (_: IpcMainInvokeEvent, dataURL: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataURL));
  },
} satisfies NamespaceHandlers;
