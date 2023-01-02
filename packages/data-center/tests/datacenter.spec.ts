import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();

  const workspace = await dataCenter.initWorkspace('test');
  expect(workspace).toBeTruthy();
});

test('should init error with unknown provider', async () => {
  const dataCenter = await getDataCenter();

  test.fail();
  await dataCenter.initWorkspace('test', 'not exist provider');
});

test.skip('init affine provider', async () => {
  const dataCenter = await getDataCenter();

  // TODO: set constant token for testing
  await dataCenter.setWorkspaceConfig('6', 'token', 'YOUR_TOKEN');

  const workspace = await dataCenter.initWorkspace('6', 'affine');

  expect(workspace).toBeTruthy();
});

test('list workspaces', async () => {
  const dataCenter = await getDataCenter();

  await Promise.all([
    dataCenter.initWorkspace('test1'),
    dataCenter.initWorkspace('test2'),
    dataCenter.initWorkspace('test3'),
    dataCenter.initWorkspace('test4'),
  ]);

  expect(await dataCenter.getWorkspaceList()).toStrictEqual([
    'test1',
    'test2',
    'test3',
    'test4',
  ]);
});
