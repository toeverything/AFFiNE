/**
 * @vitest-environment node
 */
import { createReadStream } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, resolve } from 'node:path';

import { type Browser, chromium } from '@playwright/test';
import type DOMPurifyDefault from 'dompurify';
import type { Mermaid } from 'mermaid';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

const workspaceRoot = resolve('.');

let server: Server;
let serverUrl: string;
let browser: Browser;

function contentType(path: string) {
  switch (extname(path)) {
    case '.js':
    case '.mjs':
      return 'text/javascript';
    case '.json':
      return 'application/json';
    default:
      return 'application/octet-stream';
  }
}

beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><body></body></html>');
      return;
    }

    const filePath = resolve(
      join(workspaceRoot, decodeURIComponent(url.pathname))
    );

    if (!filePath.startsWith(workspaceRoot)) {
      response.writeHead(403);
      response.end();
      return;
    }

    response.setHeader('Content-Type', contentType(filePath));
    response.writeHead(200);
    createReadStream(filePath)
      .on('error', () => {
        if (!response.headersSent) {
          response.writeHead(404);
        }
        response.end();
      })
      .pipe(response);
  });

  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to start mermaid preview test server.');
  }
  serverUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
});

describe('mermaid preview integration', () => {
  test('flowchart labels survive strict classic render and svg sanitization in browser', async () => {
    const page = await browser.newPage();

    try {
      await page.goto(serverUrl);

      const result = await page.evaluate(async () => {
        const browserImport = new Function('url', 'return import(url)') as <T>(
          url: string
        ) => Promise<T>;
        const mermaid = (
          await browserImport<{ default: Mermaid }>(
            '/node_modules/mermaid/dist/mermaid.esm.mjs'
          )
        ).default;
        const DOMPurify = (
          await browserImport<{ default: typeof DOMPurifyDefault }>(
            '/node_modules/dompurify/dist/purify.es.mjs'
          )
        ).default;

        const sanitizeSvg = (svg: string) => {
          const sanitizeConfig = {
            USE_PROFILES: { svg: true },
            ADD_TAGS: ['use'],
            ADD_ATTR: ['href', 'xlink:href', 'class', 'style', 'id'],
          };
          const foreignObjectConfig = {
            USE_PROFILES: { html: true },
          };
          const parser = new DOMParser();
          const parsed = parser.parseFromString(svg, 'image/svg+xml');
          const root = parsed.documentElement;

          if (!root || root.tagName.toLowerCase() !== 'svg') return '';

          const sanitized = DOMPurify.sanitize(root, sanitizeConfig);
          if (typeof sanitized !== 'string') return '';

          const sanitizedDoc = parser.parseFromString(
            sanitized,
            'image/svg+xml'
          );
          const sanitizedRoot = sanitizedDoc.documentElement;
          if (!sanitizedRoot || sanitizedRoot.tagName.toLowerCase() !== 'svg') {
            return '';
          }

          sanitizedRoot
            .querySelectorAll('foreignObject, foreignobject')
            .forEach(element => {
              element.innerHTML = DOMPurify.sanitize(
                element.innerHTML,
                foreignObjectConfig
              );
            });

          return new XMLSerializer().serializeToString(sanitizedRoot).trim();
        };

        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'strict',
          htmlLabels: false,
          fontFamily: 'IBM Plex Mono',
          flowchart: { useMaxWidth: true },
          sequence: { useMaxWidth: true },
          gantt: { useMaxWidth: true },
          pie: { useMaxWidth: true },
          journey: { useMaxWidth: true },
          gitGraph: { useMaxWidth: true },
        });

        const { svg: raw } = await mermaid.render(
          `mermaid-diagram-${Date.now()}`,
          'flowchart TD; A-->B'
        );
        const sanitized = sanitizeSvg(raw);

        return {
          raw,
          sanitized,
          hasLabelText:
            />\s*A\s*</i.test(sanitized) ||
            />\s*B\s*</i.test(sanitized) ||
            /foreignObject[\s\S]*>\s*A\s*</i.test(sanitized) ||
            /<tspan[^>]*>\s*A\s*</i.test(sanitized),
        };
      });

      expect(result.raw).toMatch(/<svg[\s>]/i);
      expect(result.sanitized).toMatch(/<svg[\s>]/i);
      expect(result.sanitized).toMatch(/<(?:rect|path|circle|polygon)\b/i);
      expect(result.hasLabelText).toBe(true);
    } finally {
      await page.close();
    }
  }, 30_000);
});
