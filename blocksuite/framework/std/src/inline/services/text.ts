import type { BaseTextAttributes, DeltaInsert } from '@blocksuite/store';

import type { InlineEditor } from '../inline-editor.js';
import type { InlineRange } from '../types.js';
import { intersectInlineRange } from '../utils/inline-range.js';

export class InlineTextService<TextAttributes extends BaseTextAttributes> {
  deleteText = (inlineRange: InlineRange): void => {
    if (this.editor.isReadonly) return;

    this.transact(() => {
      this.yText.delete(inlineRange.index, inlineRange.length);
    });
  };

  formatText = (
    inlineRange: InlineRange,
    attributes: TextAttributes,
    options: {
      match?: (delta: DeltaInsert, deltaInlineRange: InlineRange) => boolean;
      mode?: 'replace' | 'merge';
      withoutTransact?: boolean;
    } = {}
  ): void => {
    if (this.editor.isReadonly) return;

    const {
      match = () => true,
      mode = 'merge',
      withoutTransact = false,
    } = options;
    const deltas = this.editor.deltaService.getDeltasByInlineRange(inlineRange);

    deltas
      .filter(([delta, deltaInlineRange]) => match(delta, deltaInlineRange))
      .forEach(([_delta, deltaInlineRange]) => {
        const normalizedAttributes =
          this.editor.attributeService.normalizeAttributes(attributes);
        if (!normalizedAttributes) return;

        const targetInlineRange = intersectInlineRange(
          inlineRange,
          deltaInlineRange
        );
        if (!targetInlineRange) return;

        if (mode === 'replace') {
          this.resetText(targetInlineRange);
        }

        this.transact(() => {
          this.yText.format(
            targetInlineRange.index,
            targetInlineRange.length,
            normalizedAttributes
          );
        }, withoutTransact);
      });
  };

  insertLineBreak = (inlineRange: InlineRange): void => {
    if (this.editor.isReadonly) return;

    this.transact(() => {
      this.yText.delete(inlineRange.index, inlineRange.length);
      this.yText.insert(inlineRange.index, '\n');
    });
  };

  insertText = (
    inlineRange: InlineRange,
    text: string,
    attributes: TextAttributes = {} as TextAttributes
  ): void => {
    if (this.editor.isReadonly) return;

    if (!text || !text.length) return;

    if (this.editor.attributeService.marks) {
      attributes = { ...attributes, ...this.editor.attributeService.marks };
    }
    const normalizedAttributes =
      this.editor.attributeService.normalizeAttributes(attributes);

    this.transact(() => {
      this.yText.delete(inlineRange.index, inlineRange.length);
      this.yText.insert(inlineRange.index, text, normalizedAttributes);
    });
  };

  resetText = (inlineRange: InlineRange): void => {
    if (this.editor.isReadonly) return;

    const coverDeltas: DeltaInsert[] = [];
    for (
      let i = inlineRange.index;
      i <= inlineRange.index + inlineRange.length;
      i++
    ) {
      const delta = this.editor.getDeltaByRangeIndex(i);
      if (delta) {
        coverDeltas.push(delta);
      }
    }

    const unset = Object.fromEntries(
      coverDeltas.flatMap(delta =>
        delta.attributes
          ? Object.keys(delta.attributes).map(key => [key, null])
          : []
      )
    );

    this.transact(() => {
      this.yText.format(inlineRange.index, inlineRange.length, {
        ...unset,
      });
    });
  };

  setText = (
    text: string,
    attributes: TextAttributes = {} as TextAttributes
  ): void => {
    if (this.editor.isReadonly) return;

    this.transact(() => {
      this.yText.delete(0, this.yText.length);
      this.yText.insert(0, text, attributes);
    });
  };

  readonly transact = this.editor.transact;

  get yText() {
    return this.editor.yText;
  }

  constructor(readonly editor: InlineEditor<TextAttributes>) {}
}
