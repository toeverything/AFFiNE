import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import {
  EdgelessClipboardEmbedFigmaConfig,
  EmbedFigmaViewExtensions,
} from './embed-figma-block';
import { EmbedFigmaBlockInteraction } from './embed-figma-block/embed-edgeless-figma-block';
import {
  EdgelessClipboardEmbedGithubConfig,
  EmbedGithubViewExtensions,
} from './embed-github-block';
import { EmbedGithubBlockInteraction } from './embed-github-block/embed-edgeless-github-block';
import {
  EdgelessClipboardEmbedHtmlConfig,
  EmbedHtmlViewExtensions,
} from './embed-html-block';
import { EmbedEdgelessHtmlBlockInteraction } from './embed-html-block/embed-edgeless-html-block';
import {
  EdgelessClipboardEmbedIframeConfig,
  EmbedIframeViewExtensions,
} from './embed-iframe-block';
import { EmbedIframeInteraction } from './embed-iframe-block/embed-edgeless-iframe-block';
import {
  EdgelessClipboardEmbedLoomConfig,
  EmbedLoomViewExtensions,
} from './embed-loom-block';
import { EmbedLoomBlockInteraction } from './embed-loom-block/embed-edgeless-loom-bock';
import {
  EdgelessClipboardEmbedYoutubeConfig,
  EmbedYoutubeViewExtensions,
} from './embed-youtube-block';
import { EmbedYoutubeBlockInteraction } from './embed-youtube-block/embed-edgeless-youtube-block';

export class EmbedViewExtension extends ViewExtensionProvider {
  override name = 'affine-embed-block';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    context.register(EmbedFigmaViewExtensions);
    context.register(EmbedGithubViewExtensions);
    context.register(EmbedLoomViewExtensions);
    context.register(EmbedYoutubeViewExtensions);
    context.register(EmbedHtmlViewExtensions);
    context.register(EmbedIframeViewExtensions);
    const isEdgeless = this.isEdgeless(context.scope);
    if (isEdgeless) {
      context.register([
        EdgelessClipboardEmbedFigmaConfig,
        EdgelessClipboardEmbedGithubConfig,
        EdgelessClipboardEmbedHtmlConfig,
        EdgelessClipboardEmbedLoomConfig,
        EdgelessClipboardEmbedYoutubeConfig,
        EdgelessClipboardEmbedIframeConfig,
        EmbedFigmaBlockInteraction,
        EmbedGithubBlockInteraction,
        EmbedEdgelessHtmlBlockInteraction,
        EmbedLoomBlockInteraction,
        EmbedYoutubeBlockInteraction,
        EmbedIframeInteraction,
      ]);
    }
  }
}
