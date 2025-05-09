import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const SPOTIFY_DEFAULT_WIDTH_IN_SURFACE = 640;
const SPOTIFY_DEFAULT_HEIGHT_IN_SURFACE = 152;
const SPOTIFY_DEFAULT_HEIGHT_IN_NOTE = 152;
const SPOTIFY_DEFAULT_WIDTH_PERCENT = 100;

// https://developer.spotify.com/documentation/embeds/reference/oembed
const spotifyEndpoint = 'https://open.spotify.com/oembed';

const spotifyUrlValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['open.spotify.com', 'spotify.link'],
};

const spotifyConfig = {
  name: 'spotify',
  match: (url: string) =>
    validateEmbedIframeUrl(url, spotifyUrlValidationOptions),
  buildOEmbedUrl: (url: string) => {
    const match = validateEmbedIframeUrl(url, spotifyUrlValidationOptions);
    if (!match) {
      return undefined;
    }
    const encodedUrl = encodeURIComponent(url);
    const oEmbedUrl = `${spotifyEndpoint}?url=${encodedUrl}`;
    return oEmbedUrl;
  },
  useOEmbedUrlDirectly: false,
  options: {
    widthInSurface: SPOTIFY_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: SPOTIFY_DEFAULT_HEIGHT_IN_SURFACE,
    heightInNote: SPOTIFY_DEFAULT_HEIGHT_IN_NOTE,
    widthPercent: SPOTIFY_DEFAULT_WIDTH_PERCENT,
    allow: 'autoplay; clipboard-write; encrypted-media; picture-in-picture',
    style: 'border-radius: 8px;',
    allowFullscreen: true,
    containerBorderRadius: 12,
  },
};

export const SpotifyEmbedConfig = EmbedIframeConfigExtension(spotifyConfig);
