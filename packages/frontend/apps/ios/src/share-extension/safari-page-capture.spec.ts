import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'vitest';

const source = readFileSync(
  new URL('../../App/ShareExtension/SafariPageCapture.js', import.meta.url),
  'utf8'
);

type CaptureContext = {
  absoluteURL: (value: string) => string;
  decodeXmlEntities: (value: string) => string;
  extractCaptionURLsFromScripts: () => string[];
  fetchText: (url: string, options: { maxBytes: number }) => Promise<string>;
  parseVtt: (value: string) => Array<{ start: number; text: string }>;
};

function loadCapture(
  scriptText = '',
  fetchImpl: typeof fetch = fetch
): CaptureContext {
  const document = {
    baseURI: 'https://affine.pro/blog/post',
    createElement: () => {
      let href = '';
      return {
        get href() {
          return href;
        },
        set href(value: string) {
          href = new URL(value, document.baseURI).href;
        },
      };
    },
    querySelectorAll: (selector: string) =>
      selector === 'script' ? [{ textContent: scriptText }] : [],
  };
  const context = {
    AbortController,
    document,
    fetch: fetchImpl,
    Promise,
    setTimeout,
    clearTimeout,
    TextDecoder,
    TextEncoder,
    URL,
  };

  runInNewContext(source, context);
  return context as unknown as CaptureContext;
}

describe('SafariPageCapture', () => {
  test('decodes XML entities exactly once', () => {
    const capture = loadCapture();

    expect(capture.decodeXmlEntities('&amp;lt;script&amp;gt;')).toBe(
      '&lt;script&gt;'
    );
  });

  test('rejects non-HTTP caption and media URLs', () => {
    const capture = loadCapture();

    expect(capture.absoluteURL('javascript:alert(1)')).toBe('');
    expect(
      capture.absoluteURL('data:text/html,<script>alert(1)</script>')
    ).toBe('');
  });

  test('removes unfinished caption markup', () => {
    const capture = loadCapture();
    const captions = capture.parseVtt(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello <script'
    );

    expect(captions).toEqual([{ start: 0, text: 'hello' }]);
  });

  test('does not decode a script URL twice', () => {
    const capture = loadCapture(
      String.raw`{"caption":"https:\/\/cdn.example.com\/captions.vtt?x=1\u0026amp;y=2"}`
    );

    expect(capture.extractCaptionURLsFromScripts()).toEqual([
      'https://cdn.example.com/captions.vtt?x=1&amp;y=2',
    ]);
  });

  test('enforces the byte limit for non-streaming responses', async () => {
    const body = '你'.repeat(40);
    const capture = loadCapture('', async () => {
      return {
        body: null,
        headers: { get: () => null },
        ok: true,
        text: async () => body,
      } as unknown as Response;
    });

    await expect(
      capture.fetchText('https://example.com/captions.vtt', { maxBytes: 100 })
    ).rejects.toThrow('fetch too large');
  });
});
