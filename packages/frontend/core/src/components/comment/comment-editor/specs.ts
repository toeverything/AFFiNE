import { CloudViewExtension } from '@affine/core/blocksuite/view-extensions/cloud';
import { AffineEditorViewExtension } from '@affine/core/blocksuite/view-extensions/editor-view/editor-view';
import { AffineThemeViewExtension } from '@affine/core/blocksuite/view-extensions/theme';
import { I18n } from '@affine/i18n';
import { CodeBlockViewExtension } from '@blocksuite/affine/blocks/code/view';
import { DividerViewExtension } from '@blocksuite/affine/blocks/divider/view';
import { LatexViewExtension as LatexBlockViewExtension } from '@blocksuite/affine/blocks/latex/view';
import { ListViewExtension } from '@blocksuite/affine/blocks/list/view';
import { NoteViewExtension } from '@blocksuite/affine/blocks/note/view';
import { ParagraphViewExtension } from '@blocksuite/affine/blocks/paragraph/view';
import { RootViewExtension } from '@blocksuite/affine/blocks/root/view';
import {
  PeekViewExtension,
  type PeekViewService,
} from '@blocksuite/affine/components/peek';
import {
  type ViewExtensionContext,
  ViewExtensionManager,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { PlainTextClipboardConfig } from '@blocksuite/affine/foundation/clipboard';
import { LatexInlineSpecExtension } from '@blocksuite/affine/inlines/latex';
import { LatexViewExtension as LatexInlineViewExtension } from '@blocksuite/affine/inlines/latex/view';
import { LinkInlineSpecExtension } from '@blocksuite/affine/inlines/link';
import { LinkViewExtension } from '@blocksuite/affine/inlines/link/view';
import { MentionInlineSpecExtension } from '@blocksuite/affine/inlines/mention';
import { MentionViewExtension } from '@blocksuite/affine/inlines/mention/view';
import {
  BackgroundInlineSpecExtension,
  BoldInlineSpecExtension,
  CodeInlineSpecExtension,
  ColorInlineSpecExtension,
  InlineSpecExtensions,
  ItalicInlineSpecExtension,
  StrikeInlineSpecExtension,
  UnderlineInlineSpecExtension,
} from '@blocksuite/affine/inlines/preset';
import { ReferenceInlineSpecExtension } from '@blocksuite/affine/inlines/reference';
import { ReferenceViewExtension } from '@blocksuite/affine/inlines/reference/view';
import {
  DefaultOpenDocExtension,
  DocDisplayMetaService,
  DocModeService,
  FileSizeLimitService,
  FontConfigExtension,
  fontConfigSchema,
  FontLoaderService,
  PageViewportServiceExtension,
  ThemeService,
  ToolbarRegistryExtension,
} from '@blocksuite/affine/shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine/shared/types';
import { InlineManagerExtension } from '@blocksuite/affine/std/inline';
import { LinkedDocViewExtension } from '@blocksuite/affine/widgets/linked-doc/view';
import { ToolbarViewExtension } from '@blocksuite/affine/widgets/toolbar/view';
import { ViewportOverlayViewExtension } from '@blocksuite/affine/widgets/viewport-overlay/view';
import type { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

import { createCommentLinkedWidgetConfig } from './linked-widget-config';

const commentEditorViewExtensionOptionsSchema = z.object({
  peekView: z.optional(z.custom<PeekViewService>()),
  fontConfig: z.optional(z.array(fontConfigSchema)),
});

export type CommentEditorViewExtensionOptions = z.infer<
  typeof commentEditorViewExtensionOptionsSchema
>;

class CommentEditorViewExtensionProvider extends ViewExtensionProvider<CommentEditorViewExtensionOptions> {
  override name = 'comment-editor';

  override schema = commentEditorViewExtensionOptionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: CommentEditorViewExtensionOptions
  ) {
    super.setup(context, options);
    context.register([
      ThemeService,
      DocModeService,
      DocDisplayMetaService,
      DefaultOpenDocExtension,
      FontLoaderService,
      ToolbarRegistryExtension,
      PageViewportServiceExtension,
      FileSizeLimitService,

      ...InlineSpecExtensions,
      InlineManagerExtension<AffineTextAttributes>({
        id: 'DefaultInlineManager',
        specs: [
          BoldInlineSpecExtension.identifier,
          ItalicInlineSpecExtension.identifier,
          UnderlineInlineSpecExtension.identifier,
          StrikeInlineSpecExtension.identifier,
          CodeInlineSpecExtension.identifier,
          BackgroundInlineSpecExtension.identifier,
          ColorInlineSpecExtension.identifier,
          LatexInlineSpecExtension.identifier,
          ReferenceInlineSpecExtension.identifier,
          LinkInlineSpecExtension.identifier,
          MentionInlineSpecExtension.identifier,
        ],
      }),

      PlainTextClipboardConfig,
    ]);

    if (options?.fontConfig) {
      context.register(FontConfigExtension(options.fontConfig));
    }
    if (options?.peekView) {
      context.register(PeekViewExtension(options.peekView));
    }
  }
}

let manager: ViewExtensionManager | null = null;
export function getCommentEditorViewManager(framework: FrameworkProvider) {
  if (!manager) {
    manager = new ViewExtensionManager([
      CommentEditorViewExtensionProvider,

      // Blocks
      CodeBlockViewExtension,
      DividerViewExtension,
      LatexBlockViewExtension,
      ListViewExtension,

      NoteViewExtension,
      ParagraphViewExtension,
      RootViewExtension,

      // Inline
      LinkViewExtension,
      ReferenceViewExtension,
      MentionViewExtension,
      LatexInlineViewExtension,

      // Widget
      ToolbarViewExtension,
      ViewportOverlayViewExtension,
      LinkedDocViewExtension,

      // Affine side
      AffineThemeViewExtension,
      AffineEditorViewExtension,

      // for rendering mentions
      CloudViewExtension,
    ]);

    manager.configure(ParagraphViewExtension, {
      getPlaceholder: () => {
        return I18n.t('com.affine.notification.comment-prompt');
      },
    });

    manager.configure(
      LinkedDocViewExtension,
      createCommentLinkedWidgetConfig(framework)
    );

    manager.configure(CloudViewExtension, {
      framework,
      enableCloud: true,
    });
  }
  return manager;
}
