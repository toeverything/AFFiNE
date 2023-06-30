import { clipboard, nativeImage } from 'electron';

import type { NamespaceHandlers } from '../type';

export const clipboardHandlers = {
  copyAsPng: async (_, dataURL: string) => {
    clipboard.writeImage(nativeImage.createFromDataURL(dataURL));
  },
} satisfies NamespaceHandlers;
