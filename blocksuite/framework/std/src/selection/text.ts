import { BaseSelection, SelectionExtension } from '@blocksuite/store';
import z from 'zod';

export type TextRangePoint = {
  blockId: string;
  index: number;
  length: number;
};

export type TextSelectionProps = {
  from: TextRangePoint;
  to: TextRangePoint | null;
  reverse?: boolean;
};

const TextSelectionSchema = z.object({
  from: z.object({
    blockId: z.string(),
    index: z.number(),
    length: z.number(),
  }),
  to: z
    .object({
      blockId: z.string(),
      index: z.number(),
      length: z.number(),
    })
    .nullable(),
  // The `optional()` is for backward compatibility,
  // since `reverse` may not exist in remote selection.
  reverse: z.boolean().optional(),
});

export class TextSelection extends BaseSelection {
  static override group = 'note';

  static override type = 'text';

  from: TextRangePoint;

  reverse: boolean;

  to: TextRangePoint | null;

  get end(): TextRangePoint {
    return this.reverse ? this.from : (this.to ?? this.from);
  }

  get start(): TextRangePoint {
    return this.reverse ? (this.to ?? this.from) : this.from;
  }

  constructor({ from, to, reverse }: TextSelectionProps) {
    super({
      blockId: from.blockId,
    });
    this.from = from;

    this.to = this._equalPoint(from, to) ? null : to;

    this.reverse = !!reverse;
  }

  static override fromJSON(json: Record<string, unknown>): TextSelection {
    const result = TextSelectionSchema.parse(json);
    return new TextSelection(result);
  }

  private _equalPoint(
    a: TextRangePoint | null,
    b: TextRangePoint | null
  ): boolean {
    if (a && b) {
      return (
        a.blockId === b.blockId && a.index === b.index && a.length === b.length
      );
    }

    return a === b;
  }

  empty(): boolean {
    return !!this.to;
  }

  override equals(other: BaseSelection): boolean {
    if (other instanceof TextSelection) {
      return (
        this.blockId === other.blockId &&
        this._equalPoint(other.from, this.from) &&
        this._equalPoint(other.to, this.to)
      );
    }
    return false;
  }

  isCollapsed(): boolean {
    return this.to === null && this.from.length === 0;
  }

  isInSameBlock(): boolean {
    return this.to === null || this.from.blockId === this.to.blockId;
  }

  override toJSON(): Record<string, unknown> {
    return {
      type: 'text',
      from: this.from,
      to: this.to,
      reverse: this.reverse,
    };
  }
}

export const TextSelectionExtension = SelectionExtension(TextSelection);
