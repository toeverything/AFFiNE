/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, test, vi } from 'vitest';

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

  test('rejects non-svg roots and malformed prefixes', () => {
    const maliciousPrefix = '<!doctype' + '?><!doctype'.repeat(10_000);

    expect(sanitizeSvg('<div><svg></svg></div>')).toBe('');
    expect(sanitizeSvg(`${maliciousPrefix}<div></div>`)).toBe('');
  });

  test('keeps internal references and safe image data urls', () => {
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

  test('removes external references and unsafe inline css', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <use href="https://example.com/glyph.svg#x"></use>
        <a xlink:href="javascript:alert(1)"><path></path></a>
        <image href="https://example.com/image.png"></image>
        <path style="fill: url(https://example.com/pattern.svg#x)"></path>
      </svg>
    `);

    expect(sanitized).not.toContain('https://example.com');
    expect(sanitized).not.toContain('javascript:');
    expect(sanitized).not.toContain('url(');
  });

  test('preserves local fragment urls in inline styles', () => {
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <path style='fill: url("#gradient")'></path>
        <path style="stroke: url('#gradient')"></path>
      </svg>
    `);

    expect(sanitized.match(/url\(#gradient\)/g)).toHaveLength(2);
  });

  test('removes links sharing the current registrable domain', () => {
    setLocation('https://sub.example.co.uk/workspace');
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a href="https://other.example.co.uk/docs"><path></path></a>
        <a href="https://example.com/docs"><path></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('https://other.example.co.uk/docs');
    expect(sanitized).toContain('https://example.com/docs');
  });

  test('keeps private suffix sibling domains separate', () => {
    setLocation('https://foo.github.io/workspace');
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a href="https://foo.github.io/docs"><path></path></a>
        <a href="https://bar.github.io/docs"><path></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('https://foo.github.io/docs');
    expect(sanitized).toContain('https://bar.github.io/docs');
  });

  test('handles local hostnames by exact hostname', () => {
    setLocation('http://localhost:3000/workspace');
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <a href="http://localhost:8080/docs"><path></path></a>
        <a href="http://share.localhost/docs"><path></path></a>
      </svg>
    `);

    expect(sanitized).not.toContain('http://localhost:8080/docs');
    expect(sanitized).toContain('http://share.localhost/docs');
  });

  test('recursively applies the complete sanitizer to svg images', () => {
    const nestedSvg = svgDataUrl(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <use href="#glyph-a"></use>
        <use href="https://example.com/glyph.svg#x"></use>
        <script>alert(1)</script>
      </svg>
    `);
    const sanitized = sanitizeSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <image href="${nestedSvg}"></image>
      </svg>
    `);
    const href = sanitized.match(/href="([^"]+)"/)?.[1] ?? '';
    const nested = decodeSvgDataUrl(href);

    expect(href).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(nested).toContain('#glyph-a');
    expect(nested).not.toContain('https://example.com');
    expect(nested).not.toContain('<script');
  });

  test('removes svg images nested deeper than two levels', () => {
    const thirdLevel = svgDataUrl('<svg><rect></rect></svg>');
    const secondLevel = svgDataUrl(
      `<svg><image href="${thirdLevel}"></image></svg>`
    );
    const firstLevel = svgDataUrl(
      `<svg><image href="${secondLevel}"></image></svg>`
    );
    const sanitized = sanitizeSvg(
      `<svg><image href="${firstLevel}"></image></svg>`
    );
    const firstHref = sanitized.match(/href="([^"]+)"/)?.[1] ?? '';
    const firstSvg = decodeSvgDataUrl(firstHref);
    const secondHref = firstSvg.match(/href="([^"]+)"/)?.[1] ?? '';

    expect(firstSvg).toContain('<image');
    expect(decodeSvgDataUrl(secondHref)).not.toContain('<image');
  });

  test('preserves and scopes Mermaid theme styles', () => {
    const sanitized = sanitizeSvg(`
      <svg id="mermaid-diagram" xmlns="http://www.w3.org/2000/svg">
        <style>
          #mermaid-diagram .node rect { fill: #1f2020; stroke: #ccc; }
          #inner text { fill: url("#gradient"); }
        </style>
        <g id="inner" class="node"><rect></rect><text>Label</text></g>
      </svg>
    `);
    const scopeClass = sanitized.match(/svg-scope-[a-z0-9]+/)?.[0];

    expect(scopeClass).toBeDefined();
    expect(sanitized).toContain(`.${scopeClass} .node rect`);
    expect(sanitized).toContain(`.${scopeClass} #inner text`);
    expect(sanitized).toContain('url(#gradient)');
  });

  test('rejects external css resources and selectors escaping the svg root', () => {
    const sanitized = sanitizeSvg(`
      <svg id="mermaid-diagram" xmlns="http://www.w3.org/2000/svg">
        <style>
          @\\69mport "https://evil.example/a.css";
          #mermaid-diagram + .host-ui { display: none; }
          #mermaid-diagram .node { fill: #000; background-image: image-set("https://evil.example/pixel" 1x); }
        </style>
        <g class="node"></g>
      </svg>
    `);

    expect(sanitized).not.toContain('evil.example');
    expect(sanitized).not.toContain('@import');
    expect(sanitized).not.toContain('image-set');
    expect(sanitized).not.toContain('.host-ui');
    expect(sanitized).toContain('fill:#000');
  });
});

describe('sanitizeSvg without DOM parsing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('fails closed', () => {
    vi.stubGlobal('DOMParser', undefined);
    vi.stubGlobal('XMLSerializer', undefined);

    expect(sanitizeSvg('<svg><style>.node { fill: #000; }</style></svg>')).toBe(
      ''
    );
  });
});
