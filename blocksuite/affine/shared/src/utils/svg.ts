import type { CssNode } from 'css-tree';
import {
  generate as generateCss,
  parse as parseCss,
  walk as walkCss,
} from 'css-tree';
import type { Config } from 'dompurify';
import DOMPurify from 'dompurify';
import { parse } from 'tldts';

type SanitizeSvgOptions = {
  svg?: Config;
  foreignObjectHtml?: Config;
};

const MAX_NESTED_SVG_IMAGE_DEPTH = 2;

const DEFAULT_SVG_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { svg: true },
  ADD_TAGS: ['use', 'style'],
  ADD_ATTR: ['href', 'xlink:href', 'class', 'style', 'id'],
};

const DEFAULT_FOREIGN_OBJECT_HTML_SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true },
};

const SAFE_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SVG_DATA_URL_PATTERN =
  /^data:image\/svg\+xml(?:;charset=[^;,]+)?(?<base64>;base64)?,(?<data>[\s\S]*)$/i;
const SAFE_IMAGE_DATA_URL_PATTERN =
  /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=]+$/i;

const SVG_ROOT_ATTRIBUTES = [
  'class',
  'data-height',
  'data-width',
  'height',
  'preserveAspectRatio',
  'viewBox',
  'width',
  'xmlns',
  'xmlns:h5',
  'xmlns:xlink',
];

function getAttribute(element: Element, attribute: string) {
  return (
    element.getAttribute(attribute) ??
    element.getAttribute(attribute.toLowerCase())
  );
}

function getSvgSanitizeConfig(options?: SanitizeSvgOptions) {
  return {
    ...DEFAULT_SVG_SANITIZE_CONFIG,
    ...options?.svg,
  };
}

function getForeignObjectHtmlSanitizeConfig(options?: SanitizeSvgOptions) {
  return {
    ...DEFAULT_FOREIGN_OBJECT_HTML_SANITIZE_CONFIG,
    ...options?.foreignObjectHtml,
  };
}

function isXmlWhitespace(char: string) {
  return (
    char === ' ' ||
    char === '\n' ||
    char === '\r' ||
    char === '\t' ||
    char === '\f'
  );
}

function skipXmlWhitespace(value: string, index: number) {
  while (index < value.length && isXmlWhitespace(value[index])) {
    index++;
  }
  return index;
}

function startsWithIgnoreCase(value: string, search: string, index: number) {
  return value.slice(index, index + search.length).toLowerCase() === search;
}

function getSvgRootStartIndex(value: string) {
  let index = skipXmlWhitespace(value, 0);

  if (startsWithIgnoreCase(value, '<?xml', index)) {
    const declarationEnd = value.indexOf('?>', index + 5);
    if (declarationEnd === -1) return -1;
    index = skipXmlWhitespace(value, declarationEnd + 2);
  }

  if (startsWithIgnoreCase(value, '<!doctype', index)) {
    const doctypeEnd = value.indexOf('>', index + 9);
    if (doctypeEnd === -1) return -1;
    index = skipXmlWhitespace(value, doctypeEnd + 1);
  }

  if (!startsWithIgnoreCase(value, '<svg', index)) return -1;

  const next = value[index + 4];
  return next === '>' || (next !== undefined && isXmlWhitespace(next))
    ? index
    : -1;
}

function hasSvgRoot(value: string) {
  return getSvgRootStartIndex(value) !== -1;
}

function getOriginalSvgRoot(svg: string, parser: DOMParser) {
  const root = parser.parseFromString(svg, 'image/svg+xml').documentElement;
  if (root?.tagName.toLowerCase() === 'svg') {
    return root;
  }
  if (!hasSvgRoot(svg)) {
    return null;
  }
  return parser.parseFromString(svg, 'text/html').querySelector('svg');
}

function ensureSvgRoot(
  originalRoot: Element | null,
  sanitized: string,
  parser: DOMParser
) {
  if (hasSvgRoot(sanitized)) {
    const sanitizedDoc = parser.parseFromString(sanitized, 'image/svg+xml');
    const sanitizedRoot = sanitizedDoc.documentElement;
    return sanitizedRoot?.tagName.toLowerCase() === 'svg'
      ? sanitizedRoot
      : null;
  }

  const svgDoc = parser.parseFromString('<svg></svg>', 'image/svg+xml');
  const svgRoot = svgDoc.documentElement;
  SVG_ROOT_ATTRIBUTES.forEach(attribute => {
    const value = originalRoot ? getAttribute(originalRoot, attribute) : null;
    if (value) {
      svgRoot.setAttribute(attribute, value);
    }
  });
  svgRoot.innerHTML = sanitized;
  return svgRoot;
}

function sanitizeForeignObjects(
  root: ParentNode,
  options?: SanitizeSvgOptions
) {
  root.querySelectorAll('foreignObject, foreignobject').forEach(element => {
    element.innerHTML = DOMPurify.sanitize(
      element.innerHTML,
      getForeignObjectHtmlSanitizeConfig(options)
    );
  });
}

function getSiteDomain(hostname: string) {
  return (
    parse(hostname, { allowPrivateDomains: true }).domain ??
    hostname.toLowerCase()
  );
}

function isSameSiteDomain(url: URL) {
  if (typeof location === 'undefined') return false;
  return getSiteDomain(url.hostname) === getSiteDomain(location.hostname);
}

function isSafeLinkUrl(value: string) {
  try {
    const url = new URL(value);
    return SAFE_LINK_PROTOCOLS.has(url.protocol) && !isSameSiteDomain(url);
  } catch {
    return false;
  }
}

function isSafeHref(element: Element, value: string) {
  if (value.startsWith('#')) return true;
  const tagName = element.tagName.toLowerCase();
  if (tagName === 'use') return false;
  if (tagName === 'image') return SAFE_IMAGE_DATA_URL_PATTERN.test(value);
  if (tagName === 'a') return isSafeLinkUrl(value);
  return false;
}

function decodeSvgDataUrl(value: string) {
  const groups = value.match(SVG_DATA_URL_PATTERN)?.groups;
  if (!groups) return null;

  try {
    if (groups.base64) {
      return new TextDecoder().decode(
        Uint8Array.from(atob(groups.data), char => char.charCodeAt(0))
      );
    }
    return decodeURIComponent(groups.data);
  } catch {
    return null;
  }
}

function encodeSvgDataUrl(svg: string) {
  const binary = Array.from(new TextEncoder().encode(svg), byte =>
    String.fromCharCode(byte)
  ).join('');
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function getHrefAttributes(element: Element) {
  return Array.from(element.attributes).filter(
    attribute => attribute.name === 'href' || attribute.name === 'xlink:href'
  );
}

const SAFE_CSS_FUNCTIONS = new Set([
  'rgb',
  'rgba',
  'hsl',
  'hsla',
  'var',
  'calc',
]);

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
  'mix-blend-mode',
  'isolation',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-radius',
  'cursor',
  'line-height',
  'text-align',
  'vertical-align',
  'pointer-events',
  'user-select',
  'transform',
  'transform-origin',
  'transition',
  'box-shadow',
  'text-shadow',
  'outline',
  'z-index',
  'position',
  'top',
  'left',
  'right',
  'bottom',
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

function generateScopeClass() {
  return `svg-scope-${Math.random().toString(36).slice(2, 12)}`;
}

function isSafeCssValue(node: CssNode): boolean {
  let safe = true;
  walkCss(node, {
    visit: 'Url',
    enter(urlNode) {
      const value = String(urlNode.value ?? urlNode.raw ?? '').trim();
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

export function sanitizeDeclarationList(css: string): string | null {
  let ast;
  try {
    ast = parseCss(css, { context: 'declarationList' });
  } catch {
    return null;
  }
  walkCss(ast, {
    visit: 'Declaration',
    enter(decl, item, list) {
      const property = (decl.property ?? '').toLowerCase();
      if (
        !SAFE_DECLARATIONS.has(property) ||
        !isSafeCssValue(decl.value as CssNode)
      ) {
        list?.remove(item as CssNode);
      }
    },
  });
  try {
    return generateCss(ast);
  } catch {
    return null;
  }
}

function scopeSelector(selector: string, scopeClass: string): string {
  const match = selector.match(/^([^ >+~]+)([\s\S]*)$/);
  const first = match ? match[1] : selector;
  const rest = match ? match[2] : '';
  const isRoot =
    /^:root$/.test(first.trim()) ||
    /^(svg|html)$/.test(first.trim()) ||
    first.trim().startsWith('#');
  return isRoot ? `.${scopeClass}${rest}` : `.${scopeClass} ${selector}`;
}

export function sanitizeStyleSheet(
  css: string,
  scopeClass: string
): string | null {
  let ast;
  try {
    ast = parseCss(css, { context: 'stylesheet' });
  } catch {
    return null;
  }
  walkCss(ast, {
    visit: 'Atrule',
    enter(_node, item, list) {
      list?.remove(item as CssNode);
    },
  });
  walkCss(ast, {
    visit: 'Declaration',
    enter(decl, item, list) {
      const property = (decl.property ?? '').toLowerCase();
      if (
        !SAFE_DECLARATIONS.has(property) ||
        !isSafeCssValue(decl.value as CssNode)
      ) {
        list?.remove(item as CssNode);
      }
    },
  });
  if (ast.children) {
    ast.children.toArray().forEach(rule => {
      if (
        rule.type === 'Rule' &&
        rule.prelude &&
        rule.prelude.type === 'SelectorList'
      ) {
        const scoped = rule.prelude.children
          ?.toArray()
          .map(sel => scopeSelector(generateCss(sel), scopeClass));
        if (scoped) {
          rule.prelude = parseCss(scoped.join(', '), {
            context: 'selectorList',
          });
        }
      }
    });
  }
  try {
    return generateCss(ast);
  } catch {
    return null;
  }
}

function sanitizeSvgStyles(root: ParentNode, scopeClass: string) {
  root.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent ?? '';
    const sanitized = sanitizeStyleSheet(text, scopeClass);
    if (sanitized === null) {
      styleEl.remove();
    } else {
      styleEl.textContent = sanitized;
    }
  });
  root.querySelectorAll('[style]').forEach(el => {
    const value = el.getAttribute('style') ?? '';
    const sanitized = sanitizeDeclarationList(value);
    if (sanitized === null) {
      el.removeAttribute('style');
    } else {
      el.setAttribute('style', sanitized);
    }
  });
}

export function sanitizeSvgCssInString(
  svg: string,
  scopeClass: string
): string {
  const scoped = svg.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    const existingClass = (attrs.match(/class="([^"]*)"/i)?.[1] ?? '').trim();
    const newClass = (existingClass ? existingClass + ' ' : '') + scopeClass;
    const withoutClass = attrs.replace(/\s+class="[^"]*"/i, '');
    return `<svg class="${newClass}"${withoutClass}>`;
  });
  const withStyle = scoped.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (_match, inner: string) => {
      const sanitized = sanitizeStyleSheet(inner, scopeClass);
      return sanitized === null ? '' : `<style>${sanitized}</style>`;
    }
  );
  return withStyle.replace(
    /style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
    (_match, dq: string, sq: string) => {
      const value = dq !== undefined ? dq : sq;
      const sanitized = sanitizeDeclarationList(value);
      return sanitized === null ? '' : `style="${sanitized}"`;
    }
  );
}

function tightenSvgTree(
  root: ParentNode,
  options: SanitizeSvgOptions | undefined,
  depth: number
) {
  root.querySelectorAll('*').forEach(element => {
    getHrefAttributes(element).forEach(attribute => {
      const href = attribute.value.trim();
      const nestedSvg =
        element.tagName.toLowerCase() === 'image'
          ? decodeSvgDataUrl(href)
          : null;

      if (nestedSvg !== null) {
        if (depth < MAX_NESTED_SVG_IMAGE_DEPTH) {
          const sanitized = sanitizeSvgWithDepth(nestedSvg, options, depth + 1);
          if (sanitized) {
            element.setAttribute(attribute.name, encodeSvgDataUrl(sanitized));
            return;
          }
        }
        element.remove();
      } else if (!isSafeHref(element, href)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

export function sanitizeSvg(svg: string, options?: SanitizeSvgOptions): string {
  return sanitizeSvgWithDepth(svg, options, 0);
}

function sanitizeSvgWithDepth(
  svg: string,
  options: SanitizeSvgOptions | undefined,
  depth: number
): string {
  const svgConfig = getSvgSanitizeConfig(options);
  const scopeClass = generateScopeClass();

  if (
    typeof DOMParser === 'undefined' ||
    typeof XMLSerializer === 'undefined'
  ) {
    const purified = DOMPurify.sanitize(svg, svgConfig);
    if (typeof purified !== 'string' || !hasSvgRoot(purified)) {
      return '';
    }
    const withScope = sanitizeSvgCssInString(purified, scopeClass);
    return hasSvgRoot(withScope) ? withScope.trim() : '';
  }

  const parser = new DOMParser();
  const originalRoot = getOriginalSvgRoot(svg, parser);
  if (!originalRoot) return '';

  const sanitized = DOMPurify.sanitize(svg, svgConfig);
  if (typeof sanitized !== 'string') return '';
  const sanitizedRoot = ensureSvgRoot(originalRoot, sanitized, parser);
  if (!sanitizedRoot) return '';
  sanitizeForeignObjects(sanitizedRoot, options);
  sanitizeSvgStyles(sanitizedRoot, scopeClass);
  sanitizedRoot.classList.add(scopeClass);
  tightenSvgTree(sanitizedRoot, options, depth);
  return new XMLSerializer().serializeToString(sanitizedRoot).trim();
}
