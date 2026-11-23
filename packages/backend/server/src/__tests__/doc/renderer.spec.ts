import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Package } from '@affine-tools/utils/workspace';
import type { INestApplication } from '@nestjs/common';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { createTestingApp } from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
}>;

const mobileUAString =
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function initTestStaticFiles(staticPath: string) {
  const files = {
    'main.a.js': `const name = 'affine'`,
    'assets-manifest.json': JSON.stringify({
      js: ['main.a.js'],
      css: [],
      publicPath: 'https://app.affine.pro/',
      gitHash: '',
      description: '',
    }),
    'admin/main.b.js': `const name = 'affine-admin'`,
    'mobile/main.c.js': `const name = 'affine-mobile'`,
    'mobile/assets-manifest.json': JSON.stringify({
      js: ['main.c.js'],
      css: [],
      publicPath: 'https://app.affine.pro/',
      gitHash: '',
      description: '',
    }),
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(staticPath, filename);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

test.before(async t => {
  const staticPath = new Package('@affine/server').join('static').value;
  initTestStaticFiles(staticPath);

  const app = await createTestingApp();

  t.context.app = app;
});

test.after.always(async t => {
  await t.context.app.close();
});

test('should render correct html', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/workspace/xxxx/xxx')
    .expect(200);

  t.true(
    res.text.includes(
      `<script src="https://app.affine.pro/main.a.js" crossorigin></script>`
    )
  );
});

// TODO(@forehalo): enable it when mobile version is ready
test.skip('should render correct mobile html', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/workspace/xxxx/xxx')
    .set('user-agent', mobileUAString)
    .expect(200);

  t.true(
    res.text.includes(
      `<script src="https://app.affine.pro/main.c.js" crossorigin></script>`
    )
  );
});

test.todo('should render correct page preview');
