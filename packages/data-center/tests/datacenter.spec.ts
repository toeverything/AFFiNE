import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('can init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();

  const workspace = await dataCenter.initWorkspace('test');
  expect(workspace).toBeTruthy();
});

test('should init error', async () => {
  const dataCenter = await getDataCenter();

  test.fail();
  await dataCenter.initWorkspace('test', 'not exist provider');
});

test('can init affine provider', async () => {
  const dataCenter = await getDataCenter();

  // TODO: set constant token for testing
  await dataCenter.setWorkspaceConfig('test', 'token', '');

  const workspace = await dataCenter.initWorkspace('test', 'affine');

  expect(workspace).toBeTruthy();
});
