import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

const SurfaceSelectionSchema = z.object({
  blockId: z.string(),
  elements: z.array(z.string()),
  editing: z.boolean(),
  inoperable: z.boolean().optional(),
});

export class SurfaceSelection extends BaseSelection {
  static override group = 'gfx';

  static override type = 'surface';

  readonly editing: boolean;

  readonly elements: string[];

  readonly inoperable: boolean;

  constructor(
    blockId: string,
    elements: string[],
    editing: boolean,
    inoperable = false
  ) {
    super({ blockId });

    this.elements = elements;
    this.editing = editing;
    this.inoperable = inoperable;
  }

  static override fromJSON(json: Record<string, unknown>): SurfaceSelection {
    const { blockId, elements, editing, inoperable } =
      SurfaceSelectionSchema.parse(json);
    return new SurfaceSelection(blockId, elements, editing, inoperable);
  }

  override equals(other: BaseSelection): boolean {
    if (other instanceof SurfaceSelection) {
      return (
        this.blockId === other.blockId &&
        this.editing === other.editing &&
        this.inoperable === other.inoperable &&
        this.elements.length === other.elements.length &&
        this.elements.every((id, idx) => id === other.elements[idx])
      );
    }

    return false;
  }

  isEmpty() {
    return this.elements.length === 0 && !this.editing;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: 'surface',
      blockId: this.blockId,
      elements: this.elements,
      editing: this.editing,
      inoperable: this.inoperable,
    };
  }
}

export const SurfaceSelectionExtension = SelectionExtension(SurfaceSelection);
