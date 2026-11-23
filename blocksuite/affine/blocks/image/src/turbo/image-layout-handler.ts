import type { Rect } from '@blocksuite/affine-gfx-turbo-renderer';
import {
  BlockLayoutHandlerExtension,
  BlockLayoutHandlersIdentifier,
} from '@blocksuite/affine-gfx-turbo-renderer';
import type { Container } from '@blocksuite/global/di';
import type { EditorHost, GfxBlockComponent } from '@blocksuite/std';
import { clientToModelCoord, type ViewportRecord } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import type { ImageLayout } from './image-painter.worker';

export class ImageLayoutHandlerExtension extends BlockLayoutHandlerExtension<ImageLayout> {
  readonly blockType = 'affine:image';

  static override setup(di: Container) {
    di.addImpl(
      BlockLayoutHandlersIdentifier('image'),
      ImageLayoutHandlerExtension
    );
  }

  override queryLayout(
    model: BlockModel,
    host: EditorHost,
    viewportRecord: ViewportRecord
  ): ImageLayout | null {
    const component = host.std.view.getBlock(
      model.id
    ) as GfxBlockComponent | null;
    if (!component) return null;

    const imageContainer = component.querySelector('.affine-image-container');
    if (!imageContainer) return null;

    const resizableImg = component.querySelector(
      '.resizable-img'
    ) as HTMLElement;
    if (!resizableImg) return null;

    const { zoom, viewScale } = viewportRecord;
    const rect = resizableImg.getBoundingClientRect();

    const [modelX, modelY] = clientToModelCoord(viewportRecord, [
      rect.x,
      rect.y,
    ]);

    const imageLayout: ImageLayout = {
      type: 'affine:image',
      blockId: model.id,
      rect: {
        x: modelX,
        y: modelY,
        w: rect.width / zoom / viewScale,
        h: rect.height / zoom / viewScale,
      },
    };

    return imageLayout;
  }

  calculateBound(layout: ImageLayout) {
    const rect: Rect = layout.rect;

    return {
      rect,
      subRects: [rect],
    };
  }
}
