import type { BaseTextAttributes } from '@blocksuite/store';

import type { InlineEditor } from '../inline-editor.js';
import type { InlineRange } from '../types.js';

export interface BeforeinputHookCtx<TextAttributes extends BaseTextAttributes> {
  inlineEditor: InlineEditor<TextAttributes>;
  raw: InputEvent;
  inlineRange: InlineRange;
  data: string | null;
  attributes: TextAttributes;
}
export interface CompositionEndHookCtx<
  TextAttributes extends BaseTextAttributes,
> {
  inlineEditor: InlineEditor<TextAttributes>;
  raw: CompositionEvent;
  inlineRange: InlineRange;
  data: string | null;
  attributes: TextAttributes;
}

export type HookContext<TextAttributes extends BaseTextAttributes> =
  | BeforeinputHookCtx<TextAttributes>
  | CompositionEndHookCtx<TextAttributes>;

export class InlineHookService<TextAttributes extends BaseTextAttributes> {
  constructor(
    readonly editor: InlineEditor<TextAttributes>,
    readonly hooks: {
      beforeinput?: (props: BeforeinputHookCtx<TextAttributes>) => void;
      compositionEnd?: (props: CompositionEndHookCtx<TextAttributes>) => void;
    } = {}
  ) {}
}
