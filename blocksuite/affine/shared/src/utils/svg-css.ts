import type { CssNode, Selector } from 'css-tree';
import {
  generate as generateCss,
  parse as parseCss,
  walk as walkCss,
} from 'css-tree';

const SAFE_CSS_FUNCTIONS = new Set(['rgb', 'rgba', 'hsl', 'hsla', 'calc']);

const SAFE_DECLARATIONS = new Set([
  'fill',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'color',
  'opacity',
  'visibility',
  'display',
  'overflow',
  'marker',
  'marker-start',
  'marker-mid',
  'marker-end',
  'stop-color',
  'stop-opacity',
  'font',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'text-anchor',
  'text-decoration',
  'letter-spacing',
  'word-spacing',
  'white-space',
  'dominant-baseline',
  'alignment-baseline',
  'baseline-shift',
  'paint-order',
  'vector-effect',
  'background',
  'background-color',
  'border',
  'border-radius',
  'line-height',
  'text-align',
  'vertical-align',
  'margin',
  'padding',
  'width',
  'height',
  'min-width',
  'max-width',
  'min-height',
  'max-height',
  'flex',
  'justify-content',
  'align-items',
  'gap',
]);

function isSafeCssValue(node: CssNode): boolean {
  let safe = true;
  walkCss(node, {
    visit: 'Url',
    enter(urlNode) {
      const value = urlNode.value.trim();
      if (!value.startsWith('#')) {
        safe = false;
      }
    },
  });
  walkCss(node, {
    visit: 'Function',
    enter(fnNode) {
      const name = String(fnNode.name ?? '').toLowerCase();
      if (!SAFE_CSS_FUNCTIONS.has(name)) {
        safe = false;
      }
    },
  });
  return safe;
}

function sanitizeDeclarations(ast: CssNode) {
  walkCss(ast, {
    visit: 'Declaration',
    enter(declaration, item, list) {
      const property = (declaration.property ?? '').toLowerCase();
      if (
        (!SAFE_DECLARATIONS.has(property) ||
          !isSafeCssValue(declaration.value as CssNode)) &&
        item
      ) {
        list?.remove(item);
      }
    },
  });
}

function sanitizeDeclarationList(css: string): string | null {
  try {
    const ast = parseCss(css, { context: 'declarationList' });
    sanitizeDeclarations(ast);
    return generateCss(ast);
  } catch {
    return null;
  }
}

function scopeSelector(
  selector: Selector,
  scopeClass: string,
  rootId: string | null
): string | null {
  const nodes = selector.children?.toArray() ?? [];
  const first = nodes[0];
  if (!first) {
    return null;
  }

  const combinator = nodes[1]?.type === 'Combinator' ? nodes[1] : null;
  const targetsRoot =
    (first.type === 'IdSelector' && first.name === rootId) ||
    (first.type === 'TypeSelector' && first.name === 'svg') ||
    (first.type === 'PseudoClassSelector' && first.name === 'root');

  if (!targetsRoot || (nodes[1] && !combinator)) {
    return `.${scopeClass} ${generateCss(selector)}`;
  }
  if (combinator?.name === '+' || combinator?.name === '~') {
    return null;
  }

  const generated = generateCss(selector);
  return `.${scopeClass}${generated.slice(generateCss(first).length)}`;
}

function sanitizeStyleSheet(
  css: string,
  scopeClass: string,
  rootId: string | null
): string | null {
  try {
    const ast = parseCss(css, { context: 'stylesheet' });
    if (ast.type !== 'StyleSheet') {
      return null;
    }
    walkCss(ast, {
      visit: 'Atrule',
      enter(_atRule, item, list) {
        if (item) {
          list?.remove(item);
        }
      },
    });
    sanitizeDeclarations(ast);
    ast.children?.toArray().forEach(rule => {
      if (
        rule.type !== 'Rule' ||
        !rule.prelude ||
        rule.prelude.type !== 'SelectorList'
      ) {
        return;
      }

      const scoped = rule.prelude.children
        .toArray()
        .filter(
          (selector): selector is Selector => selector.type === 'Selector'
        )
        .map(selector => scopeSelector(selector, scopeClass, rootId))
        .filter((selector): selector is string => selector !== null);
      const prelude = parseCss(
        scoped.length ? scoped.join(', ') : `.${scopeClass}:not(*)`,
        { context: 'selectorList' }
      );
      if (prelude.type === 'SelectorList') {
        rule.prelude = prelude;
      }
    });
    return generateCss(ast);
  } catch {
    return null;
  }
}

export function sanitizeSvgCss(
  root: Element,
  styleSheets: string[],
  scopeClass: string
) {
  const rootId = root.getAttribute('id');
  root.querySelectorAll('style').forEach(element => element.remove());
  styleSheets.reverse().forEach(styleSheet => {
    const sanitized = sanitizeStyleSheet(styleSheet, scopeClass, rootId);
    if (sanitized) {
      const styleElement = root.ownerDocument.createElementNS(
        'http://www.w3.org/2000/svg',
        'style'
      );
      styleElement.textContent = sanitized;
      root.prepend(styleElement);
    }
  });
  root.querySelectorAll('[style]').forEach(element => {
    const sanitized = sanitizeDeclarationList(
      element.getAttribute('style') ?? ''
    );
    if (sanitized === null) {
      element.removeAttribute('style');
    } else {
      element.setAttribute('style', sanitized);
    }
  });
}
