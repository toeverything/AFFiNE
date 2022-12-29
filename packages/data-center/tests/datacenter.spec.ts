import { test, expect } from '@playwright/test';
import { Workspace } from '@blocksuite/store';

import { getDataCenter } from './utils.js';

import 'fake-indexeddb/auto';

test('can init data center', async () => {
  const dataCenter = await getDataCenter();
  expect(dataCenter).toBeTruthy();

  const workspace = await dataCenter.initWorkspace(
    'test',
    new Workspace({
      room: 'test',
    })
  );
  expect(workspace).toBeTruthy();
});
