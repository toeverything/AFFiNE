import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

import { boardWidget } from './blocks/board';
import { chartWidget } from './blocks/chart';
import { helloWidget } from './blocks/hello';
import { sketchWidget } from './blocks/sketch';
import { effects } from './effects';
import { WhiteboardCollabLayerExtension } from './collab/collab-layer';
import { WhiteboardL0LayerExtension } from './perf/l0-layer';
import { WhiteboardLayoutHandlerExtensions } from './perf/layout-handler';
import {
  collectViewExtensions,
  type GfxWidgetRegistration,
} from './register-gfx-widget';
import {
  type WhiteboardReactToLit,
  WhiteboardReactToLitExtension,
} from './react-to-lit';

const optionsSchema = z.object({
  enableHello: z.boolean().optional(),
  enableChart: z.boolean().optional(),
  enableSketch: z.boolean().optional(),
  enableBoard: z.boolean().optional(),
  enablePerfHud: z.boolean().optional(),
  enableL0Layer: z.boolean().optional(),
  enableCollab: z.boolean().optional(),
  reactToLit: z
    .custom<WhiteboardReactToLit>()
    .optional(),
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

    if (options?.reactToLit) {
      context.register(
        WhiteboardReactToLitExtension(options.reactToLit as WhiteboardReactToLit)
      );
    }

    const widgets: GfxWidgetRegistration[] = [];
    if (options?.enableHello !== false) {
      widgets.push(helloWidget);
    }
    if (options?.enableChart) {
      widgets.push(chartWidget);
    }
    if (options?.enableSketch) {
      widgets.push(sketchWidget);
    }
    if (options?.enableBoard) {
      widgets.push(boardWidget);
    }

    const extensions = collectViewExtensions(
      widgets,
      context.scope,
      this.isPreview(context.scope),
      this.isEdgeless(context.scope)
    );
    if (this.isEdgeless(context.scope) && !this.isPreview(context.scope)) {
      context.register(WhiteboardLayoutHandlerExtensions);
      if (options?.enableL0Layer) {
        context.register(WhiteboardL0LayerExtension);
      }
      if (options?.enableCollab) {
        context.register(WhiteboardCollabLayerExtension);
      }
      if (options?.enablePerfHud && typeof document !== 'undefined') {
        queueMicrotask(() => {
          if (!document.querySelector('wb-perf-hud')) {
            document.body.append(document.createElement('wb-perf-hud'));
          }
        });
      }
    }

    if (extensions.length) {
      context.register(extensions);
    }
  }
}
