import serverNativeModule from '@affine/server-native';
import type { ExecutionContext, TestFn } from 'ava';
import ava from 'ava';
import Sinon from 'sinon';
import type { Response } from 'supertest';

import type { TestingApp } from './utils';

type TestContext = {
  app: TestingApp;
};
const test = ava.serial as TestFn<TestContext>;

let safeFetchStub: Sinon.SinonStub | undefined;
let safeFetchHandler:
  | ((request: { url: string; method?: 'get' | 'head' }) => {
      status?: number;
      finalUrl?: string;
      headers?: Record<string, string>;
      body?: Buffer | string;
    })
  | undefined;

const stubSafeFetch = (
  handler: (request: { url: string; method?: 'get' | 'head' }) => {
    status?: number;
    finalUrl?: string;
    headers?: Record<string, string>;
    body?: Buffer | string;
  }
) => {
  safeFetchHandler = handler;
  return {
    restore() {
      safeFetchHandler = undefined;
    },
  };
};

test.before(async t => {
  // @ts-expect-error test
  env.DEPLOYMENT_TYPE = 'selfhosted';

  safeFetchStub = Sinon.stub(serverNativeModule, 'safeFetch').callsFake(
    async request => {
      if (!safeFetchHandler) {
        throw new Error('Unexpected safeFetch call');
      }
      const nativeRequest = request as {
        url: string;
        method?: 'get' | 'head';
      };
      const response = safeFetchHandler(nativeRequest);
      return {
        status: response.status ?? 200,
        finalUrl: response.finalUrl ?? nativeRequest.url,
        headers: response.headers ?? {},
        body: Buffer.isBuffer(response.body)
          ? response.body
          : Buffer.from(response.body ?? ''),
      };
    }
  );

  const { createTestingApp } = await import('./utils');
  const app = await createTestingApp();

  t.context.app = app;
});

test.afterEach.always(() => {
  safeFetchHandler = undefined;
});

test.after.always(async t => {
  safeFetchStub?.restore();
  await t.context.app.close();
});

const assertAndSnapshotRaw = async (
  t: ExecutionContext<TestContext>,
  route: string,
  message: string,
  options?: {
    status?: number;
    origin?: string | null;
    referer?: string | null;
    method?: 'GET' | 'OPTIONS' | 'POST';
    body?: any;
    checker?: (res: Response) => any;
  }
) => {
  const {
    status = 200,
    origin = 'http://localhost:3010',
    referer,
    method = 'GET',
    checker = () => {},
  } = options || {};
  const { app } = t.context;
  const req = app[method](route);
  if (origin) {
    req.set('Origin', origin);
  }
  if (referer) {
    req.set('Referer', referer);
  }

  const res = req.send(options?.body).expect(status).expect(checker);
  await t.notThrowsAsync(res, message);
  t.snapshot((await res).body);
};

test('should proxy image', async t => {
  const assertAndSnapshot = assertAndSnapshotRaw.bind(null, t);
  const imageUrl = `http://example.com/image-${Date.now()}.png`;

  await assertAndSnapshot(
    '/api/worker/image-proxy',
    'should return proper CORS headers on OPTIONS request',
    {
      status: 204,
      method: 'OPTIONS',
      checker: (res: Response) => {
        if (!res.headers['access-control-allow-methods']) {
          throw new Error('Missing CORS headers');
        }
      },
    }
  );

  {
    await assertAndSnapshot(
      '/api/worker/image-proxy',
      'should return 400 if "url" query parameter is missing',
      { status: 400 }
    );
  }

  {
    await assertAndSnapshot(
      `/api/worker/image-proxy?url=${imageUrl}`,
      'should return 400 if origin and referer are missing',
      { status: 400, origin: null, referer: null }
    );
  }

  {
    await assertAndSnapshot(
      `/api/worker/image-proxy?url=${imageUrl}`,
      'should return 400 for invalid origin header',
      { status: 400, origin: 'http://invalid.com' }
    );
  }

  {
    const fakeBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfJ8AAAAASUVORK5CYII=',
      'base64'
    );
    const fetchSpy = stubSafeFetch(() => ({
      body: fakeBuffer,
      headers: {
        'content-type': 'image/png',
        'content-disposition': 'inline',
      },
    }));
    try {
      await assertAndSnapshot(
        `/api/worker/image-proxy?url=${imageUrl}`,
        'should return image buffer'
      );
    } finally {
      fetchSpy.restore();
    }
  }

  {
    const invalidImageUrl = `http://example.com/not-image-${Date.now()}.png`;
    const invalidFetchSpy = stubSafeFetch(() => ({
      body: 'not an image',
      headers: { 'content-type': 'image/png' },
    }));
    try {
      await t.context.app
        .GET(`/api/worker/image-proxy?url=${invalidImageUrl}`)
        .set('Origin', 'http://localhost:3010')
        .send()
        .expect(400);
    } finally {
      invalidFetchSpy.restore();
    }

    const validImageUrl = `http://example.com/valid-image-${Date.now()}.png`;
    const fakeBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfJ8AAAAASUVORK5CYII=',
      'base64'
    );
    const validFetchSpy = stubSafeFetch(() => ({
      body: fakeBuffer,
      headers: { 'content-type': 'image/png' },
    }));
    try {
      await t.context.app
        .GET(`/api/worker/image-proxy?url=${validImageUrl}`)
        .set('Origin', 'http://localhost:3010')
        .send()
        .expect(200);
    } finally {
      validFetchSpy.restore();
    }
  }
});

test('should preview link', async t => {
  const assertAndSnapshot = assertAndSnapshotRaw.bind(null, t);

  await assertAndSnapshot(
    '/api/worker/link-preview',
    'should return proper CORS headers on OPTIONS request',
    {
      status: 204,
      method: 'OPTIONS',
      checker: (res: Response) => {
        if (!res.headers['access-control-allow-methods']) {
          throw new Error('Missing CORS headers');
        }
      },
    }
  );

  await assertAndSnapshot(
    '/api/worker/link-preview',
    'should return 400 if request body is invalid',
    { status: 400, method: 'POST' }
  );

  await assertAndSnapshot(
    '/api/worker/link-preview',
    'should return 400 if origin and referer are missing',
    {
      status: 400,
      method: 'POST',
      origin: null,
      referer: null,
      body: { url: 'http://external.com/page' },
    }
  );

  await assertAndSnapshot(
    '/api/worker/link-preview',
    'should return 400 if provided URL is from the same origin',
    { status: 400, method: 'POST', body: { url: 'http://localhost/somepage' } }
  );

  {
    const pageUrl = `http://external.com/page-${Date.now()}`;
    const fakeHTML = `
        <html>
          <head>
            <meta property="og:title" content="Test Title" />
            <meta property="og:description" content="Test Description" />
            <meta property="og:image" content="http://example.com/image.png" />
          </head>
          <body>
            <title>Fallback Title</title>
          </body>
        </html>
      `;

    const fetchSpy = stubSafeFetch(request => {
      if (request.url.includes('/favicon.ico')) {
        return { status: 204, finalUrl: request.url };
      }
      return {
        body: fakeHTML,
        finalUrl: 'http://example.com/page',
        headers: { 'content-type': 'text/html;charset=UTF-8' },
      };
    });
    try {
      await assertAndSnapshot(
        '/api/worker/link-preview',
        'should process a valid external URL and return link preview data',
        {
          status: 200,
          method: 'POST',
          body: { url: pageUrl },
        }
      );
    } finally {
      fetchSpy.restore();
    }
  }

  {
    const encoded = [
      {
        content: 'xOO6w6OsysC956Gj',
        charset: 'gb2312',
      },
      {
        content: 'grGC8YLJgr+CzYFBkKKKRYFC',
        charset: 'shift-jis',
      },
      {
        content: 'p0GmbqFBpUCsyaFD',
        charset: 'big5',
      },
      {
        content: 'vsiz58fPvLy/5CwgvLyw6C4=',
        charset: 'euc-kr',
      },
    ];

    for (const { content, charset } of encoded) {
      const pageUrl = `http://example.com/${charset}-${Date.now()}`;
      const before = Buffer.from(`<html>
          <head>
            <meta http-equiv="Content-Type" content="text/html; charset=${charset}" />
            <meta property="og:title" content="`);
      const encoded = Buffer.from(content, 'base64');
      const after = Buffer.from(`" />
          </head>
        </html>
      `);
      const fakeHTML = Buffer.concat([before, encoded, after]);

      const fetchSpy = stubSafeFetch(request => {
        if (request.url.includes('/favicon.ico')) {
          return { status: 204, finalUrl: request.url };
        }
        return {
          body: fakeHTML,
          finalUrl: `http://example.com/${charset}`,
          headers: { 'content-type': `text/html;charset=${charset}` },
        };
      });
      try {
        await assertAndSnapshot(
          '/api/worker/link-preview',
          'should decode HTML content with charset',
          {
            status: 200,
            method: 'POST',
            body: { url: pageUrl },
          }
        );
      } finally {
        fetchSpy.restore();
      }
    }
  }
});
