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
  await dataCenter.setWorkspaceConfig(
    '6',
    'token',
    'Zzq338Py_3veZwD4XTa0nyoDGsLqhd9nFeaT1p_SK43TAOCSkcV63Tn3kDUWfBI4JHKqX7mhED4IFejm_62KUpGXRWZv11c5BGay7Nhvb_br'
  );

  const workspace = await dataCenter.initWorkspace('6', 'affine');

  expect(workspace).toBeTruthy();
});
