import type { BaseTextAttributes, DeltaInsert } from '@blocksuite/store';

import type { InlineEditor } from '../inline-editor.js';
import type { DeltaEntry, InlineRange } from '../types.js';
import { transformDeltasToEmbedDeltas } from '../utils/index.js';

export class DeltaService<TextAttributes extends BaseTextAttributes> {
  /**
   * Here are examples of how this function computes and gets the delta.
   *
   * We have such a text:
   * ```
   * [
   *   {
   *      insert: 'aaa',
   *      attributes: { bold: true },
   *   },
   *   {
   *      insert: 'bbb',
   *      attributes: { italic: true },
   *   },
   * ]
   * ```
   *
   * `getDeltaByRangeIndex(0)` returns `{ insert: 'aaa', attributes: { bold: true } }`.
   *
   * `getDeltaByRangeIndex(1)` returns `{ insert: 'aaa', attributes: { bold: true } }`.
   *
   * `getDeltaByRangeIndex(3)` returns `{ insert: 'aaa', attributes: { bold: true } }`.
   *
   * `getDeltaByRangeIndex(4)` returns `{ insert: 'bbb', attributes: { italic: true } }`.
   */
  getDeltaByRangeIndex = (rangeIndex: number) => {
    const deltas = this.editor.embedDeltas;

    let index = 0;
    for (const delta of deltas) {
      if (index + delta.insert.length >= rangeIndex) {
        return delta;
      }
      index += delta.insert.length;
    }

    return null;
  };

  /**
   * Here are examples of how this function computes and gets the deltas.
   *
   * We have such a text:
   * ```
   * [
   *   {
   *      insert: 'aaa',
   *      attributes: { bold: true },
   *   },
   *   {
   *      insert: 'bbb',
   *      attributes: { italic: true },
   *   },
   *   {
   *      insert: 'ccc',
   *      attributes: { underline: true },
   *   },
   * ]
   * ```
   *
   * `getDeltasByInlineRange({ index: 0, length: 0 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }]]
   * ```
   *
   * `getDeltasByInlineRange({ index: 0, length: 1 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }]]
   * ```
   *
   * `getDeltasByInlineRange({ index: 0, length: 4 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }],
   *  [{ insert: 'bbb', attributes: { italic: true }, }, { index: 3, length: 3, }]]
   * ```
   *
   * `getDeltasByInlineRange({ index: 3, length: 1 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }],
   *  [{ insert: 'bbb', attributes: { italic: true }, }, { index: 3, length: 3, }]]
   * ```
   *
   * `getDeltasByInlineRange({ index: 3, length: 3 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }],
   *  [{ insert: 'bbb', attributes: { italic: true }, }, { index: 3, length: 3, }]]
   * ```
   *
   *  `getDeltasByInlineRange({ index: 3, length: 4 })` returns
   * ```
   * [{ insert: 'aaa', attributes: { bold: true }, }, { index: 0, length: 3, }],
   *  [{ insert: 'bbb', attributes: { italic: true }, }, { index: 3, length: 3, }],
   *  [{ insert: 'ccc', attributes: { underline: true }, }, { index: 6, length: 3, }]]
   * ```
   */
  getDeltasByInlineRange = (
    inlineRange: InlineRange
  ): DeltaEntry<TextAttributes>[] => {
    return this.mapDeltasInInlineRange(
      inlineRange,
      (delta, index): DeltaEntry<TextAttributes> => [
        delta,
        { index, length: delta.insert.length },
      ]
    );
  };

  mapDeltasInInlineRange = <Result>(
    inlineRange: InlineRange,
    callback: (
      delta: DeltaInsert<TextAttributes>,
      rangeIndex: number,
      deltaIndex: number
    ) => Result
  ) => {
    const deltas = this.editor.embedDeltas;
    const result: Result[] = [];

    // eslint-disable-next-line sonarjs/no-ignored-return
    deltas.reduce((rangeIndex, delta, deltaIndex) => {
      const length = delta.insert.length;
      const from = inlineRange.index - length;
      const to = inlineRange.index + inlineRange.length;

      const deltaInRange =
        rangeIndex >= from &&
        (rangeIndex < to ||
          (inlineRange.length === 0 && rangeIndex === inlineRange.index));

      if (deltaInRange) {
        const value = callback(delta, rangeIndex, deltaIndex);
        result.push(value);
      }

      return rangeIndex + length;
    }, 0);

    return result;
  };

  get embedDeltas() {
    return transformDeltasToEmbedDeltas(this.editor, this.editor.yTextDeltas);
  }

  constructor(readonly editor: InlineEditor<TextAttributes>) {}
}
