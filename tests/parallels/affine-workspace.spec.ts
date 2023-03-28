import { expect } from '@playwright/test';

import { waitMarkdownImported } from '../libs/page-logic';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const userA = require('../fixtures/userA.json');
import { test } from '../libs/playwright';
import { clickCollaborationPanel } from '../libs/setting';
import {
  clickNewPageButton,
  clickSideBarAllPageButton,
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '../libs/sidebar';
import { createFakeUser, loginUser, openHomePage } from '../libs/utils';
import {
  assertCurrentWorkspaceFlavour,
  createWorkspace,
} from '../libs/workspace';

test.describe('affine workspace', () => {
  test('should login with user A', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const [a] = await createFakeUser();
    await loginUser(page, a);
    await clickSideBarCurrentWorkspaceBanner(page);
    const footer = page.locator('[data-testid="workspace-list-modal-footer"]');
    expect(await footer.getByText(userA.name).isVisible()).toBe(true);
    expect(await footer.getByText(userA.email).isVisible()).toBe(true);
    await assertCurrentWorkspaceFlavour('local', page);
  });

  test('should enable affine workspace successfully', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const [a] = await createFakeUser();
    await loginUser(page, a);
    const name = `test-${Date.now()}`;
    await createWorkspace({ name }, page);
    await page.waitForTimeout(50);
    await clickSideBarSettingButton(page);
    await page.waitForTimeout(50);
    await clickCollaborationPanel(page);
    await page.getByTestId('local-workspace-enable-cloud-button').click();
    await page.getByTestId('confirm-enable-cloud-button').click();
    await page.waitForSelector("[data-testid='member-length']", {
      timeout: 10000,
    });
    await clickSideBarAllPageButton(page);
    await clickNewPageButton(page);
    await page.locator('[data-block-is-title="true"]').type('Hello, world!', {
      delay: 50,
    });
    await assertCurrentWorkspaceFlavour('affine', page);
  });
});
