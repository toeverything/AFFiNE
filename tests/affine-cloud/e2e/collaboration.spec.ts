import { test } from '@affine-test/kit/playwright';
import {
  addUserToWorkspace,
  createRandomUser,
  enableCloudWorkspace,
  enableCloudWorkspaceFromShareButton,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { dropFile } from '@affine-test/kit/utils/drop-file';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  clickUserInfoCard,
  openSettingModal,
  openWorkspaceSettingPanel,
} from '@affine-test/kit/utils/setting';
import {
  clickSideBarAllPageButton,
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async () => {
  user = await createRandomUser();
});

test.beforeEach(async ({ page }) => {
  await loginUser(page, user.email);
});

test.describe('collaboration', () => {
  test('can enable share page', async ({ page, browser }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspaceFromShareButton(page);
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('TEST TITLE', {
      delay: 50,
    });
    await page.keyboard.press('Enter', { delay: 50 });
    await page.keyboard.type('TEST CONTENT', { delay: 50 });
    await page.getByTestId('cloud-share-menu-button').click();
    await page.getByTestId('share-menu-create-link-button').click();
    await page.getByTestId('share-menu-copy-link-button').click();

    // check share page is accessible
    {
      const context = await browser.newContext();
      const url: string = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      const page2 = await context.newPage();
      await page2.goto(url);
      await waitForEditorLoad(page2);
      const title = getBlockSuiteEditorTitle(page2);
      expect(await title.innerText()).toBe('TEST TITLE');
      expect(await page2.textContent('affine-paragraph')).toContain(
        'TEST CONTENT'
      );
    }
  });

  test('share page with default edgeless', async ({ page, browser }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspaceFromShareButton(page);
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('TEST TITLE', {
      delay: 50,
    });
    await page.keyboard.press('Enter', { delay: 50 });
    await page.keyboard.type('TEST CONTENT', { delay: 50 });
    await clickEdgelessModeButton(page);
    await expect(page.locator('affine-edgeless-page')).toBeVisible({
      timeout: 1000,
    });
    await page.getByTestId('cloud-share-menu-button').click();
    await page.getByTestId('share-menu-create-link-button').click();
    await page.getByTestId('share-menu-copy-link-button').click();

    // check share page is accessible
    {
      const context = await browser.newContext();
      const url: string = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      const page2 = await context.newPage();
      await page2.goto(url);
      await waitForEditorLoad(page2);
      await expect(page.locator('affine-edgeless-page')).toBeVisible({
        timeout: 1000,
      });
      expect(await page2.textContent('affine-paragraph')).toContain(
        'TEST CONTENT'
      );
      const logo = page2.getByTestId('share-page-logo');
      const editButton = page2.getByTestId('share-page-edit-button');
      await expect(editButton).not.toBeVisible();
      await expect(logo).toBeVisible();
    }
  });

  test('can collaborate with other user and name should display when editing', async ({
    page,
    browser,
  }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await clickNewPageButton(page);
    const currentUrl = page.url();
    // format: http://localhost:8080/workspace/${workspaceId}/xxx
    const workspaceId = currentUrl.split('/')[4];
    const userB = await createRandomUser();
    const context = await browser.newContext();
    const page2 = await context.newPage();
    await loginUser(page2, userB.email);
    await addUserToWorkspace(workspaceId, userB.id, 1 /* READ */);
    await page2.reload();
    await waitForEditorLoad(page2);
    await page2.goto(currentUrl);
    {
      const title = getBlockSuiteEditorTitle(page);
      await title.pressSequentially('TEST TITLE', {
        delay: 50,
      });
    }
    await page2.waitForTimeout(200);
    {
      const title = getBlockSuiteEditorTitle(page2);
      expect(await title.innerText()).toBe('TEST TITLE');
      const typingPromise = Promise.all([
        page.keyboard.press('Enter', { delay: 50 }),
        page.keyboard.type('TEST CONTENT', { delay: 50 }),
      ]);
      // username should be visible when editing
      await expect(page2.getByText(user.name)).toBeVisible();
      await typingPromise;
    }

    // change username
    await clickSideBarSettingButton(page);
    await clickUserInfoCard(page);
    const input = page.getByTestId('user-name-input');
    await input.clear();
    await input.pressSequentially('TEST USER', {
      delay: 50,
    });
    await page.getByTestId('save-user-name').click({
      delay: 50,
    });
    await page.keyboard.press('Escape', {
      delay: 50,
    });
    const title = getBlockSuiteEditorTitle(page);
    await title.focus();

    {
      await expect(page2.getByText('TEST USER')).toBeVisible({
        timeout: 2000,
      });
    }
  });

  test('can sync collections between different browser', async ({
    page,
    browser,
  }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await page.getByTestId('slider-bar-add-collection-button').click();
    const title = page.getByTestId('input-collection-title');
    await title.isVisible();
    await title.fill('test collection');
    await page.getByTestId('save-collection').click();

    {
      const context = await browser.newContext();
      const page2 = await context.newPage();
      await loginUser(page2, user.email);
      await page2.goto(page.url());
      const collections = page2.getByTestId('collections');
      await expect(collections.getByText('test collection')).toBeVisible();
    }
  });

  test('exit successfully and re-login', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    const url = page.url();
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await clickSideBarSettingButton(page);
    await clickUserInfoCard(page);
    await page.getByTestId('sign-out-button').click();
    await page.getByTestId('confirm-sign-out-button').click();
    await page.waitForTimeout(5000);
    expect(page.url()).toBe(url);
  });
});

test.describe('collaboration members', () => {
  test('should have pagination in member list', async ({ page }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await clickNewPageButton(page);
    const currentUrl = page.url();
    // format: http://localhost:8080/workspace/${workspaceId}/xxx
    const workspaceId = currentUrl.split('/')[4];

    // create 10 user and add to workspace
    const createUserAndAddToWorkspace = async () => {
      const userB = await createRandomUser();
      await addUserToWorkspace(workspaceId, userB.id, 1 /* READ */);
    };
    await Promise.all(
      new Array(10).fill(1).map(() => createUserAndAddToWorkspace())
    );

    await openSettingModal(page);
    await openWorkspaceSettingPanel(page, 'test');

    await page.waitForTimeout(1000);

    const firstPageMemberItemCount = await page
      .locator('[data-testid="member-item"]')
      .count();

    expect(firstPageMemberItemCount).toBe(8);

    const navigationItems = await page
      .getByRole('navigation')
      .getByRole('button')
      .all();

    // make sure the first member is the owner
    await expect(page.getByTestId('member-item').first()).toContainText(
      'Workspace Owner'
    );

    // There have four pagination items: < 1 2 >
    expect(navigationItems.length).toBe(4);
    // Click second page
    await navigationItems[2].click();
    await page.waitForTimeout(500);
    // There should have other three members in second page
    const secondPageMemberItemCount = await page
      .locator('[data-testid="member-item"]')
      .count();
    expect(secondPageMemberItemCount).toBe(3);
    // Click left arrow to back to first page
    await navigationItems[0].click();
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="member-item"]').count()).toBe(8);
    // Click right arrow to second page
    await navigationItems[3].click();
    await page.waitForTimeout(500);
    expect(await page.locator('[data-testid="member-item"]').count()).toBe(3);
  });
});

test.describe('sign out', () => {
  test('can sign out', async ({ page }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await clickSideBarAllPageButton(page);
    const currentUrl = page.url();
    await clickSideBarCurrentWorkspaceBanner(page);
    await page.getByTestId('workspace-modal-account-option').click();
    await page.getByTestId('workspace-modal-sign-out-option').click();
    await page.getByTestId('confirm-sign-out-button').click();
    await clickSideBarCurrentWorkspaceBanner(page);
    const signInButton = page.getByTestId('cloud-signin-button');
    await expect(signInButton).toBeVisible();
    expect(page.url()).toBe(currentUrl);
  });
});

test('can sync svg between different browsers', async ({ page, browser }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);

  // drop an svg file
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
    <rect x="0" y="0" width="200" height="200" fill="red" />
  </svg>`;

  await dropFile(page, 'affine-paragraph', svg, 'test.svg', 'image/svg+xml');

  {
    const context = await browser.newContext();
    const page2 = await context.newPage();
    await loginUser(page2, user.email);
    await page2.goto(page.url());

    // the user should see the svg
    // get the image src under "affine-image img"
    const src = await page2.locator('affine-image img').getAttribute('src');

    expect(src).not.toBeNull();

    // fetch the src resource in the browser
    const svg2 = await page2.evaluate(async src => {
      async function blobToString(blob: Blob) {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsText(blob);
        });
      }

      const blob = fetch(src!).then(res => res.blob());
      return blobToString(await blob);
    }, src);

    // turn the blob into string and check if it contains the svg
    expect(svg2).toContain(svg);
  }
});
