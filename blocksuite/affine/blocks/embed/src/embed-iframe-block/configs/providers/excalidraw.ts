import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const EXCALIDRAW_DEFAULT_WIDTH_IN_SURFACE = 640;
const EXCALIDRAW_DEFAULT_HEIGHT_IN_SURFACE = 480;
const EXCALIDRAW_DEFAULT_HEIGHT_IN_NOTE = 480;
const EXCALIDRAW_DEFAULT_WIDTH_PERCENT = 100;

const excalidrawUrlValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['excalidraw.com'],
};

const excalidrawConfig = {
  name: 'excalidraw',
  match: (url: string) =>
    validateEmbedIframeUrl(url, excalidrawUrlValidationOptions),
  buildOEmbedUrl: (url: string) => {
    const match = validateEmbedIframeUrl(url, excalidrawUrlValidationOptions);
    if (!match) {
      return undefined;
    }
    return url;
  },
  useOEmbedUrlDirectly: true,
  options: {
    widthInSurface: EXCALIDRAW_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: EXCALIDRAW_DEFAULT_HEIGHT_IN_SURFACE,
    heightInNote: EXCALIDRAW_DEFAULT_HEIGHT_IN_NOTE,
    widthPercent: EXCALIDRAW_DEFAULT_WIDTH_PERCENT,
    allow: 'clipboard-read; clipboard-write',
    style: 'border: none; border-radius: 8px;',
    allowFullscreen: true,
  },
};

export const ExcalidrawEmbedConfig =
  EmbedIframeConfigExtension(excalidrawConfig);
