import { ReferenceParamsSchema } from '@blocksuite/affine-model';
import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

const HighlightSelectionParamsSchema = ReferenceParamsSchema.extend({
  highlight: z.boolean().optional(),
});

type HighlightSelectionParams = z.infer<typeof HighlightSelectionParamsSchema>;

export class HighlightSelection extends BaseSelection {
  static override group = 'scene';

  static override type = 'highlight';

  readonly blockIds: string[] = [];

  readonly elementIds: string[] = [];

  readonly mode: 'page' | 'edgeless' = 'page';

  readonly highlight: boolean = true;

  constructor({
    mode,
    blockIds,
    elementIds,
    highlight = true,
  }: HighlightSelectionParams) {
    super({ blockId: '[scene-highlight]' });

    this.mode = mode ?? 'page';
    this.blockIds = blockIds ?? [];
    this.elementIds = elementIds ?? [];
    this.highlight = highlight;
  }

  static override fromJSON(json: Record<string, unknown>): HighlightSelection {
    const result = HighlightSelectionParamsSchema.parse(json);
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
