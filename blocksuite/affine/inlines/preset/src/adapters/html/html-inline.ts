import { parseStringToRgba } from '@blocksuite/affine-components/color-picker';
import {
  type HtmlAST,
  HtmlASTToDeltaExtension,
} from '@blocksuite/affine-shared/adapters';
import { cssVarV2, darkThemeV2, lightThemeV2 } from '@toeverything/theme/v2';
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

type Rgb = { r: number; g: number; b: number };

const COLOR_DISTANCE_THRESHOLD = 90;
const supportedTextColorNames = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'blue',
  'purple',
  'grey',
] as const;

const supportedTextColors = supportedTextColorNames.map(name => ({
  name,
  cssVar: cssVarV2(`text/highlight/fg/${name}`),
  light: lightThemeV2[`text/highlight/fg/${name}`],
  dark: darkThemeV2[`text/highlight/fg/${name}`],
}));

const hexToRgb = (value: string): Rgb | null => {
  const hex = value.replace('#', '');
  if (![3, 4, 6, 8].includes(hex.length)) {
    return null;
  }
  const normalized =
    hex.length === 3 || hex.length === 4
      ? hex
          .slice(0, 3)
          .split('')
          .map(c => c + c)
          .join('')
      : hex.slice(0, 6);
  const intVal = Number.parseInt(normalized, 16);
  if (Number.isNaN(intVal)) {
    return null;
  }
  return {
    r: (intVal >> 16) & 255,
    g: (intVal >> 8) & 255,
    b: intVal & 255,
  };
};

const parseCssColor = (value: string): Rgb | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('#')) {
    return hexToRgb(trimmed);
  }
  if (/^rgba?\(/i.test(trimmed)) {
    const rgba = parseStringToRgba(trimmed);
    return {
      r: Math.round(rgba.r * 255),
      g: Math.round(rgba.g * 255),
      b: Math.round(rgba.b * 255),
    };
  }
  return null;
};

const colorDistance = (a: Rgb, b: Rgb) => {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const resolveNearestSupportedColor = (color: string): string | null => {
  const target = parseCssColor(color);
  if (!target) {
    return null;
  }
  let nearest:
    | {
        cssVar: string;
        distance: number;
      }
    | undefined;

  for (const supported of supportedTextColors) {
    const light = parseCssColor(supported.light);
    const dark = parseCssColor(supported.dark);
    for (const ref of [light, dark]) {
      if (!ref) continue;
      const distance = colorDistance(target, ref);
      if (!nearest || distance < nearest.distance) {
        nearest = { cssVar: supported.cssVar, distance };
      }
    }
  }

  if (nearest && nearest.distance <= COLOR_DISTANCE_THRESHOLD) {
    return nearest.cssVar;
  }
  return null;
};

const extractColorFromStyle = (style: string | undefined): string | null => {
  if (typeof style !== 'string') {
    return null;
  }
  const declarations = style.split(';');
  for (const declaration of declarations) {
    const [rawKey, rawValue] = declaration.split(':');
    if (!rawKey || !rawValue) continue;
    if (rawKey.trim().toLowerCase() === 'color') {
      return rawValue.trim();
    }
  }
  return null;
};

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

export const htmlColorStyleElementToDeltaMatcher = HtmlASTToDeltaExtension({
  name: 'color-style-element',
  match: ast =>
    isElement(ast) &&
    ast.tagName === 'span' &&
    typeof ast.properties?.style === 'string' &&
    /color\s*:/i.test(ast.properties.style),
  toDelta: (ast, context) => {
    if (!isElement(ast)) {
      return [];
    }
    const baseOptions = { ...context.options, trim: false };
    // In preformatted contexts (e.g. code blocks) we don't keep inline colors.
    if (baseOptions.pre) {
      return ast.children.flatMap(child => context.toDelta(child, baseOptions));
    }
    const colorValue = extractColorFromStyle(
      typeof ast.properties?.style === 'string' ? ast.properties.style : ''
    );
    const mappedColor = colorValue
      ? resolveNearestSupportedColor(colorValue)
      : null;
    const deltas = ast.children.flatMap(child =>
      context.toDelta(child, baseOptions).map(delta => {
        if (mappedColor) {
          delta.attributes = { ...delta.attributes, color: mappedColor };
        }
        return delta;
      })
    );
    return deltas;
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
  htmlColorStyleElementToDeltaMatcher,
  htmlTextLikeElementToDeltaMatcher,
  htmlStrongElementToDeltaMatcher,
  htmlItalicElementToDeltaMatcher,
  htmlCodeElementToDeltaMatcher,
  htmlDelElementToDeltaMatcher,
  htmlUnderlineElementToDeltaMatcher,
  htmlMarkElementToDeltaMatcher,
  htmlBrElementToDeltaMatcher,
];
