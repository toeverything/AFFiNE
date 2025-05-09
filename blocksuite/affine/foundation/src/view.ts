import { FileDropExtension } from '@blocksuite/affine-components/drop-indicator';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import {
  AutoClearSelectionService,
  DefaultOpenDocExtension,
  DNDAPIExtension,
  DocDisplayMetaService,
  DocModeService,
  EditPropsStore,
  EmbedOptionService,
  FileSizeLimitService,
  FontLoaderService,
  PageViewportServiceExtension,
  ThemeService,
  ToolbarRegistryExtension,
} from '@blocksuite/affine-shared/services';
import { InteractivityManager, ToolController } from '@blocksuite/std/gfx';

import { clipboardConfigs } from './clipboard';
import { effects } from './effects';

export class FoundationViewExtension extends ViewExtensionProvider {
  override name = 'foundation';

  override effect() {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
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
    ]);
    context.register(clipboardConfigs);
    if (this.isEdgeless(context.scope)) {
      context.register([InteractivityManager, ToolController]);
    }
  }
}
