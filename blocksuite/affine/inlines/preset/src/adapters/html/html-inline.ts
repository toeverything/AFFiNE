import { htmlLinkElementToDeltaMatcher } from '@blocksuite/affine-inline-link';
import {
  type HtmlAST,
  HtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import { collapseWhiteSpace } from 'collapse-white-space';
import type { Element } from 'hast';

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

const textLikeElementTags = new Set(['span', 'bdi', 'bdo', 'ins']);
const listElementTags = new Set(['ol', 'ul']);
const strongElementTags = new Set(['strong', 'b']);
const italicElementTags = new Set(['i', 'em']);

export const htmlTextToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'text',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    if (!('value' in ast)) {
      return [];
    }
    const { options } = context;
    options.trim ??= true;

    if (options.pre) {
      return [{ insert: ast.value }];
    }

    const value = options.trim
      ? collapseWhiteSpace(ast.value, { trim: options.trim })
      : collapseWhiteSpace(ast.value);
    return value ? [{ insert: value }] : [];
  },
});

export const htmlTextLikeElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'text-like-element',
  match: ast => isElement(ast) && textLikeElementTags.has(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false })
    );
  },
});

export const htmlListToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'list-element',
  match: ast => isElement(ast) && listElementTags.has(ast.tagName),
  toDelta: () => {
    return [];
  },
});

export const htmlStrongElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'strong-element',
  match: ast => isElement(ast) && strongElementTags.has(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, bold: true };
        return delta;
      })
    );
  },
});

export const htmlItalicElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'italic-element',
  match: ast => isElement(ast) && italicElementTags.has(ast.tagName),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, italic: true };
        return delta;
      })
    );
  },
});

export const htmlCodeElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'code-element',
  match: ast => isElement(ast) && ast.tagName === 'code',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, code: true };
        return delta;
      })
    );
  },
});

export const htmlDelElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'del-element',
  match: ast => isElement(ast) && ast.tagName === 'del',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, strike: true };
        return delta;
      })
    );
  },
});

export const htmlUnderlineElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'underline-element',
  match: ast => isElement(ast) && ast.tagName === 'u',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes, underline: true };
        return delta;
      })
    );
  },
});

export const htmlMarkElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'mark-element',
  match: ast => isElement(ast) && ast.tagName === 'mark',
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    return ast.children.flatMap(child =>
      context.toDelta(child, { trim: false }).map(delta => {
        delta.attributes = { ...delta.attributes };
        return delta;
      })
    );
  },
});

export const htmlBrElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'br-element',
  match: ast => isElement(ast) && ast.tagName === 'br',
  toDelta: () => {
    return [{ insert: '\n' }];
  },
});

export const HtmlInlineToDeltaAdapterExtensions = [
  htmlTextToDeltaMatcher,
  htmlTextLikeElementToDeltaMatcher,
  htmlStrongElementToDeltaMatcher,
  htmlItalicElementToDeltaMatcher,
  htmlCodeElementToDeltaMatcher,
  htmlDelElementToDeltaMatcher,
  htmlUnderlineElementToDeltaMatcher,
  htmlLinkElementToDeltaMatcher,
  htmlMarkElementToDeltaMatcher,
  htmlBrElementToDeltaMatcher,
];
