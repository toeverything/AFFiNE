import { EmbedIframeConfigExtension } from '@blocksuite/affine-shared/services';

import {
  type EmbedIframeUrlValidationOptions,
  validateEmbedIframeUrl,
} from '../../utils';

const BILIBILI_DEFAULT_WIDTH_IN_SURFACE = 800;
const BILIBILI_DEFAULT_HEIGHT_IN_SURFACE = 450;
const BILIBILI_DEFAULT_HEIGHT_IN_NOTE = 450;
const BILIBILI_DEFAULT_WIDTH_PERCENT = 100;

const bilibiliValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['player.bilibili.com', 'www.bilibili.com', 'bilibili.com'],
};

const biliPlayerValidationOptions: EmbedIframeUrlValidationOptions = {
  protocols: ['https:'],
  hostnames: ['player.bilibili.com'],
};

const AV_REGEX = /av([0-9]+)/i;
const BV_REGEX = /(BV[0-9A-Za-z]{10})/;

const extractAvid = (url: string) => {
  const match = url.match(AV_REGEX);
  return match ? match[1] : undefined;
};

const extractBvid = (url: string) => {
  const match = url.match(BV_REGEX);
  return match ? match[1] : undefined;
};

const buildBiliPlayerEmbedUrl = (url: string) => {
  // If the user pasted the embed URL directly, keep it
  if (validateEmbedIframeUrl(url, biliPlayerValidationOptions)) {
    return url;
  }
  const avid = extractAvid(url);
  if (avid) {
    const params = new URLSearchParams({
      aid: avid,
      autoplay: '0',
    });
    return `https://player.bilibili.com/player.html?${params.toString()}`;
  }
  const bvid = extractBvid(url);
  if (bvid) {
    const params = new URLSearchParams({
      bvid,
      autoplay: '0',
    });
    return `https://player.bilibili.com/player.html?${params.toString()}`;
  }
  return undefined;
};

const bilibiliConfig = {
  name: 'bilibili',
  match: (url: string) =>
    validateEmbedIframeUrl(url, bilibiliValidationOptions) &&
    (!!extractAvid(url) || !!extractBvid(url)),
  buildOEmbedUrl: buildBiliPlayerEmbedUrl,
  useOEmbedUrlDirectly: true,
  options: {
    widthInSurface: BILIBILI_DEFAULT_WIDTH_IN_SURFACE,
    heightInSurface: BILIBILI_DEFAULT_HEIGHT_IN_SURFACE,
    heightInNote: BILIBILI_DEFAULT_HEIGHT_IN_NOTE,
    widthPercent: BILIBILI_DEFAULT_WIDTH_PERCENT,
    allow: 'clipboard-write; encrypted-media; picture-in-picture',
    sandbox: 'allow-same-origin allow-scripts',
    style: 'border: none; border-radius: 8px;',
    allowFullscreen: true,
  },
};

export const BilibiliEmbedConfig = EmbedIframeConfigExtension(bilibiliConfig);
