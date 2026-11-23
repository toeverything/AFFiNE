import type { ASTWalkerContext } from '@blocksuite/store';

import type { ElementModelMap } from '../element-model/index.js';

export type ElementModelAdapterContext<TNode extends object = never> = {
  walkerContext: ASTWalkerContext<TNode>;
  elements: Record<string, Record<string, unknown>>;
};

export type ElementModelMatcher<TNode extends object = never> = {
  name: keyof ElementModelMap;
  match: (element: Record<string, unknown>) => boolean;
  toAST: (
    element: Record<string, unknown>,
    context: ElementModelAdapterContext<TNode>
  ) => TNode | null;
};

export abstract class ElementModelAdapter<
  AST = unknown,
  TNode extends object = never,
> {
  /**
   * Convert element model to AST format
   */
  abstract fromElementModel(
    element: Record<string, unknown>,
    context: ElementModelAdapterContext<TNode>
  ): AST | null;
}
