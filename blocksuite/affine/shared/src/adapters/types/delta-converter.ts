import type { ServiceProvider } from '@blocksuite/global/di';
import type { BaseTextAttributes, DeltaInsert } from '@blocksuite/store';

import type { AffineTextAttributes } from '../../types';

export type DeltaASTConverterOptions = {
  trim?: boolean;
  pre?: boolean;
  pageMap?: Map<string, string>;
  removeLastBr?: boolean;
};

export abstract class DeltaASTConverter<
  TextAttributes extends BaseTextAttributes = BaseTextAttributes,
  AST = unknown,
> {
  /**
   * Convert AST format to delta format
   */
  abstract astToDelta(
    ast: AST,
    options?: unknown
  ): DeltaInsert<TextAttributes>[];

  /**
   * Convert delta format to AST format
   */
  abstract deltaToAST(
    deltas: DeltaInsert<TextAttributes>[],
    options?: unknown
  ): AST[];
}

export type InlineDeltaMatcher<TNode extends object = never> = {
  name: keyof AffineTextAttributes | string;
  match: (delta: DeltaInsert<AffineTextAttributes>) => boolean;
  toAST: (
    delta: DeltaInsert<AffineTextAttributes>,
    context: {
      configs: Map<string, string>;
      current: TNode;
    },
    provider?: ServiceProvider
  ) => TNode;
};

export type ASTToDeltaMatcher<AST> = {
  name: string;
  match: (ast: AST) => boolean;
  toDelta: (
    ast: AST,
    context: {
      configs: Map<string, string>;
      options: DeltaASTConverterOptions;
      toDelta: (
        ast: AST,
        options?: DeltaASTConverterOptions
      ) => DeltaInsert<AffineTextAttributes>[];
      htmlToDelta?: (html: string) => DeltaInsert<AffineTextAttributes>[];
    }
  ) => DeltaInsert<AffineTextAttributes>[];
};
