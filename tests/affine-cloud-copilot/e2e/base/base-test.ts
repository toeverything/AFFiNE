// oxlint-disable no-empty-pattern
import { skipOnboarding, test as base } from '@affine-test/kit/playwright';
import {
  createRandomAIUser,
  enableCloudWorkspace,
  loginUserDirectly,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import type { Page } from '@playwright/test';

import { ChatPanelUtils } from '../utils/chat-panel-utils';
import { EditorUtils } from '../utils/editor-utils';
import { SettingsPanelUtils } from '../utils/settings-panel-utils';
import { TestUtils } from '../utils/test-utils';

interface TestUtilsFixtures {
  utils: {
    testUtils: TestUtils;
    chatPanel: typeof ChatPanelUtils;
    editor: typeof EditorUtils;
    settings: typeof SettingsPanelUtils;
  };
  loggedInPage: Page;
}

export const test = base.extend<TestUtilsFixtures>({
  utils: async ({}, use) => {
    const testUtils = TestUtils.getInstance();
    await use({
      testUtils,
      chatPanel: ChatPanelUtils,
      editor: EditorUtils,
      settings: SettingsPanelUtils,
    });
  },
  loggedInPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const page = await context.newPage();
    await page.goto('http://localhost:8080/', { timeout: 240 * 1000 });
    const user = await createRandomAIUser();
    await page.getByTestId('sidebar-user-avatar').click({
      delay: 200,
      timeout: 20 * 1000,
    });
    await loginUserDirectly(page, user);
    await openHomePage(page);
    await enableCloudWorkspace(page);
    await use(page);
    await context.close();
  },
});

export type TestFixtures = typeof test;
