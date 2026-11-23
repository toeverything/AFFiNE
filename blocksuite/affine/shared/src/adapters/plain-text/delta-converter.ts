import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type { DeltaInsert, ExtensionType } from '@blocksuite/store';

import type { AffineTextAttributes } from '../../types/index.js';
import type { TextBuffer } from '../types/adapter.js';
import {
  type ASTToDeltaMatcher,
  DeltaASTConverter,
  type InlineDeltaMatcher,
} from '../types/delta-converter.js';

export type InlineDeltaToPlainTextAdapterMatcher =
  InlineDeltaMatcher<TextBuffer>;

export const InlineDeltaToPlainTextAdapterMatcherIdentifier =
  createIdentifier<InlineDeltaToPlainTextAdapterMatcher>(
    'InlineDeltaToPlainTextAdapterMatcher'
  );

export function InlineDeltaToPlainTextAdapterExtension(
  matcher: InlineDeltaToPlainTextAdapterMatcher
): ExtensionType & {
  identifier: ServiceIdentifier<InlineDeltaToPlainTextAdapterMatcher>;
} {
  const identifier = InlineDeltaToPlainTextAdapterMatcherIdentifier(
    matcher.name
  );
  return {
    setup: di => {
      di.addImpl(identifier, () => matcher);
    },
    identifier,
  };
}

export type PlainTextASTToDeltaMatcher = ASTToDeltaMatcher<string>;

export class PlainTextDeltaConverter extends DeltaASTConverter<
  AffineTextAttributes,
  string
> {
  constructor(
    readonly configs: Map<string, string>,
    readonly inlineDeltaMatchers: InlineDeltaToPlainTextAdapterMatcher[],
    readonly plainTextASTToDeltaMatchers: PlainTextASTToDeltaMatcher[]
  ) {
    super();
  }

  astToDelta(ast: string) {
    const context = {
      configs: this.configs,
      options: Object.create(null),
      toDelta: (ast: string) => this.astToDelta(ast),
    };
    for (const matcher of this.plainTextASTToDeltaMatchers) {
      if (matcher.match(ast)) {
        return matcher.toDelta(ast, context);
      }
    }
    return [];
  }

  deltaToAST(deltas: DeltaInsert<AffineTextAttributes>[]): string[] {
    return deltas.map(delta => {
      const context = {
        configs: this.configs,
        current: { content: delta.insert },
      };
      for (const matcher of this.inlineDeltaMatchers) {
        if (matcher.match(delta)) {
          context.current = matcher.toAST(delta, context);
        }
      }
      return context.current.content;
    });
  }
}
