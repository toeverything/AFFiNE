import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type { DeltaInsert, ExtensionType } from '@blocksuite/store';
import type { PhrasingContent } from 'mdast';

import type { AffineTextAttributes } from '../../types/index.js';
import {
  type ASTToDeltaMatcher,
  DeltaASTConverter,
  type InlineDeltaMatcher,
} from '../types/delta-converter.js';
import type { MarkdownAST } from './type.js';

export type InlineDeltaToMarkdownAdapterMatcher =
  InlineDeltaMatcher<PhrasingContent>;

export const InlineDeltaToMarkdownAdapterMatcherIdentifier =
  createIdentifier<InlineDeltaToMarkdownAdapterMatcher>(
    'InlineDeltaToMarkdownAdapterMatcher'
  );

export function InlineDeltaToMarkdownAdapterExtension(
  matcher: InlineDeltaToMarkdownAdapterMatcher
): ExtensionType & {
  identifier: ServiceIdentifier<InlineDeltaToMarkdownAdapterMatcher>;
} {
  const identifier = InlineDeltaToMarkdownAdapterMatcherIdentifier(
    matcher.name
  );
  return {
    setup: di => {
      di.addImpl(identifier, () => matcher);
    },
    identifier,
  };
}

export type MarkdownASTToDeltaMatcher = ASTToDeltaMatcher<MarkdownAST>;

export const MarkdownASTToDeltaMatcherIdentifier =
  createIdentifier<MarkdownASTToDeltaMatcher>('MarkdownASTToDeltaMatcher');

export function MarkdownASTToDeltaExtension(
  matcher: MarkdownASTToDeltaMatcher
): ExtensionType & {
  identifier: ServiceIdentifier<MarkdownASTToDeltaMatcher>;
} {
  const identifier = MarkdownASTToDeltaMatcherIdentifier(matcher.name);
  return {
    setup: di => {
      di.addImpl(identifier, () => matcher);
    },
    identifier,
  };
}

export class MarkdownDeltaConverter extends DeltaASTConverter<
  AffineTextAttributes,
  MarkdownAST
> {
  constructor(
    readonly configs: Map<string, string>,
    readonly inlineDeltaMatchers: InlineDeltaToMarkdownAdapterMatcher[],
    readonly markdownASTToDeltaMatchers: MarkdownASTToDeltaMatcher[]
  ) {
    super();
  }

  applyTextFormatting(
    delta: DeltaInsert<AffineTextAttributes>
  ): PhrasingContent {
    let mdast: PhrasingContent = {
      type: 'text',
      value: delta.attributes?.underline
        ? `<u>${delta.insert}</u>`
        : delta.insert,
    };

    const context: {
      configs: Map<string, string>;
      current: PhrasingContent;
    } = {
      configs: this.configs,
      current: mdast,
    };
    for (const matcher of this.inlineDeltaMatchers) {
      if (matcher.match(delta)) {
        mdast = matcher.toAST(delta, context);
        context.current = mdast;
      }
    }

    return mdast;
  }

  astToDelta(ast: MarkdownAST): DeltaInsert<AffineTextAttributes>[] {
    const context = {
      configs: this.configs,
      options: Object.create(null),
      toDelta: (ast: MarkdownAST) => this.astToDelta(ast),
    };
    for (const matcher of this.markdownASTToDeltaMatchers) {
      if (matcher.match(ast)) {
        return matcher.toDelta(ast, context);
      }
    }
    return 'children' in ast
      ? ast.children.flatMap(child => this.astToDelta(child))
      : [];
  }

  deltaToAST(
    deltas: DeltaInsert<AffineTextAttributes>[],
    depth = 0
  ): PhrasingContent[] {
    if (depth > 0) {
      deltas.unshift({ insert: ' '.repeat(4).repeat(depth) });
    }

    return deltas.map(delta => this.applyTextFormatting(delta));
  }
}
