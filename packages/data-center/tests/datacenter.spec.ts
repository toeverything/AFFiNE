import { test, expect } from '@playwright/test';
import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('can init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();

  const workspace = await dataCenter.getWorkspace('test');
  expect(workspace).toBeTruthy();
});
