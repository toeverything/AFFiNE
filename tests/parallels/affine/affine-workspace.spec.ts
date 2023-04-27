import { expect } from '@playwright/test';

import { openHomePage } from '../../libs/load-page';
import { waitMarkdownImported } from '../../libs/page-logic';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const userA = require('../../fixtures/userA.json');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userB = require('../../fixtures/userB.json');
import { test } from '@affine-test/kit/playwright';

import {
  clickNewPageButton,
  clickSideBarCurrentWorkspaceBanner,
} from '../../libs/sidebar';
import { createFakeUser, loginUser } from '../../libs/utils';
import {
  assertCurrentWorkspaceFlavour,
  createWorkspace,
  enableAffineCloudWorkspace,
  openWorkspaceListModal,
} from '../../libs/workspace';

test('should login with user A', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const [a] = await createFakeUser(userA, userB);
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
  await enableAffineCloudWorkspace(page);
  await clickNewPageButton(page);
  await page.locator('[data-block-is-title="true"]').type('Hello, world!', {
    delay: 50,
  });
  await assertCurrentWorkspaceFlavour('affine', page);
  await openWorkspaceListModal(page);
  await page.getByTestId('workspace-list-modal-sign-out').click();
  await page.waitForTimeout(1000);
  await assertCurrentWorkspaceFlavour('local', page);
});
