import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  loginUser,
  runPrisma,
} from '@affine-test/kit/utils/cloud';
import {
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
});

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test('newly created page shows empty history', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);

  // click the history button
  await page.getByTestId('header-dropDownButton').click();
  await page.getByTestId('editor-option-menu-history').click();

  const modal = page.getByTestId('page-history-modal');

  // expect history modal shown up
  await expect(modal).toBeVisible();

  await expect(page.getByTestId('empty-history-prompt')).toBeVisible();
});

const pushCurrentPageUpdates = async (page: Page) => {
  const [workspaceId, guid, updates, state] = await page.evaluate(() => {
    // @ts-expect-error
    const Y = window.Y;
    // @ts-expect-error
    const spaceDoc = window.currentEditor.page.spaceDoc;
    // @ts-expect-error
    const workspaceId: string = window.currentWorkspace.id;
    const updates: Uint8Array = Y.encodeStateAsUpdate(spaceDoc);
    const state: Uint8Array = Y.encodeStateVector(spaceDoc);

    return [workspaceId, spaceDoc.guid, [...updates], [...state]] as const;
  });

  const toBuffer = (arr: readonly number[]) => Buffer.from(arr);

  await runPrisma(async client => {
    await client.snapshotHistory.create({
      data: {
        workspaceId: workspaceId,
        id: guid,
        blob: toBuffer(updates),
        state: toBuffer(state),
        timestamp: new Date(Date.now() - 10000),
        expiredAt: new Date(Date.now() + 100000),
      },
    });
  });
};

test('can restore page to a history version', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);

  await pushCurrentPageUpdates(page);

  const title = getBlockSuiteEditorTitle(page);

  await title.focus();

  await title.pressSequentially('TEST TITLE', {
    delay: 50,
  });

  // write something and push to history
  await pushCurrentPageUpdates(page);

  await title.selectText();

  await title.press('Backspace');

  await title.pressSequentially('New Title', {
    delay: 50,
  });

  // click the history button
  await page.getByTestId('header-dropDownButton').click();
  await page.getByTestId('editor-option-menu-history').click();

  const modal = page.getByTestId('page-history-modal');

  // expect history modal shown up
  await expect(modal).toBeVisible();

  // expect history list to have 2 items
  await expect(modal.getByTestId('version-history-item')).toHaveCount(2);

  // check the first item in the preview should have title 'TEST TITLE'
  await expect(modal.locator('[data-block-is-title]')).toHaveText('TEST TITLE');

  // click restore
  await modal
    .getByRole('button', {
      name: 'Restore current version',
    })
    .click();

  const confirm = page.getByTestId('confirm-restore-history-modal');

  // expect confirm dialog to show up
  await expect(confirm).toBeVisible();

  // click restore
  await confirm
    .getByRole('button', {
      name: 'Restore',
    })
    .click();

  // title should be restored to 'TEST TITLE'
  await expect(title).toContainText('TEST TITLE');
});

test('empty history doc should not show starter bar', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace({ name: 'test' }, page);
  await enableCloudWorkspace(page);

  await pushCurrentPageUpdates(page);

  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await title.pressSequentially('TEST TITLE', {
    delay: 50,
  });
  // write something and push to history
  await pushCurrentPageUpdates(page);

  // click the history button
  await page.getByTestId('header-dropDownButton').click();
  await page.getByTestId('editor-option-menu-history').click();

  const modal = page.getByTestId('page-history-modal');

  // expect history modal shown up
  await expect(modal).toBeVisible();

  const aiBadge = modal.getByTestId('start-with-ai-badge');
  await expect(aiBadge).not.toBeVisible();
});
