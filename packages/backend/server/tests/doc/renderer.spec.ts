import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { DocRendererModule } from '../../src/core/doc-renderer';
import { createTestingApp } from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
  db: PrismaClient;
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

test.before('init selfhost server', async t => {
  const staticPath = path.join(
    fileURLToPath(import.meta.url),
    '../../../static'
  );
  initTestStaticFiles(staticPath);

  const { app } = await createTestingApp({
    imports: [DocRendererModule],
  });

  t.context.app = app;
  t.context.db = t.context.app.get(PrismaClient);
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
      `<script src="https://app.affine.pro/main.a.js"></script>`
    )
  );
});

test('should render correct mobile html', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/workspace/xxxx/xxx')
    .set('user-agent', mobileUAString)
    .expect(200);

  t.true(
    res.text.includes(
      `<script src="https://app.affine.pro/main.c.js"></script>`
    )
  );
});

test.todo('should render correct page preview');
