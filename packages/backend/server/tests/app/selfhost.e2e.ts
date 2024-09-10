import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';

import { buildAppModule } from '../../src/app.module';
import { ServerService } from '../../src/core/config';
import { Config } from '../../src/fundamentals';
import { createTestingApp, initTestingDB } from '../utils';

const test = ava as TestFn<{
  app: INestApplication;
  db: PrismaClient;
}>;

function initTestStaticFiles(staticPath: string) {
  const files = {
    'selfhost/index.html': `<!DOCTYPE html><html><body>AFFiNE</body><script src="main.js"/></html>`,
    'selfhost/main.js': `const name = 'affine'`,
    'admin/selfhost/index.html': `<!DOCTYPE html><html><body>AFFiNE Admin</body><script src="/admin/main.js"/></html>`,
    'admin/selfhost/main.js': `const name = 'affine-admin'`,
  };

  for (const [filename, content] of Object.entries(files)) {
    const filePath = path.join(staticPath, filename);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }
}

test.before('init selfhost server', async t => {
  // @ts-expect-error override
  AFFiNE.isSelfhosted = true;
  const { app } = await createTestingApp({
    imports: [buildAppModule()],
  });

  t.context.app = app;
  t.context.db = t.context.app.get(PrismaClient);
  const config = app.get(Config);

  const staticPath = path.join(config.projectRoot, 'static');
  initTestStaticFiles(staticPath);
});

test.beforeEach(async t => {
  await initTestingDB(t.context.db);
  const server = t.context.app.get(ServerService);
  // @ts-expect-error disable cache
  server._initialized = false;
});

test.afterEach.always(async t => {
  await t.context.app.close();
});

test('do not allow visit index.html directly', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get('/index.html')
    .expect(302);

  t.is(res.header.location, '');

  res = await request(t.context.app.getHttpServer())
    .get('/admin/index.html')
    .expect(302);

  t.is(res.header.location, '/admin');
});

test('should always return static asset files', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get('/main.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/admin/main.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");

  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  res = await request(t.context.app.getHttpServer())
    .get('/main.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/admin/main.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");
});

test('should be able to call apis', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/info')
    .expect(200);

  t.is(res.body.flavor, 'allinone');
});

const blockedPages = [
  '/',
  '/workspace',
  '/admin',
  '/admin/',
  '/admin/accounts',
];

test('should redirect to setup if server is not initialized', async t => {
  for (const path of blockedPages) {
    const res = await request(t.context.app.getHttpServer()).get(path);

    t.is(res.status, 302, `Failed to redirect ${path}`);
    t.is(res.header.location, '/admin/setup');
  }

  t.pass();
});

test('should allow visiting all pages if initialized', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  for (const path of blockedPages) {
    const res = await request(t.context.app.getHttpServer()).get(path);

    t.is(res.status, 200, `Failed to visit ${path}`);
  }

  t.pass();
});

test('should allow visiting setup page if not initialized', async t => {
  const res = await request(t.context.app.getHttpServer())
    .get('/admin/setup')
    .expect(200);

  t.true(res.text.includes('AFFiNE Admin'));
});

test('should redirect to admin if initialized', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  const res = await request(t.context.app.getHttpServer())
    .get('/admin/setup')
    .expect(302);

  t.is(res.header.location, '/admin');
});
