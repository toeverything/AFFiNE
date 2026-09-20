/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test } from 'vitest';

import { sanitizeSvg } from '../../utils/svg.js';

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
});
