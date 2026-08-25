/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  sanitizeDeclarationList,
  sanitizeStyleSheet,
  sanitizeSvg,
  sanitizeSvgCssInString,
  sanitizeSvgHrefsInString,
} from '../../utils/svg.js';

type HappyDOMWindow = Window & {
  happyDOM: {
    setURL: (url: string) => void;
  };
};

function setLocation(url: string) {
  (window as unknown as HappyDOMWindow).happyDOM.setURL(url);
}

function svgDataUrl(svg: string) {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}

function decodeSvgDataUrl(dataUrl: string) {
  const base64 = dataUrl.split(',')[1];
  return new TextDecoder().decode(
    Uint8Array.from(atob(base64), char => char.charCodeAt(0))
  );
}

describe('sanitizeSvg', () => {
  test('wraps DOMPurify svg fragments back into an svg root', () => {
    const sanitized = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"></rect></svg>'
    );

    expect(sanitized).toContain('<svg');
    expect(sanitized).toContain('width="100"');
    expect(sanitized).toContain('<rect');
  });

  test('accepts svg documents with xml and doctype prefixes', () => {
    const sanitized = sanitizeSvg(`<?xml version="1.0" standalone="no"?>
      <!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
      <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
        <rect width="100" height="100"></rect>
      </svg>`);

    expect(sanitized).toContain('<svg');
    expect(sanitized).toContain('width="100"');
    expect(sanitized).toContain('<rect');
    expect(sanitized).not.toContain('<!DOCTYPE');
  });

  test('rejects non-svg roots', () => {
    expect(sanitizeSvg('<div><svg></svg></div>')).toBe('');
  });

  test('rejects malformed doctype prefixes without regexp backtracking', () => {
    const maliciousPrefix = '<!doctype' + '?><!doctype'.repeat(10_000);

    expect(sanitizeSvg(`${maliciousPrefix}<div></div>`)).toBe('');
  });

  test('keeps internal glyph references and safe image data urls', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <defs><path id="glyph-a" d="M0 0h10v10z"></path></defs>
        <use href="#glyph-a"></use>
        <use xlink:href="#glyph-a"></use>
        <a xlink:href="https://typst.app/docs/tutorial"><path d="M0 0h10v10z"></path></a>
        <image href="data:image/png;base64,AAAA" width="10" height="10"></image>
      </svg>
    `);

    expect(sanitized).toContain('href="#glyph-a"');
    expect(sanitized).toContain('xlink:href="#glyph-a"');
    expect(sanitized).toContain('xlink:href="https://typst.app/docs/tutorial"');
    expect(sanitized).toContain('data:image/png;base64,AAAA');
  });

  test('removes external glyph references and unsafe css', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <style>@import "https://example.com/style.css"; .a { fill: #000; }</style>
        <use href="https://example.com/glyph.svg#x"></use>
        <use xlink:href="https://example.com/glyph.svg#x"></use>
        <a xlink:href="javascript:alert(1)"><path d="M0 0h10v10z"></path></a>
        <image href="https://example.com/image.png" width="10" height="10"></image>
        <path style="fill: url(https://example.com/pattern.svg#x)" d="M0 0h10v10z"></path>
      </svg>
    `);

    expect(sanitized).not.toContain('https://example.com');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('@import');
    expect(sanitized).not.toContain('url(');
  });

  test('preserves same-document fragment url() references in inline styles', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path style="fill: url(#gradient);" d="M0 0h10v10z"></path>
        <path style="fill: url(https://evil.example/x)" d="M0 0h10v10z"></path>
      </svg>
    `);

    expect(sanitized).toContain('url(#gradient)');
    expect(sanitized).not.toContain('https://evil.example');
  });

  test('removes links sharing the current registrable domain', () => {
    setLocation('https://sub.example.co.uk/workspace');

    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a xlink:href="https://sub.example.co.uk/docs"><path d="M0 0h10v10z"></path></a>
        <a href="https://other.example.co.uk/docs"><path d="M0 0h10v10z"></path></a>
        <a xlink:href="https://example.com/docs"><path d="M0 0h10v10z"></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('https://sub.example.co.uk/docs');
    expect(sanitized).not.toContain('https://other.example.co.uk/docs');
    expect(sanitized).toContain('https://example.com/docs');
  });

  test('keeps private suffix sibling domains separate', () => {
    setLocation('https://foo.github.io/workspace');

    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a xlink:href="https://foo.github.io/docs"><path d="M0 0h10v10z"></path></a>
        <a href="https://bar.github.io/docs"><path d="M0 0h10v10z"></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('https://foo.github.io/docs');
    expect(sanitized).toContain('https://bar.github.io/docs');
  });

  test('handles local hostnames by exact hostname', () => {
    setLocation('http://localhost:3000/workspace');

    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a xlink:href="http://localhost:8080/docs"><path d="M0 0h10v10z"></path></a>
        <a href="http://share.localhost/docs"><path d="M0 0h10v10z"></path></a>
        <a href="http://127.0.0.1/docs"><path d="M0 0h10v10z"></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('http://localhost:8080/docs');
    expect(sanitized).toContain('http://share.localhost/docs');
    expect(sanitized).toContain('http://127.0.0.1/docs');
  });

  test('recursively sanitizes svg images', () => {
    const nestedSvg = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="glyph-a" d="M0 0h10v10z"></path></defs><use href="#glyph-a"></use><use href="https://example.com/glyph.svg#x"></use></svg>'
    );
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <image href="${nestedSvg}" width="10" height="10"></image>
      </svg>
    `);
    const sanitizedImageHref = sanitized.match(/href="([^"]+)"/)?.[1];

    expect(sanitizedImageHref).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(decodeSvgDataUrl(sanitizedImageHref ?? '')).toContain('<svg');
    expect(decodeSvgDataUrl(sanitizedImageHref ?? '')).toContain('#glyph-a');
    expect(decodeSvgDataUrl(sanitizedImageHref ?? '')).not.toContain(
      'https://example.com'
    );
  });

  test('removes svg images nested deeper than two levels', () => {
    const thirdLevelSvg = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"></rect></svg>'
    );
    const secondLevelSvg = svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="${thirdLevelSvg}"></image></svg>`
    );
    const firstLevelSvg = svgDataUrl(
      `<svg xmlns="http://www.w3.org/2000/svg"><image href="${secondLevelSvg}"></image></svg>`
    );
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <image href="${firstLevelSvg}"></image>
      </svg>
    `);
    const firstLevelHref = sanitized.match(/href="([^"]+)"/)?.[1];
    const firstLevelSanitizedSvg = decodeSvgDataUrl(firstLevelHref ?? '');
    const secondLevelHref = firstLevelSanitizedSvg.match(/href="([^"]+)"/)?.[1];
    const secondLevelSanitizedSvg = decodeSvgDataUrl(secondLevelHref ?? '');

    expect(firstLevelSanitizedSvg).toContain('<image');
    expect(secondLevelSanitizedSvg).not.toContain('<image');
  });

  test('rejects CSS escape obfuscations', () => {
    const css = sanitizeStyleSheet(
      '@\\69mport "https://evil.example/a.css"; .a { fill: url(https://evil.example/x); }',
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).not.toContain('evil.example');
    expect(css).not.toContain('@import');
  });

  test('rejects resource functions like image-set', () => {
    const css = sanitizeStyleSheet(
      '.a { background-image: image-set("https://evil.example/pixel" 1x); }',
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).not.toContain('evil.example');
    expect(css).not.toContain('image-set');
  });

  test('scopes selectors to the generated root class', () => {
    const css = sanitizeStyleSheet(
      'affine-doc, .node rect { fill: #000; }',
      'svg-scope-test'
    );

    expect(css).toContain('.svg-scope-test affine-doc');
    expect(css).toContain('.svg-scope-test .node rect');
  });

  test('scopes root-id selectors as the same element', () => {
    const css = sanitizeStyleSheet(
      '#mermaid-diagram-123 .node rect { fill: #ECECFF; }',
      'svg-scope-test'
    );

    expect(css).toContain('.svg-scope-test .node rect');
    expect(css).not.toContain('#mermaid-diagram-123');
  });

  test('preserves quoted fragment references and rejects external urls', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path style='fill: url("#gradient");' d="M0 0h10v10z"></path>
        <path style="fill: url('#gradient');" d="M0 0h10v10z"></path>
        <path style="fill: url(https://evil.example/x)" d="M0 0h10v10z"></path>
      </svg>
    `);

    expect(sanitized).toContain('url(#gradient)');
    expect(sanitized).not.toContain('https://evil.example');
  });

  test('sanitizes a <style> element separately from style attributes', () => {
    const css = sanitizeStyleSheet(
      '.a { fill: url(#gradient); } .b { fill: url(https://evil.example/x); }',
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).toContain('url(#gradient)');
    expect(css).not.toContain('https://evil.example');
  });

  test('preserves double-quoted fragment url() in a <style> block', () => {
    const css = sanitizeStyleSheet(
      '.a { fill: url("#gradient"); } .b { fill: url(https://evil.example/x); }',
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).toContain('url(#gradient)');
    expect(css).not.toContain('https://evil.example');
  });

  test('preserves single-quoted fragment url() in a <style> block', () => {
    const css = sanitizeStyleSheet(
      ".a { fill: url('#gradient'); }",
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).toContain('url(#gradient)');
  });

  test('neutralizes escaped @import and external urls in a <style> block', () => {
    const css = sanitizeStyleSheet(
      '@\\69mport url("https://evil.example/x.css"); .a { fill: url(https://evil.example/y); }',
      'svg-scope-test'
    );

    expect(css).not.toBeNull();
    expect(css).not.toContain('evil.example');
    expect(css).not.toContain('@import');
  });

  test('no-DOM path validates CSS identically', () => {
    const input = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <style>@\\69mport "https://evil.example/a.css"; .a { fill: url(#gradient); }</style>
        <path style="fill: url(https://evil.example/x)" d="M0 0h10v10z"></path>
        <path style='fill: url("#gradient");' d="M0 0h10v10z"></path>
      </svg>
    `;
    const out = sanitizeSvgCssInString(input, 'svg-scope-test');

    expect(out).not.toContain('evil.example');
    expect(out).not.toContain('@import');
    expect(out).toContain('url(#gradient)');
    expect(out).toContain('svg-scope-test');
  });

  test('legacy unsafe CSS vectors are still rejected', () => {
    const styleCss = sanitizeStyleSheet(
      '@import "https://evil.example/a.css"; .a { behavior: url(https://evil.example/x); -moz-binding: url(https://evil.example/y); }',
      'svg-scope-test'
    );

    expect(styleCss).not.toContain('@import');
    expect(styleCss).not.toContain('evil.example');
    expect(styleCss).not.toContain('behavior');
    expect(styleCss).not.toContain('-moz-binding');

    const inlineCss = sanitizeDeclarationList('fill: expression(alert(1));');
    expect(inlineCss ?? '').not.toContain('expression');
  });
});

describe('sanitizeSvgHrefsInString (no-DOM href filtering)', () => {
  test('removes external image href', () => {
    const out = sanitizeSvgHrefsInString(
      '<svg><image href="https://example.com/x.png" width="10"></image></svg>',
      'scope-x'
    );

    expect(out).not.toContain('https://example.com');
    expect(out).toContain('<image');
  });

  test('removes external use href', () => {
    const out = sanitizeSvgHrefsInString(
      '<svg><use href="https://example.com/g.svg#x"></use></svg>',
      'scope-x'
    );

    expect(out).not.toContain('https://example.com');
  });

  test('preserves local fragment references', () => {
    const out = sanitizeSvgHrefsInString(
      '<svg><use href="#glyph-a"></use><use xlink:href="#glyph-a"></use></svg>',
      'scope-x'
    );

    expect(out).toContain('href="#glyph-a"');
    expect(out).toContain('xlink:href="#glyph-a"');
  });

  test('recursively sanitizes nested svg data-url images', () => {
    const nested = svgDataUrl(
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="#g"></use><use href="https://example.com/g.svg#x"></use></svg>'
    );
    const out = sanitizeSvgHrefsInString(
      `<svg><image href="${nested}"></image></svg>`,
      'scope-x'
    );

    const encoded = out.match(/href="([^"]+)"/)?.[1] ?? '';
    expect(encoded).toMatch(/^data:image\/svg\+xml;base64,/);
    const decoded = decodeSvgDataUrl(encoded);
    expect(decoded).toContain('#g');
    expect(decoded).not.toContain('https://example.com');
  });

  test('drops nested svg data-url that cannot be sanitized', () => {
    const nested = svgDataUrl('<div>not svg</div>');
    const out = sanitizeSvgHrefsInString(
      `<svg><image href="${nested}"></image></svg>`,
      'scope-x'
    );

    expect(out).not.toContain('data:image/svg+xml');
  });

  test('drops the third nested svg image at the depth limit', () => {
    const thirdLevelSvg = svgDataUrl(
      '<svg id="lvl3" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"></rect></svg>'
    );
    const secondLevelSvg = svgDataUrl(
      `<svg id="lvl2" xmlns="http://www.w3.org/2000/svg"><image href="${thirdLevelSvg}"></image></svg>`
    );
    const firstLevelSvg = svgDataUrl(
      `<svg id="lvl1" xmlns="http://www.w3.org/2000/svg"><image href="${secondLevelSvg}"></image></svg>`
    );
    const out = sanitizeSvgHrefsInString(
      `<svg id="top"><image href="${firstLevelSvg}"></image></svg>`,
      'scope-x'
    );

    const firstLevelHref = out.match(/href="([^"]+)"/)?.[1];
    const firstLevelSanitized = decodeSvgDataUrl(firstLevelHref ?? '');
    expect(firstLevelSanitized).toContain('lvl1');

    const secondLevelHref = firstLevelSanitized.match(/href="([^"]+)"/)?.[1];
    const secondLevelSanitized = decodeSvgDataUrl(secondLevelHref ?? '');
    expect(secondLevelSanitized).toContain('lvl2');

    const thirdLevelHref = secondLevelSanitized.match(/href="([^"]+)"/)?.[1];
    expect(thirdLevelHref).toBeUndefined();
  });

  test('removes an unsafe href even when a safe href precedes it', () => {
    const out = sanitizeSvgHrefsInString(
      '<svg><use href="#local" xlink:href="https://example.com/x.svg#y"></use></svg>',
      'scope-x'
    );

    expect(out).toContain('href="#local"');
    expect(out).not.toContain('https://example.com');
  });

  test('preserves a safe href even when an unsafe href precedes it', () => {
    const out = sanitizeSvgHrefsInString(
      '<svg><use xlink:href="https://example.com/x.svg#y" href="#local"></use></svg>',
      'scope-x'
    );

    expect(out).toContain('href="#local"');
    expect(out).not.toContain('https://example.com');
  });
});

describe('sanitizeSvg no-DOM fallback', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function sanitizeNoDom(input: string) {
    vi.stubGlobal('DOMParser', undefined);
    vi.stubGlobal('XMLSerializer', undefined);
    return sanitizeSvg(input);
  }

  test('never leaks external hrefs through the no-DOM branch', () => {
    const sanitized = sanitizeNoDom(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <image href="https://example.com/image.png" width="10" height="10"></image>
        <use href="https://example.com/glyph.svg#x"></use>
      </svg>
    `);

    expect(sanitized).not.toContain('https://example.com');
  });

  test('fails closed on input with no svg root', () => {
    expect(sanitizeNoDom('<p>not svg</p>')).toBe('');
  });
});
