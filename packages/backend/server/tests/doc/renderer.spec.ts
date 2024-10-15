import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { ServerService } from '../../src/core/config';
import { Config } from '../../src/fundamentals';
import { createTestingApp, initTestingDB } from '../utils';

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
  const { app } = await createTestingApp({
    imports: [AppModule],
  });

  t.context.app = app;
  t.context.db = t.context.app.get(PrismaClient);
  const config = app.get(Config);

  const staticPath = path.join(config.projectRoot, 'static');
  initTestStaticFiles(staticPath);
});

test.beforeEach(async t => {
  await initTestingDB(t.context.db);
  await t.context.db.user.create({
    data: { name: 'test', email: 'test@affine.pro' },
  });
  t.context.app.get(ServerService);
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
