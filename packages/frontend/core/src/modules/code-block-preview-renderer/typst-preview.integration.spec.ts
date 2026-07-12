/**
 * @vitest-environment node
 */
import { resolve } from 'node:path';

import { type Browser, chromium } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const typstDemo = String.raw`#set page(paper: "a5")
#set heading(numbering: "1.")

#show link: set text(fill: blue, weight: 700)
#show link: underline

= The Typst Playground

Welcome to the Typst Playground! This is a sandbox where you can experiment with Typst.

= Basics <basics>

Typst is a _markup_ language. You use it to express not just the content, but also the structure and formatting of your document.

- *Strongly emphasize* some text
- Refer to @basics
- Typeset math: $a, b in { 1/2, sqrt(4 a b) }$

= Next steps

To learn more about Typst, check out https://typst.app/docs/tutorial.`;

let server: ViteDevServer;
let serverUrl: string;
let browser: Browser;

const typstRuntimeUrl = `/@fs/${resolve(
  'packages/frontend/core/src/modules/typst/renderer/runtime.ts'
)}`;
const svgUtilsUrl = `/@fs/${resolve(
  'blocksuite/affine/shared/src/utils/svg.ts'
)}`;

beforeAll(async () => {
  server = await createServer({
    logLevel: 'silent',
    server: {
      host: '127.0.0.1',
      port: 0,
    },
  });
  await server.listen();

  const address = server.httpServer?.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start typst preview test server.');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe('typst preview integration', () => {
  test('sanitization preserves rendered glyphs, styles, and link colors', async () => {
    const page = await browser.newPage();

    try {
      await page.goto(serverUrl);

      const result = await page.evaluate(
        async ({ code, svgUtilsUrl, typstRuntimeUrl }) => {
          const browserImport = new Function('url', 'return import(url)') as <
            T,
          >(
            url: string
          ) => Promise<T>;
          const [{ renderTypstSvgWithOptions }, { sanitizeSvg }] =
            await Promise.all([
              browserImport<{
                renderTypstSvgWithOptions: (
                  code: string,
                  options: { fontUrls: string[] }
                ) => Promise<{ svg: string }>;
              }>(typstRuntimeUrl),
              browserImport<{
                sanitizeSvg: (svg: string) => string;
              }>(svgUtilsUrl),
            ]);
          const { svg: raw } = await renderTypstSvgWithOptions(code, {
            fontUrls: [],
          });
          const sanitized = sanitizeSvg(raw);
          const parse = (svg: string) =>
            new DOMParser().parseFromString(svg, 'image/svg+xml');
          const rawDoc = parse(raw);
          const sanitizedDoc = parse(sanitized);

          return {
            linkHrefs: Array.from(sanitizedDoc.querySelectorAll('a')).map(
              element =>
                element.getAttribute('href') ??
                element.getAttribute('xlink:href') ??
                ''
            ),
            rawUseCount: rawDoc.querySelectorAll('use').length,
            sanitized,
            sanitizedRoot: sanitizedDoc.documentElement.tagName,
            sanitizedUseCount: sanitizedDoc.querySelectorAll('use').length,
            hasParserError: !!sanitizedDoc.querySelector('parsererror'),
          };
        },
        { code: typstDemo, svgUtilsUrl, typstRuntimeUrl }
      );

      expect(result.sanitizedRoot).toBe('svg');
      expect(result.hasParserError).toBe(false);
      expect(result.rawUseCount).toBeGreaterThan(0);
      expect(result.sanitizedUseCount).toBe(result.rawUseCount);
      expect(result.linkHrefs).toContain('https://typst.app/docs/tutorial');
      expect(result.sanitized).toContain('typst-text');
      expect(result.sanitized).toContain('#0074d9');
      expect(result.sanitized).not.toContain('<script');
    } finally {
      await page.close();
    }
  }, 30_000);
});
