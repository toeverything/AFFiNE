import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

const CursorSelectionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export class CursorSelection extends BaseSelection {
  static override group = 'gfx';

  static override type = 'cursor';

  readonly x: number;

  readonly y: number;

  constructor(x: number, y: number) {
    super({ blockId: '[gfx-cursor]' });
    this.x = x;
    this.y = y;
  }

  static override fromJSON(json: Record<string, unknown>): CursorSelection {
    const { x, y } = CursorSelectionSchema.parse(json);
    return new CursorSelection(x, y);
  }

  override equals(other: BaseSelection): boolean {
    if (other instanceof CursorSelection) {
      return this.x === other.x && this.y === other.y;
    }
    return false;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: 'cursor',
      x: this.x,
      y: this.y,
    };
  }
}

export const CursorSelectionExtension = SelectionExtension(CursorSelection);
