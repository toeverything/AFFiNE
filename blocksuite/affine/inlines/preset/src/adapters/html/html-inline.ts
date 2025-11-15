import {
  type HtmlAST,
  HtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import { collapseWhiteSpace } from 'collapse-white-space';
import type { Element } from 'hast';

/**
 * Handle empty text nodes created by HTML parser for styling purposes.
 * These nodes typically contain only whitespace/newlines, for example:
 * ```json
 * {
 *   "type": "text",
 *   "value": "\n\n  \n  \n  "
 * }
 * ```
 * We collapse and trim the whitespace to check if the node is truly empty,
 * and return an empty array in that case.
 */
const isEmptyText = (ast: HtmlAST): boolean => {
  return (
    ast.type === 'text' && collapseWhiteSpace(ast.value, { trim: true }) === ''
  );
};

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

const textLikeElementTags = new Set(['span', 'bdi', 'bdo', 'ins']);
const listElementTags = new Set(['ol', 'ul']);
const strongElementTags = new Set(['strong', 'b']);
const italicElementTags = new Set(['i', 'em']);

/**
 * Check if the element is a strong element through style or tag
 * If the element tag is <strong>, <b> or the style is `font-weight: bold;`, or the font-weight is 500 or above,
 * we consider it as a strong element
 * @param ast - The HTML AST node to check
 * @returns `true` if the element is a strong element, `false` otherwise
 * @example
 * ```html
 * <strong>Hello</strong>
 * <b>Hello</b>
 * <span style="font-weight: bold;">Hello</span>
 * <span style="font-weight: 700;">Hello</span>
 * ```
 */
const isStrongElement = (ast: HtmlAST) => {
  if (!isElement(ast)) {
    return false;
  }
  const style =
    typeof ast.properties.style === 'string' ? ast.properties.style : '';

  const isStrongTag = strongElementTags.has(ast.tagName);
  // Should exclude the case like <b style="font-weight: normal;">
  const isNotNormalFontWeight = !/font-weight:\s*normal/.test(style);
  const isBoldFontWeight = /font-weight:\s*(([5-9]\d{2})|bold)/.test(style);
  return (isStrongTag && isNotNormalFontWeight) || isBoldFontWeight;
};

/**
 * Check if the element is an italic element through style or tag
 * If the element tag is <i>, <em> or the style is `font-style: italic;`,
 * we consider it as an italic element
 * @param ast - The HTML AST node to check
 * @returns `true` if the element is an italic element, `false` otherwise
 * @example
 * ```html
 * <i>Hello</i>
 * <em>Hello</em>
 * <span style="font-style: italic;">Hello</span>
 * ```
 */
const isItalicElement = (ast: HtmlAST) => {
  if (!isElement(ast)) {
    return false;
  }
  const style =
    typeof ast.properties.style === 'string' ? ast.properties.style : '';
  const isItalicTag = italicElementTags.has(ast.tagName);
  const isItalicStyle = /font-style:\s*italic/.test(style);
  return isItalicTag || isItalicStyle;
};

/**
 * Check if the element is an underline element through style or tag
 * If the element tag is <u> or the style is `text-decoration: underline;`,
 * we consider it as an underline element
 * @param ast - The HTML AST node to check
 * @returns `true` if the element is an underline element, `false` otherwise
 * @example
 * ```html
 * <u>Hello</u>
 * <span style="text-decoration: underline;">Hello</span>
 * ```
 */
const isUnderlineElement = (ast: HtmlAST) => {
  if (!isElement(ast)) {
    return false;
  }
  const style =
    typeof ast.properties.style === 'string' ? ast.properties.style : '';
  const isUnderlineTag = ast.tagName === 'u';
  const isUnderlineStyle = /text-decoration:\s*underline/.test(style);
  return isUnderlineTag || isUnderlineStyle;
};

/**
 * Check if the element is a line-through element through style or tag
 * If the element tag is <del> or the style is `text-decoration: line-through;`,
 * we consider it as a line-through element
 * @param ast - The HTML AST node to check
 * @returns `true` if the element is a line-through element, `false` otherwise
 * @example
 * ```html
 * <del>Hello</del>
 * <span style="text-decoration: line-through;">Hello</span>
 * ```
 */
const isLineThroughElement = (ast: HtmlAST) => {
  if (!isElement(ast)) {
    return false;
  }
  const style =
    typeof ast.properties.style === 'string' ? ast.properties.style : '';
  const isLineThroughTag = ast.tagName === 'del';
  const isLineThroughStyle = /text-decoration:\s*line-through/.test(style);
  return isLineThroughTag || isLineThroughStyle;
};

/**
 * Handle the case like <span>Hello</span>
 * @param ast
 * @returns
 */
const isTextLikeElement = (ast: HtmlAST) => {
  if (!isElement(ast)) {
    return false;
  }
  return (
    textLikeElementTags.has(ast.tagName) &&
    !isStrongElement(ast) &&
    !isItalicElement(ast) &&
    !isUnderlineElement(ast) &&
    !isLineThroughElement(ast)
  );
};

export const htmlTextToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'text',
  match: ast => ast.type === 'text',
  toDelta: (ast, context) => {
    if (!('value' in ast)) {
      return [];
    }
    const { options } = context;
    options.trim ??= false;

    if (options.pre) {
      return [{ insert: ast.value }];
    }

    if (isEmptyText(ast)) {
      return [];
    }

    const value = options.trim
      ? collapseWhiteSpace(ast.value, { trim: options.trim })
      : collapseWhiteSpace(ast.value);
    return value ? [{ insert: value }] : [];
  },
});

export const htmlTextLikeElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'text-like-element',
  match: ast => isTextLikeElement(ast),
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
  match: ast => isStrongElement(ast),
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
  match: ast => isItalicElement(ast),
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
  match: ast => isLineThroughElement(ast),
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
  match: ast => isUnderlineElement(ast),
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
  htmlMarkElementToDeltaMatcher,
  htmlBrElementToDeltaMatcher,
];
