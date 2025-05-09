import {
  type ClipboardConfigCreationContext,
  EdgelessClipboardConfig,
} from '@blocksuite/affine-block-surface';
import { type BlockSnapshot, fromJSON } from '@blocksuite/store';

export class EdgelessClipboardFrameConfig extends EdgelessClipboardConfig {
  static override readonly key = 'affine:frame';

  override createBlock(
    frame: BlockSnapshot,
    context: ClipboardConfigCreationContext
  ): string | null {
    if (!this.surface) return null;

    const { oldToNewIdMap, newPresentationIndexes } = context;
    const { xywh, title, background, childElementIds } = frame.props;

    const newChildElementIds: Record<string, boolean> = {};

    if (typeof childElementIds === 'object' && childElementIds !== null) {
      Object.keys(childElementIds).forEach(oldId => {
        const newId = oldToNewIdMap.get(oldId);
        if (newId) {
          newChildElementIds[newId] = true;
        }
      });
    }

    const frameId = this.crud.addBlock(
      'affine:frame',
      {
        xywh,
        background,
        title: fromJSON(title),
        childElementIds: newChildElementIds,
        presentationIndex: newPresentationIndexes.get(frame.id),
      },
      this.surface.model.id
    );
    return frameId;
  }
}
