import {
  HastUtils,
  type HtmlAST,
  NotionHtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import type { ExtensionType } from '@blocksuite/store';
import { collapseWhiteSpace } from 'collapse-white-space';
import type { Element, Text } from 'hast';

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

const isText = (ast: HtmlAST): ast is Text => {
  return ast.type === 'text';
};

const listElementTags = new Set(['ol', 'ul']);
const strongElementTags = new Set(['strong', 'b']);
const italicElementTags = new Set(['i', 'em']);

const NotionInlineEquationToken = 'notion-text-equation-token';
const NotionUnderlineStyleToken = 'border-bottom:0.05em solid';

export const notionHtmlTextToDeltaMatcher = NotionHtmlASTToDeltaExtension({
  name: 'text',
  match: ast => isText(ast),
  toDelta: (ast, context) => {
    if (!isText(ast)) {
      return [];
    }
    const { options } = context;
    options.trim ??= true;
    if (options.pre || ast.value === ' ') {
      return [{ insert: ast.value }];
    }
    if (options.trim) {
      const value = collapseWhiteSpace(ast.value, { trim: options.trim });
      if (value) {
        return [{ insert: value }];
      }
      return [];
    }
    if (ast.value) {
      return [{ insert: collapseWhiteSpace(ast.value) }];
    }
    return [];
  },
});

export const notionHtmlSpanElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'span-element',
    match: ast => isElement(ast) && ast.tagName === 'span',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }

      const { toDelta, options } = context;
      if (
        Array.isArray(ast.properties?.className) &&
        ast.properties?.className.includes(NotionInlineEquationToken)
      ) {
        const latex = HastUtils.getTextContent(
          HastUtils.querySelector(ast, 'annotation')
        );
        return [{ insert: ' ', attributes: { latex } }];
      }

      // Add underline style detection
      if (
        typeof ast.properties?.style === 'string' &&
        ast.properties?.style?.includes(NotionUnderlineStyleToken)
      ) {
        return ast.children.flatMap(child =>
          context.toDelta(child, options).map(delta => {
            delta.attributes = { ...delta.attributes, underline: true };
            return delta;
          })
        );
      }

      return ast.children.flatMap(child => toDelta(child, options));
    },
  });

export const notionHtmlListToDeltaMatcher = NotionHtmlASTToDeltaExtension({
  name: 'list-element',
  match: ast => isElement(ast) && listElementTags.has(ast.tagName),
  toDelta: () => {
    return [];
  },
});

export const notionHtmlStrongElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'strong-element',
    match: ast => isElement(ast) && strongElementTags.has(ast.tagName),
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }

      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes, bold: true };
          return delta;
        })
      );
    },
  });

export const notionHtmlItalicElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'italic-element',
    match: ast => isElement(ast) && italicElementTags.has(ast.tagName),
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes, italic: true };
          return delta;
        })
      );
    },
  });

export const notionHtmlCodeElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'code-element',
    match: ast => isElement(ast) && ast.tagName === 'code',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes, code: true };
          return delta;
        })
      );
    },
  });

export const notionHtmlDelElementToDeltaMatcher = NotionHtmlASTToDeltaExtension(
  {
    name: 'del-element',
    match: ast => isElement(ast) && ast.tagName === 'del',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes, strike: true };
          return delta;
        })
      );
    },
  }
);

export const notionHtmlUnderlineElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'underline-element',
    match: ast => isElement(ast) && ast.tagName === 'u',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes, underline: true };
          return delta;
        })
      );
    },
  });

export const notionHtmlMarkElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'mark-element',
    match: ast => isElement(ast) && ast.tagName === 'mark',
    toDelta: (ast, context) => {
      if (!isElement(ast)) {
        return [];
      }
      const { toDelta, options } = context;
      return ast.children.flatMap(child =>
        toDelta(child, options).map(delta => {
          delta.attributes = { ...delta.attributes };
          return delta;
        })
      );
    },
  });

export const notionHtmlLiElementToDeltaMatcher = NotionHtmlASTToDeltaExtension({
  name: 'li-element',
  match: ast =>
    isElement(ast) &&
    ast.tagName === 'li' &&
    !!HastUtils.querySelector(ast, '.checkbox'),
  toDelta: (ast, context) => {
    if (!isElement(ast) || !HastUtils.querySelector(ast, '.checkbox')) {
      return [];
    }
    const { toDelta, options } = context;
    // Should ignore the children of to do list which is the checkbox and the space following it
    const checkBox = HastUtils.querySelector(ast, '.checkbox');
    const checkBoxIndex = ast.children.findIndex(child => child === checkBox);
    return ast.children
      .slice(checkBoxIndex + 2)
      .flatMap(child => toDelta(child, options));
  },
});

export const notionHtmlBrElementToDeltaMatcher = NotionHtmlASTToDeltaExtension({
  name: 'br-element',
  match: ast => isElement(ast) && ast.tagName === 'br',
  toDelta: () => {
    return [{ insert: '\n' }];
  },
});

export const notionHtmlStyleElementToDeltaMatcher =
  NotionHtmlASTToDeltaExtension({
    name: 'style-element',
    match: ast => isElement(ast) && ast.tagName === 'style',
    toDelta: () => {
      return [];
    },
  });

export const NotionHtmlInlineToDeltaAdapterExtensions: ExtensionType[] = [
  notionHtmlTextToDeltaMatcher,
  notionHtmlSpanElementToDeltaMatcher,
  notionHtmlStrongElementToDeltaMatcher,
  notionHtmlItalicElementToDeltaMatcher,
  notionHtmlCodeElementToDeltaMatcher,
  notionHtmlDelElementToDeltaMatcher,
  notionHtmlUnderlineElementToDeltaMatcher,
  notionHtmlMarkElementToDeltaMatcher,
  notionHtmlListToDeltaMatcher,
  notionHtmlLiElementToDeltaMatcher,
  notionHtmlBrElementToDeltaMatcher,
  notionHtmlStyleElementToDeltaMatcher,
];
