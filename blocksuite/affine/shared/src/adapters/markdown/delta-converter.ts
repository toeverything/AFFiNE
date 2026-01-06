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
  rehypeInlineToBlock,
  rehypeWrapInlineElements,
} from '../html/rehype-plugins/index.js';
import {
  type ASTToDeltaMatcher,
  DeltaASTConverter,
  type InlineDeltaMatcher,
} from '../types/delta-converter.js';
import type { MarkdownAST } from './type.js';

const INLINE_HTML_TAGS = new Set([
  'span',
  'strong',
  'b',
  'em',
  'i',
  'del',
  'u',
  'mark',
  'code',
  'ins',
  'bdi',
  'bdo',
]);

const VOID_HTML_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const ALLOWED_INLINE_HTML_TAGS = new Set([
  ...INLINE_HTML_TAGS,
  ...VOID_HTML_TAGS,
]);

const isHtmlNode = (
  node: MarkdownAST
): node is MarkdownAST & { type: 'html'; value: string } =>
  node.type === 'html' && 'value' in node && typeof node.value === 'string';

const isTextNode = (
  node: MarkdownAST
): node is MarkdownAST & { type: 'text'; value: string } =>
  node.type === 'text' && 'value' in node && typeof node.value === 'string';

type HtmlTagInfo =
  | { name: string; kind: 'open' | 'self' }
  | { name: string; kind: 'close' };

const getHtmlTagInfo = (value: string): HtmlTagInfo | null => {
  const closingMatch = value.match(/^<\/([A-Za-z][A-Za-z0-9-]*)\s*>$/);
  if (closingMatch) {
    return {
      name: closingMatch[1].toLowerCase(),
      kind: 'close',
    };
  }

  const selfClosingMatch = value.match(
    /^<([A-Za-z][A-Za-z0-9-]*)(\s[^>]*)?\/>$/i
  );
  if (selfClosingMatch) {
    return {
      name: selfClosingMatch[1].toLowerCase(),
      kind: 'self',
    };
  }

  const openingMatch = value.match(/^<([A-Za-z][A-Za-z0-9-]*)(\s[^>]*)?>$/);
  if (openingMatch) {
    const name = openingMatch[1].toLowerCase();
    return {
      name,
      kind: VOID_HTML_TAGS.has(name) ? 'self' : 'open',
    };
  }

  return null;
};

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
      const processor = unified()
        .use(rehypeParse, { fragment: true })
        .use(rehypeInlineToBlock)
        .use(rehypeWrapInlineElements);
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

  private _mergeInlineHtml(
    children: MarkdownAST[],
    startIndex: number
  ): {
    endIndex: number;
    deltas: DeltaInsert<AffineTextAttributes>[];
  } | null {
    const startNode = children[startIndex];
    if (!isHtmlNode(startNode)) {
      return null;
    }
    const startTag = getHtmlTagInfo(startNode.value);
    if (
      !startTag ||
      startTag.kind !== 'open' ||
      !INLINE_HTML_TAGS.has(startTag.name)
    ) {
      return null;
    }

    const stack = [startTag.name];
    let html = startNode.value;
    let endIndex = startIndex;

    for (let i = startIndex + 1; i < children.length; i++) {
      const node = children[i];
      if (isHtmlNode(node)) {
        const info = getHtmlTagInfo(node.value);
        if (!info) {
          html += node.value;
          continue;
        }

        if (info.kind === 'open') {
          if (!ALLOWED_INLINE_HTML_TAGS.has(info.name)) {
            return null;
          }
          stack.push(info.name);
          html += node.value;
          continue;
        }

        if (info.kind === 'self') {
          if (!ALLOWED_INLINE_HTML_TAGS.has(info.name)) {
            return null;
          }
          html += node.value;
          continue;
        }

        if (!ALLOWED_INLINE_HTML_TAGS.has(info.name)) {
          return null;
        }
        const last = stack[stack.length - 1];
        if (last !== info.name) {
          return null;
        }
        stack.pop();

        html += node.value;
        endIndex = i;
        if (stack.length === 0) {
          return {
            endIndex,
            deltas: this._convertHtmlToDelta(html),
          };
        }
        continue;
      }

      if (isTextNode(node)) {
        html += node.value;
        continue;
      }

      return null;
    }

    return null;
  }

  private _astChildrenToDelta(
    children: MarkdownAST[]
  ): DeltaInsert<AffineTextAttributes>[] {
    const deltas: DeltaInsert<AffineTextAttributes>[] = [];
    for (let i = 0; i < children.length; i++) {
      const merged = this._mergeInlineHtml(children, i);
      if (merged) {
        deltas.push(...merged.deltas);
        i = merged.endIndex;
        continue;
      }

      deltas.push(...this.astToDelta(children[i]));
    }
    return deltas;
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
      ? this._astChildrenToDelta(ast.children as MarkdownAST[])
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
