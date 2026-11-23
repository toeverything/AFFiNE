import type { TextBuffer } from '@blocksuite/affine-shared/adapters';

import {
  ElementModelAdapter,
  type ElementModelAdapterContext,
} from '../../type.js';
import type { ElementToPlainTextAdapterMatcher } from './type.js';

export class PlainTextElementModelAdapter extends ElementModelAdapter<
  string,
  TextBuffer
> {
  constructor(
    readonly elementModelMatchers: ElementToPlainTextAdapterMatcher[]
  ) {
    super();
  }

  fromElementModel(
    element: Record<string, unknown>,
    context: ElementModelAdapterContext<TextBuffer>
  ) {
    for (const matcher of this.elementModelMatchers) {
      if (matcher.match(element)) {
        return matcher.toAST(element, context)?.content ?? '';
      }
    }
    return '';
  }
}

export * from './type.js';
