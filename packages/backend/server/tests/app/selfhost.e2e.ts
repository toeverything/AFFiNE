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

const mobileUAString =
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function initTestStaticFiles(staticPath: string) {
  const files = {
    'selfhost.html': `<!DOCTYPE html><html><body>AFFiNE</body><script src="main.a.js"/></html>`,
    'main.a.js': `const name = 'affine'`,
    'admin/selfhost.html': `<!DOCTYPE html><html><body>AFFiNE Admin</body><script src="/admin/main.b.js"/></html>`,
    'admin/main.b.js': `const name = 'affine-admin'`,
    'mobile/selfhost.html': `<!DOCTYPE html><html><body>AFFiNE mobile</body><script src="/mobile/main.c.js"/></html>`,
    'mobile/main.c.js': `const name = 'affine-mobile'`,
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
  AFFiNE.flavor.renderer = true;
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

test.after.always(async t => {
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

  res = await request(t.context.app.getHttpServer())
    .get('/mobile/index.html')
    .expect(302);
});

test('should always return static asset files', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get('/main.a.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/test-@b.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");

  res = await request(t.context.app.getHttpServer())
    .get('/main.c.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-mobile'");

  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  res = await request(t.context.app.getHttpServer())
    .get('/main.a.js')
    .expect(200);
  t.is(res.text, "const name = 'affine'");

  res = await request(t.context.app.getHttpServer())
    .get('/main.b.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-admin'");

  res = await request(t.context.app.getHttpServer())
    .get('/main.c.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-mobile'");
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

test('should return mobile assets if visited by mobile', async t => {
  await t.context.db.user.create({
    data: {
      name: 'test',
      email: 'test@affine.pro',
    },
  });

  const res = await request(t.context.app.getHttpServer())
    .get('/')
    .set('user-agent', mobileUAString)
    .expect(200);

  t.true(res.text.includes('AFFiNE mobile'));
});
