import {
  AttachmentAdapter,
  ClipboardAdapter,
  HtmlAdapter,
  ImageAdapter,
  MixTextAdapter,
  NotionTextAdapter,
} from '@blocksuite/affine-shared/adapters';
import { ClipboardAdapterConfigExtension } from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

const SnapshotClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: ClipboardAdapter.MIME,
  adapter: ClipboardAdapter,
  priority: 100,
});

const NotionClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/_notion-text-production',
  adapter: NotionTextAdapter,
  priority: 95,
});

const HtmlClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/html',
  adapter: HtmlAdapter,
  priority: 90,
});

const imageClipboardConfigs = [
  'image/apng',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
].map(mimeType => {
  return ClipboardAdapterConfigExtension({
    mimeType,
    adapter: ImageAdapter,
    priority: 80,
  });
});

export const PlainTextClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: 'text/plain',
  adapter: MixTextAdapter,
  priority: 70,
});

const AttachmentClipboardConfig = ClipboardAdapterConfigExtension({
  mimeType: '*/*',
  adapter: AttachmentAdapter,
  priority: 60,
});

export const clipboardConfigs: ExtensionType[] = [
  SnapshotClipboardConfig,
  NotionClipboardConfig,
  HtmlClipboardConfig,
  ...imageClipboardConfigs,
  PlainTextClipboardConfig,
  AttachmentClipboardConfig,
];
