import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';
import request from 'supertest';
import * as Y from 'yjs';

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
    'selfhost/index.html': `<!DOCTYPE html><html><body>AFFiNE</body><script src="main.js"/></html>`,
    'selfhost/main.js': `const name = 'affine'`,
    'admin/selfhost/index.html': `<!DOCTYPE html><html><body>AFFiNE Admin</body><script src="/admin/main.js"/></html>`,
    'admin/selfhost/main.js': `const name = 'affine-admin'`,
    'mobile/selfhost/index.html': `<!DOCTYPE html><html><body>AFFiNE Mobile</body><script src="main.js"/></html>`,
    'mobile/selfhost/main.js': `const name = 'affine-mobile'`,
    'mobile/selfhost/main.abcd.js': `const name = 'affine-mobile-abcd'`,
    'mobile/selfhost/main.css': `body { background-color: red; }`,
    'mobile/selfhost/assets-manifest.json': JSON.stringify({
      js: ['/mobile/main.abcd.js'],
      css: ['/mobile/main.abcd.css'],
      publicPath: '/mobile/',
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
    .get('/mobile/main.js')
    .expect(200);
  t.is(res.text, "const name = 'affine-mobile'");

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

test('doc renderer should return mobile assets for mobile user agent', async t => {
  let res = await request(t.context.app.getHttpServer())
    .get(
      '/workspace/3aa2e665-7b0d-41c6-9979-db17c8d93836/Sabgfj_trVBY6_iM_6uaO'
    )
    .set('User-Agent', mobileUAString)
    .expect(200);

  t.true(res.text.includes('AFFiNE Mobile'));

  res = await request(t.context.app.getHttpServer())
    .get(
      '/workspace/3aa2e665-7b0d-41c6-9979-db17c8d93836/Sabgfj_trVBY6_iM_6uaO'
    )
    .expect(200);

  t.false(res.text.includes('AFFiNE Mobile'));
  t.true(res.text.includes('AFFiNE'));
});

test('doc renderer should return mobile assets defined in assets-manifest.json for mobile user agent', async t => {
  await t.context.db.workspacePage.create({
    data: {
      workspace: {
        create: {
          id: '3aa2e665-7b0d-41c6-9979-db17c8d93836',
          public: true,
        },
      },
      pageId: 'Sabgfj_trVBY6_iM_6uaO',
      public: true,
    },
  });
  const doc = createEmptyPage();
  const update = Y.encodeStateAsUpdate(doc);

  await t.context.db.update.createMany({
    data: [
      {
        id: 'Sabgfj_trVBY6_iM_6uaO',
        workspaceId: '3aa2e665-7b0d-41c6-9979-db17c8d93836',
        blob: Buffer.from(update),
        seq: 1,
        createdAt: new Date(Date.now() + 1),
        createdBy: null,
      },
    ],
  });

  const res = await request(t.context.app.getHttpServer())
    .get(
      '/workspace/3aa2e665-7b0d-41c6-9979-db17c8d93836/Sabgfj_trVBY6_iM_6uaO'
    )
    .set('User-Agent', mobileUAString)
    .expect(200);

  t.true(res.text.includes('New Page | AFFiNE'));
  t.true(res.text.includes('/mobile/main.abcd.js'));
  t.true(res.text.includes('/mobile/main.abcd.css'));
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

function createEmptyPage() {
  const doc = new Y.Doc();

  const blocks = doc.getMap<Y.Map<Y.Map<any>>>('blocks');
  doc.share.set('blocks', blocks as any);

  const rootBlock = new Y.Map<any>();
  blocks.set('root', rootBlock);
  rootBlock.set('type', 'block');
  rootBlock.set('sys:flavour', 'affine:page');
  rootBlock.set('prop:title', 'New Page');

  return doc;
}
