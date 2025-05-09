import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

const BlockSelectionSchema = z.object({
  blockId: z.string(),
});

export class BlockSelection extends BaseSelection {
  static override group = 'note';

  static override type = 'block';

  static override fromJSON(json: Record<string, unknown>): BlockSelection {
    const result = BlockSelectionSchema.parse(json);
    return new BlockSelection(result);
  }

  override equals(other: BaseSelection): boolean {
    if (other instanceof BlockSelection) {
      return this.blockId === other.blockId;
    }
    return false;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: 'block',
      blockId: this.blockId,
    };
  }
}

export const BlockSelectionExtension = SelectionExtension(BlockSelection);
