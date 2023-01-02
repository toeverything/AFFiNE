import { test, expect } from '@playwright/test';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();
  await dataCenter.clearWorkspaces();

  const workspace = await dataCenter.getWorkspace('test1');
  expect(workspace).toBeTruthy();
});

test('should init error with unknown provider', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  test.fail();
  await dataCenter.getWorkspace('test2', 'not exist provider');
});

test.skip('init affine provider', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  // TODO: set constant token for testing
  await dataCenter.setWorkspaceConfig('6', 'token', 'YOUR_TOKEN');

  const workspace = await dataCenter.getWorkspace('6', 'affine');

  expect(workspace).toBeTruthy();
});

test('list workspaces', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  await Promise.all([
    dataCenter.getWorkspace('test3'),
    dataCenter.getWorkspace('test4'),
    dataCenter.getWorkspace('test5'),
    dataCenter.getWorkspace('test6'),
  ]);

  expect(await dataCenter.listWorkspace()).toStrictEqual([
    'test3',
    'test4',
    'test5',
    'test6',
  ]);
});

test('remove workspaces', async () => {
  const dataCenter = await getDataCenter();
  await dataCenter.clearWorkspaces();

  await Promise.all([
    dataCenter.getWorkspace('test7'),
    dataCenter.getWorkspace('test8'),
  ]);

  await dataCenter.removeWorkspace('test7');

  expect(await dataCenter.listWorkspace()).toStrictEqual(['test8']);
});
