import { BilibiliEmbedConfig } from './bilibili';
import { ExcalidrawEmbedConfig } from './excalidraw';
import { GenericEmbedConfig } from './generic';
import { GoogleDocsEmbedConfig } from './google-docs';
import { GoogleDriveEmbedConfig } from './google-drive';
import { MiroEmbedConfig } from './miro';
import { SpotifyEmbedConfig } from './spotify';

export const EmbedIframeConfigExtensions = [
  SpotifyEmbedConfig,
  GoogleDriveEmbedConfig,
  MiroEmbedConfig,
  ExcalidrawEmbedConfig,
  GoogleDocsEmbedConfig,
  BilibiliEmbedConfig,
  GenericEmbedConfig,
];
