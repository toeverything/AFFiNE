import {
  createIdentifier,
  type ServiceIdentifier,
} from '@blocksuite/global/di';
import type { DeltaInsert, ExtensionType } from '@blocksuite/store';
import isEqual from 'lodash-es/isEqual';

import type { AffineTextAttributes } from '../../types/index.js';
import {
  type ASTToDeltaMatcher,
  DeltaASTConverter,
  type DeltaASTConverterOptions,
  type InlineDeltaMatcher,
} from '../types/delta-converter.js';
import type { HtmlAST, InlineHtmlAST } from '../types/hast.js';

export type InlineDeltaToNotionHtmlAdapterMatcher =
  InlineDeltaMatcher<InlineHtmlAST>;

export type NotionHtmlASTToDeltaMatcher = ASTToDeltaMatcher<HtmlAST>;

export const NotionHtmlASTToDeltaMatcherIdentifier =
  createIdentifier<NotionHtmlASTToDeltaMatcher>('NotionHtmlASTToDeltaMatcher');

export function NotionHtmlASTToDeltaExtension(
  matcher: NotionHtmlASTToDeltaMatcher
): ExtensionType & {
  identifier: ServiceIdentifier<NotionHtmlASTToDeltaMatcher>;
} {
  const identifier = NotionHtmlASTToDeltaMatcherIdentifier(matcher.name);
  return {
    setup: di => {
      di.addImpl(identifier, () => matcher);
    },
    identifier,
  };
}

export class NotionHtmlDeltaConverter extends DeltaASTConverter<
  AffineTextAttributes,
  HtmlAST
> {
  constructor(
    readonly configs: Map<string, string>,
    readonly inlineDeltaMatchers: InlineDeltaToNotionHtmlAdapterMatcher[],
    readonly htmlASTToDeltaMatchers: NotionHtmlASTToDeltaMatcher[]
  ) {
    super();
  }

  private _spreadAstToDelta(
    ast: HtmlAST,
    options: DeltaASTConverterOptions = Object.create(null)
  ): DeltaInsert<AffineTextAttributes>[] {
    const context = {
      configs: this.configs,
      options,
      toDelta: (ast: HtmlAST, options?: DeltaASTConverterOptions) =>
        this._spreadAstToDelta(ast, options),
    };
    for (const matcher of this.htmlASTToDeltaMatchers) {
      if (matcher.match(ast)) {
        return matcher.toDelta(ast, context);
      }
    }

    const result =
      'children' in ast
        ? ast.children.flatMap(child => this._spreadAstToDelta(child, options))
        : [];

    if (options.removeLastBr && result.length > 0) {
      const lastItem = result[result.length - 1];
      if (lastItem.insert === '\n') {
        result.pop();
      }
    }
    return result;
  }

  astToDelta(
    ast: HtmlAST,
    options: DeltaASTConverterOptions = Object.create(null)
  ): DeltaInsert<AffineTextAttributes>[] {
    return this._spreadAstToDelta(ast, options).reduce((acc, cur) => {
      if (acc.length === 0) {
        return [cur];
      }
      const last = acc[acc.length - 1];
      if (
        typeof last.insert === 'string' &&
        typeof cur.insert === 'string' &&
        isEqual(last.attributes, cur.attributes)
      ) {
        last.insert += cur.insert;
        return acc;
      }
      return [...acc, cur];
    }, [] as DeltaInsert<AffineTextAttributes>[]);
  }

  deltaToAST(_: DeltaInsert<AffineTextAttributes>[]): InlineHtmlAST[] {
    return [];
  }
}
