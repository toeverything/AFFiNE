import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const GOOGLE_DRIVE_DEFAULT_WIDTH_IN_SURFACE = 640;
const GOOGLE_DRIVE_DEFAULT_HEIGHT_IN_SURFACE = 480;
const GOOGLE_DRIVE_DEFAULT_WIDTH_PERCENT = 100;
const GOOGLE_DRIVE_DEFAULT_HEIGHT_IN_NOTE = 480;
const GOOGLE_DRIVE_EMBED_FOLDER_URL =
  'https://drive.google.com/embeddedfolderview';
const GOOGLE_DRIVE_EMBED_FILE_URL = 'https://drive.google.com/file/d/';

const googleDriveUrlValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['drive.google.com'],
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
 * Check if the url is a valid google drive file url
 * @param parsedUrl Parsed URL object
 * @returns Boolean indicating if the URL is a valid Google Drive file URL
 */
function isValidGoogleDriveFileUrl(parsedUrl: URL): boolean {
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  return (
    pathSegments[0] === 'file' &&
    pathSegments[1] === 'd' &&
    pathSegments.length >= 3 &&
    !!pathSegments[2]
  );
}

/**
 * Check if the url is a valid google drive folder url
 * @param parsedUrl Parsed URL object
 * @returns Boolean indicating if the URL is a valid Google Drive folder URL
 */
function isValidGoogleDriveFolderUrl(parsedUrl: URL): boolean {
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);
  return (
    pathSegments[0] === 'drive' &&
    pathSegments[1] === 'folders' &&
    pathSegments.length >= 3 &&
    !!pathSegments[2]
  );
}
/**
 * Validates if a URL is a valid Google Drive path URL
 * @param parsedUrl Parsed URL object
 * @returns Boolean indicating if the URL is valid
 */
function isValidGoogleDrivePathUrl(parsedUrl: URL): boolean {
  const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

  // Should have at least 2 segments
  if (pathSegments.length < 2) {
    return false;
  }

  // Check for file pattern: /file/d/file-id/view
  if (isValidGoogleDriveFileUrl(parsedUrl)) {
    return true;
  }

  // Check for folder pattern: /drive/folders/folder-id
  if (isValidGoogleDriveFolderUrl(parsedUrl)) {
    return true;
  }

  return false;
}

/**
 * Safely validates if a URL is a valid Google Drive URL
 * https://drive.google.com/file/d/your-file-id/view?usp=sharing
 * https://drive.google.com/drive/folders/your-folder-id?usp=sharing
 * @param url The URL to validate
 * @param strictMode Whether to strictly validate sharing parameters
 * @returns Boolean indicating if the URL is a valid Google Drive URL
 */
function isValidGoogleDriveUrl(url: string, strictMode = true): boolean {
  try {
    if (!validateEmbedIframeUrl(url, googleDriveUrlValidationOptions)) {
      return false;
    }

    const parsedUrl = new URL(url);

    // Check sharing parameter if in strict mode
    if (strictMode && !hasValidSharingParam(parsedUrl)) {
      return false;
    }

    // Check hostname and path structure
    return isValidGoogleDrivePathUrl(parsedUrl);
  } catch (e) {
    // URL parsing failed
    console.warn('Invalid Google Drive URL:', e);
    return false;
  }
}

/**
 * Build embed URL for Google Drive files
 * @param fileId File ID
 * @returns Embed URL
 */
function buildGoogleDriveFileEmbedUrl(fileId: string): string | undefined {
  const embedUrl = new URL(
    'preview',
    `${GOOGLE_DRIVE_EMBED_FILE_URL}${fileId}/`
  );
  embedUrl.searchParams.set('usp', 'embed_googleplus');
  return embedUrl.toString();
}

/**
 * Build embed URL for Google Drive folders
 * @param folderId Folder ID
 * @returns Embed URL
 */
function buildGoogleDriveFolderEmbedUrl(folderId: string): string | undefined {
  const embedUrl = new URL(GOOGLE_DRIVE_EMBED_FOLDER_URL);
  embedUrl.searchParams.set('id', folderId);
  embedUrl.hash = 'list';
  return embedUrl.toString();
}

/**
 * Build embed URL for Google Drive paths
 * @param url The URL to embed
 * @returns The embed URL
 */
function buildGoogleDriveEmbedUrl(url: string): string | undefined {
  try {
    const parsedUrl = new URL(url);
    const pathSegments = parsedUrl.pathname.split('/').filter(Boolean);

    // Should have at least 2 segments
    if (pathSegments.length < 2) {
      return undefined;
    }

    // Handle file URL: /file/d/file-id/view
    if (isValidGoogleDriveFileUrl(parsedUrl)) {
      return buildGoogleDriveFileEmbedUrl(pathSegments[2]);
    }

    // Handle folder URL: /drive/folders/folder-id
    if (isValidGoogleDriveFolderUrl(parsedUrl)) {
      return buildGoogleDriveFolderEmbedUrl(pathSegments[2]);
    }

    return undefined;
  } catch (e) {
    console.warn('Failed to parse Google Drive path URL:', e);
    return undefined;
  }
}

const googleDriveConfig = {
  name: 'google-drive',
  match: (url: string) => isValidGoogleDriveUrl(url),
  buildOEmbedUrl: (url: string) => {
    if (!isValidGoogleDriveUrl(url)) {
      return undefined;
    }

    // If is a valid google drive url, build the embed url
    return buildGoogleDriveEmbedUrl(url);
  },
  useOEmbedUrlDirectly: true,
  options: {
    widthInSurface: GOOGLE_DRIVE_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: GOOGLE_DRIVE_DEFAULT_HEIGHT_IN_SURFACE,
    widthPercent: GOOGLE_DRIVE_DEFAULT_WIDTH_PERCENT,
    heightInNote: GOOGLE_DRIVE_DEFAULT_HEIGHT_IN_NOTE,
    allowFullscreen: true,
    style: 'border: none; border-radius: 8px;',
  },
};

export const GoogleDriveEmbedConfig =
  EmbedIframeConfigExtension(googleDriveConfig);
