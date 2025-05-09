import {
  type ReferenceParams,
  ReferenceParamsSchema,
} from '@blocksuite/affine-model';
import { BaseSelection, SelectionExtension } from '@blocksuite/store';

export class HighlightSelection extends BaseSelection {
  static override group = 'scene';

  static override type = 'highlight';

  readonly blockIds: string[] = [];

  readonly elementIds: string[] = [];

  readonly mode: 'page' | 'edgeless' = 'page';

  constructor({ mode, blockIds, elementIds }: ReferenceParams) {
    super({ blockId: '[scene-highlight]' });

    this.mode = mode ?? 'page';
    this.blockIds = blockIds ?? [];
    this.elementIds = elementIds ?? [];
  }

  static override fromJSON(json: Record<string, unknown>): HighlightSelection {
    const result = ReferenceParamsSchema.parse(json);
    return new HighlightSelection(result);
  }

  override equals(other: HighlightSelection): boolean {
    return (
      this.mode === other.mode &&
      this.blockId === other.blockId &&
      this.blockIds.length === other.blockIds.length &&
      this.elementIds.length === other.elementIds.length &&
      this.blockIds.every((id, n) => id === other.blockIds[n]) &&
      this.elementIds.every((id, n) => id === other.elementIds[n])
    );
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: 'highlight',
      mode: this.mode,
      blockId: this.blockId,
      blockIds: this.blockIds,
      elementIds: this.elementIds,
    };
  }
}

export const HighlightSelectionExtension =
  SelectionExtension(HighlightSelection);
