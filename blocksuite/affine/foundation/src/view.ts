import { FileDropExtension } from '@blocksuite/affine-components/drop-indicator';
import {
  PeekViewExtension,
  type PeekViewService,
} from '@blocksuite/affine-components/peek';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import {
  AutoClearSelectionService,
  BlockCommentManager,
  CitationService,
  DefaultOpenDocExtension,
  DNDAPIExtension,
  DocDisplayMetaService,
  DocModeService,
  EditPropsStore,
  EmbedOptionService,
  FileSizeLimitService,
  FontConfigExtension,
  fontConfigSchema,
  FontLoaderService,
  LinkPreviewCache,
  LinkPreviewCacheConfigSchema,
  LinkPreviewCacheExtension,
  LinkPreviewService,
  PageViewportServiceExtension,
  TelemetryExtension,
  type TelemetryService,
  ThemeService,
  ToolbarRegistryExtension,
} from '@blocksuite/affine-shared/services';
import { InteractivityManager, ToolController } from '@blocksuite/std/gfx';
import { z } from 'zod';

import { clipboardConfigs } from './clipboard';
import { effects } from './effects';

const optionsSchema = z.object({
  linkPreviewCacheConfig: z.optional(LinkPreviewCacheConfigSchema),
  fontConfig: z.optional(z.array(fontConfigSchema)),
  telemetry: z.optional(z.custom<TelemetryService>()),
  peekView: z.optional(z.custom<PeekViewService>()),
});

export type FoundationViewExtensionOptions = z.infer<typeof optionsSchema>;

export class FoundationViewExtension extends ViewExtensionProvider<FoundationViewExtensionOptions> {
  override name = 'foundation';

  override schema = optionsSchema;

  override effect() {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: FoundationViewExtensionOptions
  ) {
    super.setup(context, options);
    context.register([
      DocDisplayMetaService,
      EditPropsStore,
      DefaultOpenDocExtension,
      FontLoaderService,

      DocModeService,
      ThemeService,
      EmbedOptionService,
      PageViewportServiceExtension,
      DNDAPIExtension,
      FileDropExtension,
      ToolbarRegistryExtension,
      AutoClearSelectionService,
      FileSizeLimitService,
      LinkPreviewCache,
      LinkPreviewService,
      CitationService,
      BlockCommentManager,
    ]);
    context.register(clipboardConfigs);
    if (this.isEdgeless(context.scope)) {
      context.register([InteractivityManager, ToolController]);
    }
    const fontConfig = options?.fontConfig;
    if (fontConfig) {
      context.register(FontConfigExtension(fontConfig));
    }
    const linkPreviewCacheConfig = options?.linkPreviewCacheConfig;
    if (linkPreviewCacheConfig) {
      context.register(LinkPreviewCacheExtension(linkPreviewCacheConfig));
    }
    const telemetry = options?.telemetry;
    if (telemetry) {
      context.register(TelemetryExtension(telemetry));
    }
    const peekView = options?.peekView;
    if (peekView) {
      context.register(PeekViewExtension(peekView));
    }
  }
}
