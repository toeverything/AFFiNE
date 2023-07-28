import userA from '@affine-test/fixtures/userA.json';
import { test } from '@affine-test/kit/playwright';
import { hash } from '@node-rs/argon2';
import { expect } from '@playwright/test';

async function flushDB() {
  const {
    PrismaClient,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
  } = require('../../../apps/server/node_modules/@prisma/client');
  const client = new PrismaClient();
  await client.$connect();
  const result: { tablename: string }[] =
    await client.$queryRaw`SELECT tablename
                           FROM pg_catalog.pg_tables
                           WHERE schemaname != 'pg_catalog'
                             AND schemaname != 'information_schema'`;
  // remove all table data
  await client.$executeRawUnsafe(
    `TRUNCATE TABLE ${result
      .map(({ tablename }) => tablename)
      .filter(name => !name.includes('migrations'))
      .join(', ')}`
  );
  await client.user.create({
    data: {
      ...userA,
      password: await hash(userA.password),
    },
  });
  await client.$disconnect();
}

test.beforeEach(async () => {
  await flushDB();
});

test('server exist', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  const json = await (await fetch('http://localhost:3010')).json();
  expect(json.message).toMatch(/^AFFiNE GraphQL server/);
});

test.fixme('login', async ({ page, context }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  await page.getByText('Demo Workspace').click();
  await page.getByText('Sign in AFFiNE Cloud').click();
  await page.getByPlaceholder('torvalds@osdl.org').fill(userA.email);
  await page.getByLabel('Password').fill(userA.password);
  await page.getByText('Sign in with Password').click();
  await page.getByText('Demo Workspace').click();
  expect(
    (await context.cookies()).find(c => c.name === 'next-auth.session-token')
  ).toBeTruthy();
});

test.fixme('enable cloud', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  await page.getByText('Demo Workspace').click();
  await page.getByText('Sign in AFFiNE Cloud').click();
  await page.getByPlaceholder('torvalds@osdl.org').fill(userA.email);
  await page.getByLabel('Password').fill(userA.password);
  await page.getByText('Sign in with Password').click();
  await page.waitForTimeout(1000);
  await page.getByText('Demo Workspace').click();
  await page.getByTestId('new-workspace').click({
    timeout: 10000,
  });
  await page.getByTestId('create-workspace-input').type('Test Cloud');
  await page.getByTestId('create-workspace-create-button').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('current-workspace-label').click();
  await page.waitForTimeout(1000);
  await page.getByTestId('publish-enable-affine-cloud-button').click();
  await page.getByTestId('confirm-enable-affine-cloud-button').click();
  await page.waitForTimeout(10000);
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Test Cloud'
  );
  expect(await page.getByTestId('workspace-flavour').textContent()).toBe(
    'AFFiNE Cloud'
  );
});
