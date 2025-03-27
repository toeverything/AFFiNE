import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const MIRO_DEFAULT_WIDTH_IN_SURFACE = 640;
const MIRO_DEFAULT_HEIGHT_IN_SURFACE = 480;
const MIRO_DEFAULT_HEIGHT_IN_NOTE = 480;
const MIRO_DEFAULT_WIDTH_PERCENT = 100;

// https://developers.miro.com/reference/getembeddata
const miroEndpoint = 'https://miro.com/api/v1/oembed';

const miroUrlValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['miro.com'],
};

const miroConfig = {
  name: 'miro',
  match: (url: string) => validateEmbedIframeUrl(url, miroUrlValidationOptions),
  buildOEmbedUrl: (url: string) => {
    const match = validateEmbedIframeUrl(url, miroUrlValidationOptions);
    if (!match) {
      return undefined;
    }
    const encodedUrl = encodeURIComponent(url);
    const oEmbedUrl = `${miroEndpoint}?url=${encodedUrl}`;
    return oEmbedUrl;
  },
  useOEmbedUrlDirectly: false,
  options: {
    widthInSurface: MIRO_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: MIRO_DEFAULT_HEIGHT_IN_SURFACE,
    heightInNote: MIRO_DEFAULT_HEIGHT_IN_NOTE,
    widthPercent: MIRO_DEFAULT_WIDTH_PERCENT,
    allow: 'clipboard-read; clipboard-write',
    style: 'border: none;',
    allowFullscreen: true,
    containerBorderRadius: 0,
  },
};

export const MiroEmbedConfig = EmbedIframeConfigExtension(miroConfig);
