import type { Element, ElementContent, Text } from 'hast';

import type { HtmlAST } from '../types/hast.js';

// Block elements that html adapter supports
const blockElements = [
  'div',
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
];

const blockElementsSet = new Set(blockElements);

// Phrasing content
const inlineElements = [
  'a',
  'abbr',
  'audio',
  'b',
  'bdi',
  'bdo',
  'br',
  'button',
  'canvas',
  'cite',
  'code',
  'data',
  'datalist',
  'del',
  'dfn',
  'em',
  'embed',
  'i',
  // 'iframe' is not included because it needs special handling
  // 'img' is not included because it needs special handling
  'input',
  'ins',
  'kbd',
  'label',
  'link',
  'map',
  'mark',
  'math',
  'meta',
  'meter',
  'noscript',
  'object',
  'output',
  'picture',
  'progress',
  'q',
  'ruby',
  's',
  'samp',
  'script',
  'select',
  'slot',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'svg',
  'template',
  'textarea',
  'time',
  'u',
  'var',
  'video',
  'wbr',
];

const inlineElementsSet = new Set(inlineElements);

const isElement = (ast: HtmlAST): ast is Element => {
  return ast.type === 'element';
};

const getTextContent = (ast: HtmlAST | undefined, defaultStr = ''): string => {
  if (!ast) {
    return defaultStr;
  }
  switch (ast.type) {
    case 'text': {
      return ast.value.replace(/\s+/g, ' ');
    }
    case 'element': {
      switch (ast.tagName) {
        case 'br': {
          return '\n';
        }
      }
      return ast.children.map(child => getTextContent(child)).join('');
    }
  }
  return defaultStr;
};

const getElementChildren = (ast: HtmlAST | undefined): Element[] => {
  if (!ast) {
    return [];
  }
  if (ast.type === 'element') {
    return ast.children.filter(child => child.type === 'element') as Element[];
  }
  return [];
};

const getTextChildren = (ast: HtmlAST | undefined): Text[] => {
  if (!ast) {
    return [];
  }
  if (ast.type === 'element') {
    return ast.children.filter(child => child.type === 'text') as Text[];
  }
  return [];
};

const getTextChildrenOnlyAst = (ast: Element): Element => {
  return {
    ...ast,
    children: getTextChildren(ast),
  };
};

const isTagBlock = (tagName: string): boolean => {
  return blockElementsSet.has(tagName);
};

const isTagInline = (tagName: string): boolean => {
  return inlineElementsSet.has(tagName);
};

const isElementInline = (element: Element): boolean => {
  return (
    isTagInline(element.tagName) ||
    // Inline elements
    !!(
      typeof element.properties?.style === 'string' &&
      element.properties.style.match(/display:\s*inline/)
    )
  );
};

const getInlineElementsAndText = (ast: Element): (Element | Text)[] => {
  if (!ast || !ast.children) {
    return [];
  }

  return ast.children.filter((child): child is Element | Text => {
    if (child.type === 'text') {
      return true;
    }
    if (child.type === 'element' && child.tagName && isElementInline(child)) {
      return true;
    }
    return false;
  });
};

const getInlineOnlyElementAST = (ast: Element): Element => {
  return {
    ...ast,
    children: getInlineElementsAndText(ast),
  };
};

const querySelectorTag = (
  ast: HtmlAST,
  tagName: string
): Element | undefined => {
  if (ast.type === 'element') {
    if (ast.tagName === tagName) {
      return ast;
    }
    for (const child of ast.children) {
      const result = querySelectorTag(child, tagName);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const querySelectorClass = (
  ast: HtmlAST,
  className: string
): Element | undefined => {
  if (ast.type === 'element') {
    if (
      Array.isArray(ast.properties?.className) &&
      ast.properties.className.includes(className)
    ) {
      return ast;
    }
    for (const child of ast.children) {
      const result = querySelectorClass(child, className);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const querySelectorId = (ast: HtmlAST, id: string): Element | undefined => {
  if (ast.type === 'element') {
    if (ast.properties.id === id) {
      return ast;
    }
    for (const child of ast.children) {
      const result = querySelectorId(child, id);
      if (result) {
        return result;
      }
    }
  }
  return undefined;
};

const querySelector = (ast: HtmlAST, selector: string): Element | undefined => {
  if (ast.type === 'root') {
    for (const child of ast.children) {
      const result = querySelector(child, selector);
      if (result) {
        return result;
      }
    }
  } else if (ast.type === 'element') {
    if (selector.startsWith('.')) {
      return querySelectorClass(ast, selector.slice(1));
    } else if (selector.startsWith('#')) {
      return querySelectorId(ast, selector.slice(1));
    } else {
      return querySelectorTag(ast, selector);
    }
  }
  return undefined;
};

const flatNodes = (
  ast: HtmlAST,
  expression: (tagName: string) => boolean
): HtmlAST => {
  if (ast.type === 'element') {
    const children = ast.children.map(child => flatNodes(child, expression));
    return {
      ...ast,
      children: children.flatMap(child => {
        if (child.type === 'element' && expression(child.tagName)) {
          return child.children;
        }
        return child;
      }) as ElementContent[],
    };
  }
  return ast;
};

// Check if it is a paragraph like element
// https://html.spec.whatwg.org/#paragraph
const isParagraphLike = (node: Element): boolean => {
  // Flex container
  return (
    (typeof node.properties?.style === 'string' &&
      node.properties.style.match(/display:\s*flex/) !== null) ||
    getElementChildren(node).every(child => isElementInline(child))
  );
};

export const HastUtils = {
  isElement,
  getTextContent,
  getElementChildren,
  getTextChildren,
  getTextChildrenOnlyAst,
  getInlineOnlyElementAST,
  querySelector,
  flatNodes,
  isParagraphLike,
  isTagBlock,
  isTagInline,
  isElementInline,
};
