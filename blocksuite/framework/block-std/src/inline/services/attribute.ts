import { type BaseTextAttributes, baseTextAttributes } from '@blocksuite/store';
import type { z, ZodTypeDef } from 'zod';

import type { InlineEditor } from '../inline-editor.js';
import type { AttributeRenderer, InlineRange } from '../types.js';
import { getDefaultAttributeRenderer } from '../utils/index.js';

export class AttributeService<TextAttributes extends BaseTextAttributes> {
  private _attributeRenderer: AttributeRenderer<TextAttributes> =
    getDefaultAttributeRenderer<TextAttributes>();

  private _attributeSchema: z.ZodSchema<TextAttributes, ZodTypeDef, unknown> =
    baseTextAttributes as never;

  private _marks: TextAttributes | null = null;

  getFormat = (inlineRange: InlineRange, loose = false): TextAttributes => {
    const deltas = this.editor.deltaService
      .getDeltasByInlineRange(inlineRange)
      .filter(([_, position]) => {
        const deltaStart = position.index;
        const deltaEnd = position.index + position.length;
        const inlineStart = inlineRange.index;
        const inlineEnd = inlineRange.index + inlineRange.length;

        if (inlineStart === inlineEnd) {
          return deltaStart < inlineStart && inlineStart <= deltaEnd;
        } else {
          return deltaEnd > inlineStart && deltaStart <= inlineEnd;
        }
      });
    const maybeAttributesList = deltas.map(([delta]) => delta.attributes);
    if (loose) {
      return maybeAttributesList.reduce(
        (acc, cur) => ({ ...acc, ...cur }),
        {}
      ) as TextAttributes;
    }
    if (
      !maybeAttributesList.length ||
      // some text does not have any attribute
      maybeAttributesList.some(attributes => !attributes)
    ) {
      return {} as TextAttributes;
    }
    const attributesList = maybeAttributesList as TextAttributes[];
    return attributesList.reduce((acc, cur) => {
      const newFormat = {} as TextAttributes;
      for (const key in acc) {
        const typedKey = key as keyof TextAttributes;
        // If the given range contains multiple different formats
        // such as links with different values,
        // we will treat it as having no format
        if (acc[typedKey] === cur[typedKey]) {
          // This cast is secure because we have checked that the value of the key is the same.

          newFormat[typedKey] = acc[typedKey] as any;
        }
      }
      return newFormat;
    });
  };

  normalizeAttributes = (textAttributes?: TextAttributes) => {
    if (!textAttributes) {
      return undefined;
    }
    const attributeResult = this._attributeSchema.safeParse(textAttributes);
    if (!attributeResult.success) {
      console.error(attributeResult.error);
      return undefined;
    }
    return Object.fromEntries(
      // filter out undefined values
      Object.entries(attributeResult.data).filter(([_, v]) => v !== undefined)
    ) as TextAttributes;
  };

  resetMarks = (): void => {
    this._marks = null;
  };

  setAttributeRenderer = (renderer: AttributeRenderer<TextAttributes>) => {
    this._attributeRenderer = renderer;
  };

  setAttributeSchema = (
    schema: z.ZodSchema<TextAttributes, ZodTypeDef, unknown>
  ) => {
    this._attributeSchema = schema;
  };

  setMarks = (marks: TextAttributes): void => {
    this._marks = marks;
  };

  get attributeRenderer() {
    return this._attributeRenderer;
  }

  get marks() {
    return this._marks;
  }

  constructor(readonly editor: InlineEditor<TextAttributes>) {}
}
