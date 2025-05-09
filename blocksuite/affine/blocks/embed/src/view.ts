import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { effects } from './effects';
import {
  EdgelessClipboardEmbedFigmaConfig,
  EmbedFigmaViewExtensions,
} from './embed-figma-block';
import {
  EdgelessClipboardEmbedGithubConfig,
  EmbedGithubViewExtensions,
} from './embed-github-block';
import {
  EdgelessClipboardEmbedHtmlConfig,
  EmbedHtmlViewExtensions,
} from './embed-html-block';
import {
  EdgelessClipboardEmbedIframeConfig,
  EmbedIframeViewExtensions,
} from './embed-iframe-block';
import {
  EdgelessClipboardEmbedLoomConfig,
  EmbedLoomViewExtensions,
} from './embed-loom-block';
import {
  EdgelessClipboardEmbedYoutubeConfig,
  EmbedYoutubeViewExtensions,
} from './embed-youtube-block';

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
      ]);
    }
  }
}
