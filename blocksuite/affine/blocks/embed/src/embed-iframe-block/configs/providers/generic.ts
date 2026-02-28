import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

const GENERIC_DEFAULT_WIDTH_IN_SURFACE = 800;
const GENERIC_DEFAULT_HEIGHT_IN_SURFACE = 600;
const GENERIC_DEFAULT_WIDTH_PERCENT = 100;
const GENERIC_DEFAULT_HEIGHT_IN_NOTE = 400;

/**
 * AFFiNE domains that should be excluded from generic embedding
 * These are based on the centralized cloud constants and known AFFiNE domains
 */
const AFFINE_DOMAINS = [
  'affine.pro', // Main AFFiNE domain
  'app.affine.pro', // Stable cloud domain
  'insider.affine.pro', // Beta/internal cloud domain
  'affine.fail', // Canary cloud domain
  'toeverything.app', // Safety measure for potential future use
  'apple.getaffineapp.com', // Cloud domain for Apple app
];

/**
 * Validates if a URL is suitable for generic iframe embedding
 * Allows HTTPS URLs but excludes AFFiNE domains
 * @param url The URL to validate
 * @returns Boolean indicating if the URL can be generically embedded
 */
function isValidGenericEmbedUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    // Only allow HTTPS for security
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }

    // Exclude AFFiNE domains
    const hostname = parsedUrl.hostname.toLowerCase();
    if (
      AFFINE_DOMAINS.some(
        domain => hostname === domain || hostname.endsWith(`.${domain}`)
      )
    ) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL
    return false;
  }
}

const genericConfig = {
  name: 'generic',
  match: (url: string) => isValidGenericEmbedUrl(url),
  buildOEmbedUrl: (url: string) => {
    if (!isValidGenericEmbedUrl(url)) {
      return undefined;
    }
    return url;
  },
  useOEmbedUrlDirectly: true,
  options: {
    widthInSurface: GENERIC_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: GENERIC_DEFAULT_HEIGHT_IN_SURFACE,
    widthPercent: GENERIC_DEFAULT_WIDTH_PERCENT,
    heightInNote: GENERIC_DEFAULT_HEIGHT_IN_NOTE,
    allowFullscreen: true,
    style: 'border: none; border-radius: 8px;',
    allow: 'clipboard-read; clipboard-write; picture-in-picture;',
    referrerpolicy: 'no-referrer-when-downgrade',
  },
};

export const GenericEmbedConfig = EmbedIframeConfigExtension(genericConfig);
