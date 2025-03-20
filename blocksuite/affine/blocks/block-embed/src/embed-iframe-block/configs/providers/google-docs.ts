import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const GOOGLE_DOCS_DEFAULT_WIDTH_IN_SURFACE = 800;
const GOOGLE_DOCS_DEFAULT_HEIGHT_IN_SURFACE = 600;
const GOOGLE_DOCS_DEFAULT_WIDTH_PERCENT = 100;
const GOOGLE_DOCS_DEFAULT_HEIGHT_IN_NOTE = 600;

const googleDocsUrlValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['docs.google.com'],
};

/**
 * Checks if the URL has a valid sharing parameter
 * @param parsedUrl Parsed URL object
 * @returns Boolean indicating if the URL has a valid sharing parameter
 */
function hasValidSharingParam(parsedUrl: URL): boolean {
  const usp = parsedUrl.searchParams.get('usp');
  return usp === 'sharing';
}

/**
 * Validates if a URL is a valid Google Docs URL
 * Valid format: https://docs.google.com/document/d/doc-id/edit?usp=sharing
 * @param url The URL to validate
 * @param strictMode Whether to strictly validate sharing parameters
 * @returns Boolean indicating if the URL is a valid Google Docs URL
 */
function isValidGoogleDocsUrl(url: string, strictMode = true): boolean {
  try {
    if (!validateEmbedIframeUrl(url, googleDocsUrlValidationOptions)) {
      return false;
    }

    const parsedUrl = new URL(url);

    if (strictMode && !hasValidSharingParam(parsedUrl)) {
      return false;
    }

    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
    return (
      pathSegments[0] === 'document' &&
      pathSegments[1] === 'd' &&
      pathSegments.length >= 3 &&
      !!pathSegments[2]
    );
  } catch (e) {
    console.warn('Invalid Google Docs URL:', e);
    return false;
  }
}

const googleDocsConfig = {
  name: 'google-docs',
  match: (url: string) => isValidGoogleDocsUrl(url),
  buildOEmbedUrl: (url: string) => {
    if (!isValidGoogleDocsUrl(url)) {
      return undefined;
    }
    return url;
  },
  useOEmbedUrlDirectly: true,
  options: {
    widthInSurface: GOOGLE_DOCS_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: GOOGLE_DOCS_DEFAULT_HEIGHT_IN_SURFACE,
    widthPercent: GOOGLE_DOCS_DEFAULT_WIDTH_PERCENT,
    heightInNote: GOOGLE_DOCS_DEFAULT_HEIGHT_IN_NOTE,
    allowFullscreen: true,
    style: 'border: none; border-radius: 8px;',
  },
};

export const GoogleDocsEmbedConfig =
  EmbedIframeConfigExtension(googleDocsConfig);
