import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

const ImageSelectionSchema = z.object({
  blockId: z.string(),
});

export class ImageSelection extends BaseSelection {
  static override group = 'note';

  static override type = 'image';

  static override fromJSON(json: Record<string, unknown>): ImageSelection {
    const result = ImageSelectionSchema.parse(json);
    return new ImageSelection(result);
  }

  override equals(other: BaseSelection): boolean {
    if (other instanceof ImageSelection) {
      return this.blockId === other.blockId;
    }
    return false;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: this.type,
      blockId: this.blockId,
    };
  }
}

export const ImageSelectionExtension = SelectionExtension(ImageSelection);
