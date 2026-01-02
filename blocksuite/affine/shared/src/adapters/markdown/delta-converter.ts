import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type { DeltaInsert, ExtensionType } from '@blocksuite/store';
import type { Root } from 'hast';
import type { PhrasingContent } from 'mdast';
import rehypeParse from 'rehype-parse';
import { unified } from 'unified';

import type { AffineTextAttributes } from '../../types/index.js';
import { HtmlDeltaConverter } from '../html/delta-converter.js';
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
    readonly markdownASTToDeltaMatchers: MarkdownASTToDeltaMatcher[],
    readonly htmlDeltaConverter?: HtmlDeltaConverter
  ) {
    super();
  }

  private _convertHtmlToDelta(
    html: string
  ): DeltaInsert<AffineTextAttributes>[] {
    if (!this.htmlDeltaConverter) {
      return [{ insert: html }];
    }
    try {
      const processor = unified().use(rehypeParse, { fragment: true });
      const ast = processor.runSync(processor.parse(html)) as Root;
      return this.htmlDeltaConverter.astToDelta(ast, { trim: false });
    } catch {
      return [{ insert: html }];
    }
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
      htmlToDelta: (html: string) => this._convertHtmlToDelta(html),
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
