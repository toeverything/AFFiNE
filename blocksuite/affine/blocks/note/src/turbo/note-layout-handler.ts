import type { Rect } from '@blocksuite/affine-gfx-turbo-renderer';
import {
  BlockLayoutHandlerExtension,
  BlockLayoutHandlersIdentifier,
} from '@blocksuite/affine-gfx-turbo-renderer';
import {
  ColorScheme,
  type NoteBlockModel,
  resolveColor,
} from '@blocksuite/affine-model';
import type { Container } from '@blocksuite/global/di';
import type { EditorHost, GfxBlockComponent } from '@blocksuite/std';
import { clientToModelCoord, type ViewportRecord } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';

import type { NoteLayout } from './note-painter.worker';

export class NoteLayoutHandlerExtension extends BlockLayoutHandlerExtension<NoteLayout> {
  readonly blockType = 'affine:note';

  static override setup(di: Container) {
    di.addImpl(
      BlockLayoutHandlersIdentifier('note'),
      NoteLayoutHandlerExtension
    );
  }

  override queryLayout(
    model: BlockModel,
    host: EditorHost,
    viewportRecord: ViewportRecord
  ): NoteLayout | null {
    const component = host.std.view.getBlock(
      model.id
    ) as GfxBlockComponent | null;
    if (!component) return null;

    // Get the note container element
    const noteContainer = component.querySelector('.affine-note-mask');
    if (!noteContainer) return null;

    // Get the bounding client rect of the note container
    const clientRect = noteContainer.getBoundingClientRect();

    // Convert client coordinates to model coordinates
    const [modelX, modelY] = clientToModelCoord(viewportRecord, [
      clientRect.x,
      clientRect.y,
    ]);

    const { zoom, viewScale } = viewportRecord;

    // Cast model to NoteBlockModel to access background property from props
    const noteModel = model as NoteBlockModel;
    const background = noteModel.props.background;
    // Resolve the color to a string
    const backgroundString = resolveColor(background, ColorScheme.Light);

    // Create the note layout object
    const noteLayout: NoteLayout = {
      type: 'affine:note',
      blockId: model.id,
      rect: {
        x: modelX,
        y: modelY,
        w: clientRect.width / zoom / viewScale,
        h: clientRect.height / zoom / viewScale,
      },
      background: backgroundString,
    };

    return noteLayout;
  }

  calculateBound(layout: NoteLayout) {
    const rect: Rect = layout.rect;

    return {
      rect,
      subRects: [rect], // The note is represented by a single rectangle
    };
  }
}
