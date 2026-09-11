import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

import { helloWidget } from './blocks/hello';
import { effects } from './effects';
import {
  collectViewExtensions,
  type GfxWidgetRegistration,
} from './register-gfx-widget';

const optionsSchema = z.object({
  enableHello: z.boolean().optional(),
  enableChart: z.boolean().optional(),
  enableSketch: z.boolean().optional(),
  enableBoard: z.boolean().optional(),
});

export type WhiteboardViewOptions = z.infer<typeof optionsSchema>;

export class WhiteboardViewExtension extends ViewExtensionProvider<WhiteboardViewOptions> {
  override name = 'affine-whiteboard-view';

  override schema = optionsSchema;

  override effect() {
    super.effect();
    effects();
  }

  override setup(
    context: ViewExtensionContext,
    options?: WhiteboardViewOptions
  ) {
    super.setup(context, options);

    const widgets: GfxWidgetRegistration[] = [];
    if (options?.enableHello !== false) {
      widgets.push(helloWidget);
    }

    const extensions = collectViewExtensions(
      widgets,
      context.scope,
      this.isPreview(context.scope),
      this.isEdgeless(context.scope)
    );
    if (extensions.length) {
      context.register(extensions);
    }
  }
}
