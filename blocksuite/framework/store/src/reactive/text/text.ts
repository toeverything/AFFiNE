import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import { type Signal, signal } from '@preact/signals-core';
import * as Y from 'yjs';

import type { BaseTextAttributes } from './attributes';
import type { DeltaInsert, DeltaOperation, OnTextChange } from './types';

/**
 * Text is an abstraction of Y.Text.
 * It provides useful methods to manipulate the text content.
 *
 * @example
 * ```ts
 * const text = new Text('Hello, world!');
 * text.insert(' blocksuite', 7);
 * text.delete(7, 1);
 * text.format(7, 1, { bold: true });
 * text.join(new Text(' blocksuite'));
 * text.split(7, 1);
 * ```
 *
 * Text {@link https://docs.yjs.dev/api/delta-format delta} is a format from Y.js.
 *
 * @category Reactive
 */
export class Text<
  TextAttributes extends BaseTextAttributes = BaseTextAttributes,
> {
  private readonly _deltas$: Signal<DeltaOperation[]>;

  private readonly _length$: Signal<number>;

  private _onChange?: OnTextChange;

  private readonly _yText: Y.Text;

  /**
   * Get the text delta as a signal.
   */
  get deltas$() {
    return this._deltas$;
  }

  get length() {
    return this._length$.value;
  }

  get yText() {
    return this._yText;
  }

  /**
   * @param input - The input can be a string, a Y.Text instance, or an array of DeltaInsert.
   */
  constructor(input?: Y.Text | string | DeltaInsert<TextAttributes>[]) {
    let length = 0;
    if (typeof input === 'string') {
      const text = input.replaceAll('\r\n', '\n');
      length = text.length;
      this._yText = new Y.Text(text);
    } else if (input instanceof Y.Text) {
      this._yText = input;
      if (input.doc) {
        length = input.length;
      }
    } else if (input instanceof Array) {
      for (const delta of input) {
        if (delta.insert) {
          delta.insert = delta.insert.replaceAll('\r\n', '\n');
          length += delta.insert.length;
        }
      }
      const yText = new Y.Text();
      yText.applyDelta(input);
      this._yText = yText;
    } else {
      this._yText = new Y.Text();
    }

    this._length$ = signal(length);
    this._deltas$ = signal(this._yText.doc ? this._yText.toDelta() : []);
    this._yText.observe(event => {
      const isLocal =
        !event.transaction.origin ||
        !this._yText.doc ||
        event.transaction.origin instanceof Y.UndoManager ||
        event.transaction.origin.proxy
          ? true
          : event.transaction.origin === this._yText.doc.clientID;
      this._length$.value = this._yText.length;
      this._deltas$.value = this._yText.toDelta();
      this._onChange?.(this._yText, isLocal);
    });
  }

  private _transact(callback: () => void) {
    const doc = this._yText.doc;
    if (!doc) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to transact text! yText is not attached to a doc'
      );
    }
    doc.transact(() => {
      callback();
    }, doc.clientID);
  }

  /**
   * Apply a delta to the text.
   *
   * @param delta - The delta to apply.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * text.applyDelta([{insert: ' blocksuite', attributes: { bold: true }}]);
   * ```
   */
  applyDelta(delta: DeltaOperation[]) {
    this._transact(() => {
      this._yText?.applyDelta(delta);
    });
  }

  /**
   * @internal
   */
  bind(onChange?: OnTextChange) {
    this._onChange = onChange;
  }

  /**
   * Clear the text content.
   */
  clear() {
    if (!this._yText.length) {
      return;
    }
    this._transact(() => {
      this._yText.delete(0, this._yText.length);
    });
  }

  /**
   * Clone the text to a new Text instance.
   *
   * @returns A new Text instance.
   */
  clone() {
    const text = new Text(this._yText.clone());
    text.bind(this._onChange);
    return text;
  }

  /**
   * Delete the text content.
   *
   * @param index - The index to delete.
   * @param length - The length to delete.
   */
  delete(index: number, length: number) {
    if (length === 0) {
      return;
    }
    if (index < 0 || length < 0 || index + length > this._yText.length) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to delete text! Index or length out of range, index: ' +
          index +
          ', length: ' +
          length +
          ', text length: ' +
          this._yText.length
      );
    }
    this._transact(() => {
      this._yText.delete(index, length);
    });
  }

  /**
   * Format the text content.
   *
   * @param index - The index to format.
   * @param length - The length to format.
   * @param format - The format to apply.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * text.format(7, 1, { bold: true });
   * ```
   */
  format(index: number, length: number, format: Record<string, unknown>) {
    if (length === 0) {
      return;
    }
    if (index < 0 || length < 0 || index + length > this._yText.length) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to format text! Index or length out of range, index: ' +
          index +
          ', length: ' +
          length +
          ', text length: ' +
          this._yText.length
      );
    }
    this._transact(() => {
      this._yText.format(index, length, format);
    });
  }

  /**
   * Insert content at the specified index.
   *
   * @param content - The content to insert.
   * @param index - The index to insert.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * text.insert(' blocksuite', 7);
   * ```
   */
  insert(content: string, index: number, attributes?: Record<string, unknown>) {
    if (!content.length) {
      return;
    }
    if (index < 0 || index > this._yText.length) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to insert text! Index or length out of range, index: ' +
          index +
          ', length: ' +
          content.length +
          ', text length: ' +
          this._yText.length
      );
    }
    this._transact(() => {
      this._yText.insert(index, content, attributes);
    });
  }

  /**
   * Join current text with another text.
   *
   * @param other - The other text to join.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * const other = new Text(' blocksuite');
   * text.join(other);
   * ```
   */
  join(other: Text) {
    if (!other || !other.toDelta().length) {
      return;
    }
    this._transact(() => {
      const yOther = other._yText;
      const delta: DeltaOperation[] = yOther.toDelta();
      delta.unshift({ retain: this._yText.length });
      this._yText.applyDelta(delta);
    });
  }

  /**
   * Replace the text content with a new content.
   *
   * @param index - The index to replace.
   * @param length - The length to replace.
   * @param content - The content to replace.
   * @param attributes - The attributes to replace.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * text.replace(7, 1, ' blocksuite');
   * ```
   */
  replace(
    index: number,
    length: number,
    content: string,
    attributes?: Record<string, unknown>
  ) {
    if (index < 0 || length < 0 || index + length > this._yText.length) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to replace text! The length of the text is' +
          this._yText.length +
          ', but you are trying to replace from' +
          index +
          'to' +
          index +
          length
      );
    }
    this._transact(() => {
      this._yText.delete(index, length);
      this._yText.insert(index, content, attributes);
    });
  }

  /**
   * Slice the text to a delta.
   *
   * @param begin - The begin index.
   * @param end - The end index.
   *
   * @returns The delta of the sliced text.
   */
  sliceToDelta(begin: number, end?: number): DeltaOperation[] {
    const result: DeltaOperation[] = [];
    if (end && begin >= end) {
      return result;
    }

    if (begin === 0 && end === 0) {
      return [];
    }

    const delta = this.toDelta();
    if (begin < 1 && !end) {
      return delta;
    }

    if (delta && delta instanceof Array) {
      let charNum = 0;
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < delta.length; i++) {
        const content = delta[i];
        let contentText: string = content.insert || '';
        const contentLen = contentText.length;

        const isLastOp = end && charNum + contentLen > end;
        const isFirstOp = charNum + contentLen > begin && result.length === 0;
        if (isFirstOp && isLastOp) {
          contentText = contentText.slice(begin - charNum, end - charNum);
          result.push({
            ...content,
            insert: contentText,
          });
          break;
        } else if (isFirstOp || isLastOp) {
          contentText = isLastOp
            ? contentText.slice(0, end - charNum)
            : contentText.slice(begin - charNum);

          result.push({
            ...content,
            insert: contentText,
          });
        } else {
          result.length > 0 && result.push(content);
        }

        if (end && charNum + contentLen > end) {
          break;
        }

        charNum = charNum + contentLen;
      }
    }
    return result;
  }

  /**
   * Split the text into another Text.
   *
   * @param index - The index to split.
   * @param length - The length to split.
   *
   * @returns The right part of the text.
   *
   * @example
   * ```ts
   * const text = new Text('Hello, world!');
   * text.split(7, 1);
   * ```
   *
   * NOTE: The string included in [index, index + length) will be deleted.
   *
   * Here are three cases for point position(index + length):
   *
   * ```
   * [{insert: 'abc', ...}, {insert: 'def', ...}, {insert: 'ghi', ...}]
   * 1. abc|de|fghi
   *    left: [{insert: 'abc', ...}]
   *    right: [{insert: 'f', ...}, {insert: 'ghi', ...}]
   * 2. abc|def|ghi
   *    left: [{insert: 'abc', ...}]
   *    right: [{insert: 'ghi', ...}]
   * 3. abc|defg|hi
   *    left: [{insert: 'abc', ...}]
   *    right: [{insert: 'hi', ...}]
   * ```
   */
  split(index: number, length = 0): Text {
    if (index < 0 || length < 0 || index + length > this._yText.length) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'Failed to split text! Index or length out of range, index: ' +
          index +
          ', length: ' +
          length +
          ', text length: ' +
          this._yText.length
      );
    }
    const deltas = this._yText.toDelta();
    if (!(deltas instanceof Array)) {
      throw new BlockSuiteError(
        ErrorCode.ReactiveProxyError,
        'This text cannot be split because we failed to get the deltas of it.'
      );
    }
    let tmpIndex = 0;
    const rightDeltas: DeltaInsert<TextAttributes>[] = [];
    for (let i = 0; i < deltas.length; i++) {
      const insert = deltas[i].insert;
      if (typeof insert === 'string') {
        if (tmpIndex + insert.length >= index + length) {
          const insertRight = insert.slice(index + length - tmpIndex);
          rightDeltas.push({
            insert: insertRight,
            attributes: deltas[i].attributes,
          });
          rightDeltas.push(...deltas.slice(i + 1));
          break;
        }
        tmpIndex += insert.length;
      } else {
        throw new BlockSuiteError(
          ErrorCode.ReactiveProxyError,
          'This text cannot be split because it contains non-string insert.'
        );
      }
    }

    this.delete(index, this.length - index);
    const rightYText = new Y.Text();
    rightYText.applyDelta(rightDeltas);
    const rightText = new Text(rightYText);
    rightText.bind(this._onChange);

    return rightText;
  }

  /**
   * Get the text delta.
   *
   * @returns The delta of the text.
   */
  toDelta(): DeltaOperation[] {
    return this._yText?.toDelta() || [];
  }

  /**
   * Get the text content as a string.
   * In most cases, you should not use this method. It will lose the delta attributes information.
   *
   * @returns The text content.
   */
  toString() {
    return this._yText?.toString() || '';
  }
}
