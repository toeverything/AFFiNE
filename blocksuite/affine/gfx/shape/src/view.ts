import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { loadAllLibraryStencilPartitions } from './drawio/stencil-utils.js';
import { effects } from './effects';
import { ShapeElementRendererExtension } from './element-renderer';
import { ShapeDomRendererExtension } from './element-renderer/shape-dom';
import { ShapeElementView, ShapeViewInteraction } from './element-view';
import { ShapeTool } from './shape-tool';
import { shapeSeniorTool, shapeToolbarExtension } from './toolbar';

let libraryPrefetchScheduled = false;

/**
 * Prefetches the drawio library partitions at browser-idle time, once per
 * page load, so it's more likely already warm by the time a user opens the
 * shape browser panel. Purely a head start — the panel's own on-demand
 * loading (stencil-utils.ts) is what actually guarantees correctness, this
 * just makes the common case feel faster. Never runs on the boot-critical
 * path: requestIdleCallback only fires after the browser has nothing more
 * urgent to do, and the import it triggers is the same lazy dynamic import
 * used everywhere else — nothing here is a static/eager dependency.
 */
function scheduleLibraryStencilPrefetch() {
  if (libraryPrefetchScheduled || typeof window === 'undefined') {
    return;
  }
  libraryPrefetchScheduled = true;

  const prefetch = () => {
    loadAllLibraryStencilPartitions().catch(() => {
      // best-effort — the panel will still load on demand if this failed
    });
  };

  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(prefetch, { timeout: 10_000 });
  } else {
    setTimeout(prefetch, 2000);
  }
}

export class ShapeViewExtension extends ViewExtensionProvider {
  override name = 'affine-shape-gfx';

  override effect(): void {
    super.effect();
    effects();
  }

  override setup(context: ViewExtensionContext) {
    super.setup(context);
    if (this.isEdgeless(context.scope)) {
      context.register(ShapeElementRendererExtension);
      context.register(ShapeDomRendererExtension);
      context.register(ShapeElementView);
      context.register(ShapeTool);
      context.register(shapeSeniorTool);
      context.register(shapeToolbarExtension);
      context.register(ShapeViewInteraction);
      scheduleLibraryStencilPrefetch();
    }
  }
}
