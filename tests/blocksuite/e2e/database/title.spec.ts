import { expect } from '@playwright/test';

import {
  enterPlaygroundRoom,
  initDatabaseDynamicRowWithData,
  initEmptyDatabaseState,
} from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';
import { press } from './actions.js';

test.describe('title', () => {
  test('should able to link doc by press @', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await press(page, '@');
    await expect(page.locator('.linked-doc-popover')).toBeVisible();
  });
});
